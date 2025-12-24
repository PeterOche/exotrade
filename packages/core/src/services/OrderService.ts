import { extendedApi } from '../api/ExtendedApiClient';
import { useOrderStore, useMarketStore, useAuthStore } from '../store';
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
     * Encode asset ID for order signing
     * Extended uses "{asset}-{precision}" encoded as hex, padded to 30 chars
     * Example: "BTC-6" -> 0x4254432d3600000000000000000000
     */
    encodeAssetId(asset: string, precision: number): string {
        const assetString = `${asset}-${precision}`;
        let hexString = '';
        for (let i = 0; i < assetString.length; i++) {
            hexString += assetString.charCodeAt(i).toString(16).padStart(2, '0');
        }
        // Pad to 30 hex chars (15 bytes)
        hexString = hexString.padEnd(30, '0');
        return '0x' + hexString;
    }

    /**
     * Round price to market's tick size
     */
    roundToTickSize(price: number, tickSize: string): string {
        const tick = parseFloat(tickSize);
        if (tick <= 0) return price.toFixed(2);

        // Round to nearest tick
        const rounded = Math.round(price / tick) * tick;

        // Determine decimal places from tick size
        const tickStr = tickSize.replace(/0+$/, ''); // Remove trailing zeros
        const decimalPlaces = tickStr.includes('.')
            ? tickStr.split('.')[1]?.length || 0
            : 0;

        return rounded.toFixed(decimalPlaces);
    }

    /**
     * Calculate market order price based on mark price
     * Market orders must be within 5% of mark price per Extended docs:
     * - Long Market Order: Price ≤ Mark Price * (1 + 5%)
     * - Short Market Order: Price ≥ Mark Price * (1 - 5%)
     */
    calculateMarketOrderPrice(side: OrderSide, market?: Market): string {
        const marketStore = useMarketStore.getState();
        const marketName = market?.name || marketStore.selectedMarket || 'BTC-USD';

        // Prefer fresh mark price from market API response over stale WebSocket store
        const freshMarkPrice = market?.marketStats?.markPrice;
        const storedMarkPrice = marketStore.markPrices[marketName];
        const markPriceStr = freshMarkPrice || storedMarkPrice;

        if (markPriceStr) {
            const mark = parseFloat(markPriceStr);
            // Use 4.5% buffer (safely within 5% cap)
            const price = side === 'BUY' ? mark * 1.045 : mark * 0.955;

            if (market?.tradingConfig?.minPriceChange) {
                return this.roundToTickSize(price, market.tradingConfig.minPriceChange);
            }
            return price.toFixed(2);
        }

        // Fallback to order book if mark price unavailable
        const orderBook = marketStore.orderBook;
        if (!orderBook) {
            throw new Error('Order book and mark price not available');
        }

        let price: number;
        if (side === 'BUY') {
            const bestAsk = orderBook.asks[0]?.price;
            if (!bestAsk) throw new Error('No ask price available');
            // Use 0.75% slippage from best ask (conservative)
            price = parseFloat(bestAsk) * 1.0075;
        } else {
            const bestBid = orderBook.bids[0]?.price;
            if (!bestBid) throw new Error('No bid price available');
            price = parseFloat(bestBid) * 0.9925;
        }

        // Round to tick size if market info available
        if (market?.tradingConfig?.minPriceChange) {
            return this.roundToTickSize(price, market.tradingConfig.minPriceChange);
        }

        // Default to 2 decimal places for USD pairs
        return price.toFixed(2);
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
     * Calculate expiration timestamp in seconds for API
     * Default: 28 days (safe for testnet), max 90 days
     */
    calculateExpirationSeconds(days: number = 28): number {
        // Ensure we don't exceed 90 days max
        const safeDays = Math.min(days, 90);
        return Math.ceil((Date.now() + safeDays * 24 * 60 * 60 * 1000) / 1000);
    }

    /**
     * Calculate expiration timestamp for order signing
     * Extended SDK adds a 14-day buffer to expiration for signing hash only
     */
    calculateSigningExpirationSeconds(days: number = 28): number {
        const apiExpiration = this.calculateExpirationSeconds(days);
        const bufferDays = 14;
        return apiExpiration + (bufferDays * 24 * 60 * 60);
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
        // Use signing-specific expiration with 14-day buffer per Extended SDK
        const expirationSeconds = this.calculateSigningExpirationSeconds();

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
                syntheticAssetId: this.encodeAssetId(market.assetName, market.assetPrecision),
                collateralAssetId: this.config.collateralAssetId, // Uses Pedersen-hashed ID from config
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

        // Get fee rate for the market (with fallback since /user/fees requires auth)
        let feeRate = '0.0005'; // Default taker fee: 0.05%
        try {
            const fees = await extendedApi.getFees(params.market);
            if (fees.length > 0) {
                feeRate = params.postOnly
                    ? fees[0]?.makerFeeRate || '0'
                    : fees[0]?.takerFeeRate || '0.0005';
            }
        } catch (error) {
            console.warn('[OrderService] Could not fetch fees, using default:', feeRate);
        }

        // Calculate price for market orders
        let price = params.price;
        if (params.type === 'MARKET' || !price) {
            price = this.calculateMarketOrderPrice(params.side, market);
        } else if (market.tradingConfig?.minPriceChange) {
            // Round limit price to tick size
            price = this.roundToTickSize(parseFloat(price), market.tradingConfig.minPriceChange);
        }

        // Convert USD size to base asset (BTC) quantity
        // User enters notional value in USD, we convert to base asset qty
        const markPrice = parseFloat(market.marketStats?.markPrice || price);
        let qtyInBase = parseFloat(params.size) / markPrice;

        // Round to market's min qty change (step size)
        const minQtyChange = parseFloat(market.tradingConfig?.minOrderSizeChange || '0.0001');
        qtyInBase = Math.floor(qtyInBase / minQtyChange) * minQtyChange;

        // Format with appropriate precision
        const qtyPrecision = market.assetPrecision || 8;
        const qty = qtyInBase.toFixed(qtyPrecision);

        console.log(`[OrderService] Converted $${params.size} USD to ${qty} ${market.assetName} @ $${markPrice}`);

        // Sign the order first (this generates nonce internally)
        const signedData = await this.signOrder(
            market,
            params.side,
            qty,
            price,
            feeRate
        );

        // Build order request
        const orderRequest: CreateOrderRequest = {
            id: externalId,
            market: params.market,
            type: params.type === 'MARKET' ? 'LIMIT' : params.type,
            side: params.side,
            qty: qty,
            price,
            timeInForce: params.type === 'MARKET' ? 'IOC' : (params.timeInForce || 'GTT'),
            expiryEpochMillis: this.calculateExpirationSeconds(params.expirationDays) * 1000,
            fee: feeRate,
            reduceOnly: params.reduceOnly,
            postOnly: params.postOnly,
            selfTradeProtectionLevel: 'ACCOUNT',
            nonce: signedData.nonce,
            settlement: {
                signature: { r: signedData.signature.r, s: signedData.signature.s },
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
            // Get API key from auth store
            const apiKey = useAuthStore.getState().apiKey;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (apiKey) {
                headers['X-Api-Key'] = apiKey;
            }

            // Submit via serverless proxy (which adds builder code)
            const response = await fetch('/api/order', {
                method: 'POST',
                headers,
                body: JSON.stringify(orderRequest),
            });

            if (!response.ok) {
                const errorData = await response.json();
                // Extended API returns: { status: "ERROR", error: { code: number, message: string } }
                const errorMessage = errorData.error?.message || errorData.message || 'Order submission failed';
                const errorCode = errorData.error?.code;

                // Provide user-friendly error messages for common errors
                let userMessage = errorMessage;
                switch (errorCode) {
                    case 1140:
                        userMessage = 'Insufficient balance. Please deposit funds to trade.';
                        break;
                    case 1141:
                        userMessage = 'Invalid price value. Price exceeds allowed range.';
                        break;
                    case 1125:
                        userMessage = 'Invalid price precision. Price must match market tick size.';
                        break;
                    case 1135:
                        userMessage = 'Order expiration too far in future (max 28 days on testnet).';
                        break;
                    case 1150:
                        userMessage = 'Invalid builder ID. Please check configuration.';
                        break;
                }

                console.error('[OrderService] Order error:', errorCode, errorMessage);
                throw new Error(userMessage);
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
