import { extendedApi } from '../api/ExtendedApiClient';
import { useOrderStore, useMarketStore } from '../store';
import { createSignedOrder, getPublicKey, grindKey } from '../signing/orderSigning';
import { DEFAULT_CONFIG } from '../config';
import type { ExtendedConfig } from '../config';
import type {
    CreateOrderRequest,
    OrderSide,
    OrderType,
    TimeInForce,
    TriggerPriceType,
    TriggerDirection,
    ExecutionPriceType,
    Market,
} from '../types';

interface OrderParams {
    market: string;
    side: OrderSide;
    type: OrderType;
    size: string;
    price?: string;
    leverage?: string;
    reduceOnly?: boolean;
    postOnly?: boolean;
    timeInForce?: TimeInForce;
    expirationDays?: number;
    takeProfit?: {
        triggerPrice: string;
        triggerPriceType?: TriggerPriceType;
        price?: string;
        priceType?: ExecutionPriceType;
    };
    stopLoss?: {
        triggerPrice: string;
        triggerPriceType?: TriggerPriceType;
        price?: string;
        priceType?: ExecutionPriceType;
    };
    trigger?: {
        triggerPrice: string;
        triggerPriceType?: TriggerPriceType;
        direction: TriggerDirection;
        executionPriceType?: ExecutionPriceType;
    };
}

interface SignedOrder {
    signature: { r: string; s: string };
    starkKey: string;
    collateralPosition: string;
    nonce: string;
}

/**
 * Order Service
 * Handles order creation, signing, and submission
 */
export class OrderService {
    private starkPrivateKey: string | null = null;
    private starkPublicKey: string | null = null;
    private collateralPosition: string | null = null;
    private config: ExtendedConfig = DEFAULT_CONFIG;
    private marketCache: Map<string, Market> = new Map();

    setCredentials(privateKey: string, publicKey: string, position: string) {
        this.starkPrivateKey = privateKey;
        this.starkPublicKey = publicKey;
        this.collateralPosition = position;
    }

    /**
     * Derive Stark keys from signature
     */
    deriveKeysFromSignature(signature: string): { privateKey: string; publicKey: string } {
        const r = signature.slice(2, 66);
        const privateKey = '0x' + grindKey(r);
        const publicKey = getPublicKey(privateKey);
        return { privateKey, publicKey };
    }

    setConfig(config: ExtendedConfig) {
        this.config = config;
    }

    /**
     * Get market info (cached)
     */
    async getMarketInfo(marketName: string): Promise<Market> {
        if (this.marketCache.has(marketName)) {
            return this.marketCache.get(marketName)!;
        }
        const markets = await extendedApi.getMarkets([marketName]);
        if (markets.length > 0) {
            this.marketCache.set(marketName, markets[0]);
            return markets[0];
        }
        throw new Error(`Market ${marketName} not found`);
    }

    /**
     * Calculate market order price based on current BBO
     * Market Buy: Best Ask × 1.0075
     * Market Sell: Best Bid × 0.9925
     */
    calculateMarketOrderPrice(side: OrderSide): string {
        const orderBook = useMarketStore.getState().orderBook;
        if (!orderBook) {
            throw new Error('Order book not available');
        }

        if (side === 'BUY') {
            const bestAsk = orderBook.asks[0]?.price;
            if (!bestAsk) throw new Error('No ask price available');
            return (parseFloat(bestAsk) * 1.0075).toFixed(6);
        } else {
            const bestBid = orderBook.bids[0]?.price;
            if (!bestBid) throw new Error('No bid price available');
            return (parseFloat(bestBid) * 0.9925).toFixed(6);
        }
    }

