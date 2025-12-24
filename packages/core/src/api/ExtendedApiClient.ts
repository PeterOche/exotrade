import type {
    ExtendedConfig
} from '../config';
import type {
    ApiResponse,
    PaginatedResponse,
    Market,
    Balance,
    Position,
    Order,
    FeeRates,
    CreateOrderRequest,
    CreateOrderResponse,
    AccountInfo,
} from '../types';
import { DEFAULT_CONFIG } from '../config';

/**
 * Extended API Client
 * Handles all REST API communication with Extended exchange
 */
export class ExtendedApiClient {
    private config: ExtendedConfig;
    private apiKey: string | null = null;
    private accountId: number | null = null;

    constructor(config: ExtendedConfig = DEFAULT_CONFIG) {
        this.config = config;
    }

    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
    }

    setAccountId(accountId: number) {
        this.accountId = accountId;
    }

    /**
     * Get the base URL for API requests
     * In browser, use the proxy to avoid CORS issues
     */
    private getBaseUrl(): string {
        // Check if running in browser
        if (typeof window !== 'undefined') {
            // Use the Next.js API proxy
            return '/api/extended';
        }
        // Server-side can call Extended directly
        return this.config.apiBaseUrl;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const baseUrl = this.getBaseUrl();
        const url = `${baseUrl}${endpoint}`;

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'User-Agent': 'ExoTrade/1.0',
            ...options.headers,
        };

        if (this.apiKey) {
            (headers as Record<string, string>)['X-Api-Key'] = this.apiKey;
        }

        // Add account ID for user endpoints
        if (this.accountId && endpoint.startsWith('/user')) {
            (headers as Record<string, string>)['X-X10-ACTIVE-ACCOUNT'] = String(this.accountId);
        }

        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }

        const data = await response.json();

        if (data.status === 'ERROR') {
            throw new Error(data.error?.message || 'API request failed');
        }

        return data;
    }

    // ==================== Public Endpoints ====================

    async getMarkets(markets?: string[]): Promise<Market[]> {
        let endpoint = '/info/markets';
        if (markets && markets.length > 0) {
            endpoint += `?${markets.map(m => `market=${m}`).join('&')}`;
        }
        const response = await this.request<ApiResponse<Market[]>>(endpoint);
        return response.data || [];
    }

    async getMarketStats(market: string) {
        const response = await this.request<ApiResponse<Market['marketStats']>>(
            `/info/markets/${market}/stats`
        );
        return response.data;
    }

    async getOrderBook(market: string) {
        const response = await this.request<ApiResponse<{
            market: string;
            bid: Array<{ qty: string; price: string }>;
            ask: Array<{ qty: string; price: string }>;
        }>>(`/info/markets/${market}/orderbook`);
        return response.data;
    }

    async getRecentTrades(market: string) {
        const response = await this.request<ApiResponse<Array<{
            i: number;
            m: string;
            S: 'BUY' | 'SELL';
            tT: 'TRADE' | 'LIQUIDATION' | 'DELEVERAGE';
            T: number;
            p: string;
            q: string;
        }>>>(`/info/markets/${market}/trades`);
        return response.data;
    }

    async getCandles(
        market: string,
        candleType: 'trades' | 'mark-prices' | 'index-prices',
        interval: string,
        limit: number = 100,
        endTime?: number
    ) {
        let endpoint = `/info/candles/${market}/${candleType}?interval=${interval}&limit=${limit}`;
        if (endTime) {
            endpoint += `&endTime=${endTime}`;
        }
        const response = await this.request<ApiResponse<Array<{
            o: string;
            c: string;
            h: string;
            l: string;
            v?: string;
            T: number;
        }>>>(endpoint);
        return response.data;
    }

    // ==================== Private Endpoints ====================

    async getAccountInfo(): Promise<AccountInfo | undefined> {
        const response = await this.request<ApiResponse<AccountInfo>>('/user/account/info');
        return response.data;
    }

    async getBalance(): Promise<Balance | undefined> {
        try {
            const response = await this.request<ApiResponse<Balance>>('/user/balance');
            return response.data;
        } catch (error: any) {
            // Extended API returns 404 for zero balance
            if (error.message && (error.message.includes('404') || error.message.includes('Non-JSON response'))) {
                console.log('[ExtendedApiClient] Balance 404 detected, returning zero balance');
                return {
                    collateralName: 'USDC',
                    balance: '0',
                    equity: '0',
                    availableForTrade: '0',
                    availableForWithdrawal: '0',
                    unrealisedPnl: '0',
                    initialMargin: '0',
                    marginRatio: '0',
                    exposure: '0',
                    leverage: '0',
                    updatedTime: Date.now()
                } as Balance;
            }
            throw error;
        }
    }

    async getPositions(markets?: string[], side?: 'LONG' | 'SHORT'): Promise<Position[]> {
        let endpoint = '/user/positions';
        const params: string[] = [];
        if (markets) {
            params.push(...markets.map(m => `market=${m}`));
        }
        if (side) {
            params.push(`side=${side}`);
        }
        if (params.length > 0) {
            endpoint += `?${params.join('&')}`;
        }
        const response = await this.request<ApiResponse<Position[]>>(endpoint);
        return response.data || [];
    }

    async getOpenOrders(market?: string): Promise<Order[]> {
        let endpoint = '/user/orders';
        if (market) {
            endpoint += `?market=${market}`;
        }
        const response = await this.request<ApiResponse<Order[]>>(endpoint);
        return response.data || [];
    }

    async getOrderHistory(
        options?: {
            market?: string;
            cursor?: number;
            limit?: number;
        }
    ): Promise<{ orders: Order[]; cursor?: number }> {
        let endpoint = '/user/orders/history';
        const params: string[] = [];
        if (options?.market) {
            params.push(`market=${options.market}`);
        }
        if (options?.cursor) {
            params.push(`cursor=${options.cursor}`);
        }
        if (options?.limit) {
            params.push(`limit=${options.limit}`);
        }
        if (params.length > 0) {
            endpoint += `?${params.join('&')}`;
        }
        const response = await this.request<PaginatedResponse<Order[]>>(endpoint);
        return {
            orders: response.data || [],
            cursor: response.pagination?.cursor,
        };
    }

    async getFees(market?: string): Promise<FeeRates[]> {
        let endpoint = '/user/fees';
        if (market) {
            endpoint += `?market=${market}`;
        }
        const response = await this.request<ApiResponse<FeeRates[]>>(endpoint);
        return response.data || [];
    }

    async getLeverage(market?: string) {
        let endpoint = '/user/leverage';
        if (market) {
            endpoint += `?market=${market}`;
        }
        const response = await this.request<ApiResponse<Array<{
            market: string;
            leverage: string;
        }>>>(endpoint);
        return response.data;
    }

    async updateLeverage(market: string, leverage: string) {
        const response = await this.request<ApiResponse<{
            market: string;
            leverage: string;
        }>>('/user/leverage', {
            method: 'PATCH',
            body: JSON.stringify({ market, leverage }),
        });
        return response.data;
    }

    // ==================== Order Management ====================

    async createOrder(order: CreateOrderRequest): Promise<CreateOrderResponse | undefined> {
        const response = await this.request<ApiResponse<CreateOrderResponse>>(
            '/user/order',
            {
                method: 'POST',
                body: JSON.stringify(order),
            }
        );
        return response.data;
    }

    async cancelOrder(orderId: number): Promise<void> {
        await this.request(`/user/order/${orderId}`, {
            method: 'DELETE',
        });
    }

    async cancelOrderByExternalId(externalId: string): Promise<void> {
        await this.request(`/user/order?externalId=${externalId}`, {
            method: 'DELETE',
        });
    }

    async massCancel(options: {
        markets?: string[];
        cancelAll?: boolean;
        orderIds?: number[];
        externalOrderIds?: string[];
    }): Promise<void> {
        await this.request('/user/order/massCancel', {
            method: 'POST',
            body: JSON.stringify(options),
        });
    }
}

// Singleton instance
export const extendedApi = new ExtendedApiClient();