    /**
     * Generate unique external order ID
     */
    generateExternalId(): string {
        return `exo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate nonce for order signing
     */
    generateNonce(): number {
        // Nonce must be >= 1 and <= 2^31
        return Math.floor(Math.random() * 2147483647 + 1);
    }

    /**
     * Calculate expiration timestamp in seconds
     * Default: 90 days for mainnet, 28 days for testnet
     */
    calculateExpirationSeconds(days: number = 90): number {
        // Add 14 day buffer as per Extended SDK
        return Math.ceil((Date.now() + (days + 14) * 24 * 60 * 60 * 1000) / 1000);
    }

    /**
     * Sign order using Stark private key
     */
    async signOrder(
        market: Market,
        side: OrderSide,
        size: string,
        price: string,
        feeRate: string,
        builderFee?: string
    ): Promise<SignedOrder> {
        if (!this.starkPrivateKey || !this.starkPublicKey || !this.collateralPosition) {
            throw new Error('Stark credentials not set. Please complete onboarding first.');
        }

        const nonce = this.generateNonce();
        const expirationSeconds = this.calculateExpirationSeconds();

        // Use the signing module
        const { signature } = createSignedOrder(
            this.starkPrivateKey,
            this.starkPublicKey,
            {
                market: market.name,
                side,
                syntheticAmount: size,
                price,
                feeRate,
                builderFee,
                nonce,
                expirationSeconds,
                positionId: parseInt(this.collateralPosition),
                syntheticAssetId: '0x1', // Base asset ID
                collateralAssetId: this.config.collateralAssetId,
                syntheticDecimals: market.assetPrecision,
                collateralDecimals: this.config.collateralDecimals,
            },
            this.config
        );

        return {
            signature,
            starkKey: this.starkPublicKey,
            collateralPosition: this.collateralPosition,
            nonce: nonce.toString(),
        };
    }

    /**
     * Create and submit an order
     * This calls the serverless proxy which injects the builder code
     */
    async createOrder(params: OrderParams): Promise<{ orderId: number; externalId: string }> {
        const externalId = this.generateExternalId();

        // Get market info
        const market = await this.getMarketInfo(params.market);

        // Get fee rate for the market
        const fees = await extendedApi.getFees(params.market);
        const feeRate = params.postOnly
            ? fees[0]?.makerFeeRate || '0'
            : fees[0]?.takerFeeRate || '0.00025';

        // Calculate price for market orders
        let price = params.price;
        if (params.type === 'MARKET' || !price) {
            price = this.calculateMarketOrderPrice(params.side);
        }

        // Sign the order first (this generates nonce internally)
        const signedData = await this.signOrder(
            market,
            params.side,
            params.size,
            price,
            feeRate
        );

        // Build order request
        const orderRequest: CreateOrderRequest = {
            id: externalId,
            market: params.market,
            type: params.type === 'MARKET' ? 'LIMIT' : params.type,
            side: params.side,
            qty: params.size,
            price,
            timeInForce: params.type === 'MARKET' ? 'IOC' : (params.timeInForce || 'GTT'),
            expiryEpochMillis: this.calculateExpirationSeconds(params.expirationDays) * 1000,
            fee: feeRate,
            reduceOnly: params.reduceOnly,
            postOnly: params.postOnly,
            selfTradeProtectionLevel: 'ACCOUNT',
            nonce: signedData.nonce,
            settlement: {
                signature: signedData.signature,
                starkKey: signedData.starkKey,
                collateralPosition: signedData.collateralPosition,
            },
        };

        // Add conditional trigger if present
        if (params.trigger) {
            orderRequest.trigger = {
                triggerPrice: params.trigger.triggerPrice,
                triggerPriceType: params.trigger.triggerPriceType || 'LAST',
                direction: params.trigger.direction,
                executionPriceType: params.trigger.executionPriceType || 'LIMIT',
            };
        }

        // Add TP/SL if present
        if (params.takeProfit) {
            orderRequest.tpSlType = 'ORDER';
            orderRequest.takeProfit = {
                triggerPrice: params.takeProfit.triggerPrice,
                triggerPriceType: params.takeProfit.triggerPriceType || 'LAST',
                price: params.takeProfit.price || params.takeProfit.triggerPrice,
                priceType: params.takeProfit.priceType || 'MARKET',
            };
        }

        if (params.stopLoss) {
            orderRequest.tpSlType = orderRequest.tpSlType || 'ORDER';
            orderRequest.stopLoss = {
                triggerPrice: params.stopLoss.triggerPrice,
                triggerPriceType: params.stopLoss.triggerPriceType || 'LAST',
                price: params.stopLoss.price || params.stopLoss.triggerPrice,
                priceType: params.stopLoss.priceType || 'MARKET',
            };
        }

        // Set optimistic pending state
        useOrderStore.getState().setPending(externalId, true);

        try {
            // Submit via serverless proxy (which adds builder code)
            const response = await fetch('/api/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderRequest),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Order submission failed');
            }

            const result = await response.json();

            return {
                orderId: result.data.id,
                externalId: result.data.externalId,
            };
        } catch (error) {
            // Clear pending state on error
            useOrderStore.getState().setPending(externalId, false);
            throw error;
        }
    }

    /**
     * Cancel an order
     */
    async cancelOrder(orderId: number): Promise<void> {
        await extendedApi.cancelOrder(orderId);
    }

    /**
     * Cancel all orders for a market
     */
    async cancelAllOrders(market?: string): Promise<void> {
        await extendedApi.massCancel({
            markets: market ? [market] : undefined,
            cancelAll: !market,
        });
    }
}

// Singleton instance
export const orderService = new OrderService();
