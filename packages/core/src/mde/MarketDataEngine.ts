import { extendedApi } from '../api/ExtendedApiClient';
import { wsManager, type WSSubscription } from './WebSocketManager';
import { useMarketStore, useAccountStore, useOrderStore } from '../store';
import type { OrderBook, OrderBookLevel, PublicTrade, Balance, Position, Order } from '../types';

interface ThrottleConfig {
    bboInterval: number;      // Best Bid/Offer update interval (ms)
    orderBookInterval: number; // Full order book update interval (ms)
    tradesInterval: number;    // Trades list update interval (ms)
}

const DEFAULT_THROTTLE: ThrottleConfig = {
    bboInterval: 30,
    orderBookInterval: 500,
    tradesInterval: 500,
};

/**
 * Market Data Engine (MDE)
 * 
 * Singleton that manages all market data consumption.
 * Runs outside of React to prevent UI lag from high-frequency updates.
 */
export class MarketDataEngine {
    private static instance: MarketDataEngine | null = null;
    private isRunning = false;
    private currentMarket: string | null = null;
    private throttleConfig: ThrottleConfig;
    private handlersSetup = false;

    // Internal state (not in React)
    private orderBookState: OrderBook | null = null;
    private tradesBuffer: PublicTrade[] = [];

    // Throttle timers
    private bboTimer: ReturnType<typeof setTimeout> | null = null;
    private orderBookTimer: ReturnType<typeof setTimeout> | null = null;
    private tradesTimer: ReturnType<typeof setTimeout> | null = null;

    private constructor(config: ThrottleConfig = DEFAULT_THROTTLE) {
        this.throttleConfig = config;
    }

    static getInstance(): MarketDataEngine {
        if (!MarketDataEngine.instance) {
            MarketDataEngine.instance = new MarketDataEngine();
        }
        return MarketDataEngine.instance;
    }

    async start(market: string) {
        if (this.isRunning && this.currentMarket === market) {
            return;
        }

        // Stop existing subscriptions
        if (this.isRunning) {
            this.stop();
        }

        this.currentMarket = market;
        this.isRunning = true;

        // Set up message handlers (only once)
        if (!this.handlersSetup) {
            this.setupHandlers();
            this.handlersSetup = true;
        }

        // Fetch initial data via REST (with error handling)
        try {
            await this.fetchInitialData(market);
        } catch (error) {
            console.error('[MDE] Failed to fetch initial data, continuing with WebSocket only:', error);
        }

        // Subscribe to WebSocket streams
        const subscriptions: WSSubscription[] = [
            { type: 'orderbook', market },
            { type: 'trades', market },
            { type: 'mark-price', market },
        ];

        // Connect to streams
        try {
            await wsManager.connectPublic(subscriptions);
        } catch (error) {
            console.error('[MDE] Failed to connect WebSocket:', error);
        }
    }

    stop() {
        this.isRunning = false;
        this.currentMarket = null;
        wsManager.disconnect();
        this.clearThrottleTimers();
        this.orderBookState = null;
        this.tradesBuffer = [];
    }

    private async fetchInitialData(market: string) {
        try {
            // Fetch markets list
            const markets = await extendedApi.getMarkets();
            useMarketStore.getState().setMarkets(markets);
            useMarketStore.getState().setSelectedMarket(market);

            // Fetch order book snapshot
            const orderBookData = await extendedApi.getOrderBook(market);
            if (orderBookData) {
                this.orderBookState = {
                    market,
                    bids: orderBookData.bid.map(b => ({ price: b.price, qty: b.qty })),
                    asks: orderBookData.ask.map(a => ({ price: a.price, qty: a.qty })),
                    timestamp: Date.now(),
                    sequence: 0,
                };
                this.pushOrderBookToStore();
            }

            // Fetch recent trades
            const trades = await extendedApi.getRecentTrades(market);
            if (trades) {
                const formattedTrades: PublicTrade[] = trades.map(t => ({
                    id: t.i,
                    market: t.m,
                    side: t.S,
                    tradeType: t.tT,
                    timestamp: t.T,
                    price: t.p,
                    qty: t.q,
                }));
                this.tradesBuffer = formattedTrades;
                this.pushTradesToStore();
            }
        } catch (error) {
            console.error('[MDE] Failed to fetch initial data:', error);
        }
    }

    private setupHandlers() {
        // Order book handler
        wsManager.on('orderbook', (message) => {
            if (message.type === 'SEQUENCE_BREAK') {
                this.handleSequenceBreak();
                return;
            }

            if (!message.data) return;

            const data = message.data as {
                m: string;
                b: Array<{ p: string; q: string }>;
                a: Array<{ p: string; q: string }>;
            };

            if (!data.m || !data.b || !data.a) return;

            if (message.type === 'SNAPSHOT') {
                this.orderBookState = {
                    market: data.m,
                    bids: data.b.map(b => ({ price: b.p, qty: b.q })),
                    asks: data.a.map(a => ({ price: a.p, qty: a.q })),
                    timestamp: message.ts,
                    sequence: message.seq,
                };
            } else if (message.type === 'DELTA' && this.orderBookState) {
                // Apply delta updates
                this.applyOrderBookDelta(data);
                this.orderBookState.timestamp = message.ts;
                this.orderBookState.sequence = message.seq;
            }

            this.scheduleOrderBookPush();
        });

        // Trades handler
        wsManager.on('trades', (message) => {
            if (message.type === 'SEQUENCE_BREAK' || !message.data) return;

            const data = message.data as Array<{
                i: number;
                m: string;
                S: 'BUY' | 'SELL';
                tT: 'TRADE' | 'LIQUIDATION' | 'DELEVERAGE';
                T: number;
                p: string;
                q: string;
            }>;

            if (!Array.isArray(data)) return;

            for (const trade of data) {
                this.tradesBuffer.unshift({
                    id: trade.i,
                    market: trade.m,
                    side: trade.S,
                    tradeType: trade.tT,
                    timestamp: trade.T,
                    price: trade.p,
                    qty: trade.q,
                });
            }

            // Keep buffer limited
            this.tradesBuffer = this.tradesBuffer.slice(0, 100);
            this.scheduleTradesPush();
        });

        // Mark price handler
        wsManager.on('mark-price', (message) => {
            if (message.type === 'SEQUENCE_BREAK' || !message.data) return;

            const data = message.data as { m: string; p: string };
            if (data.m && data.p) {
                useMarketStore.getState().setMarkPrice(data.m, data.p);
            }

            // Recalculate liquidation prices when mark price updates
            this.recalculateDerivedValues();
        });
    }

    private applyOrderBookDelta(data: {
        b: Array<{ p: string; q: string }>;
        a: Array<{ p: string; q: string }>;
    }) {
        if (!this.orderBookState) return;

        // Apply bid updates
        for (const update of data.b) {
            this.updateOrderBookSide(this.orderBookState.bids, update, true);
        }

        // Apply ask updates
        for (const update of data.a) {
            this.updateOrderBookSide(this.orderBookState.asks, update, false);
        }
    }

    private updateOrderBookSide(
        levels: OrderBookLevel[],
        update: { p: string; q: string },
        isBid: boolean
    ) {
        const idx = levels.findIndex(l => l.price === update.p);

        if (parseFloat(update.q) === 0) {
            // Remove level
            if (idx !== -1) {
                levels.splice(idx, 1);
            }
        } else if (idx !== -1) {
            // Update existing level
            levels[idx].qty = update.q;
        } else {
            // Insert new level in sorted order
            const newLevel = { price: update.p, qty: update.q };
            const insertIdx = levels.findIndex(l =>
                isBid
                    ? parseFloat(l.price) < parseFloat(update.p)
                    : parseFloat(l.price) > parseFloat(update.p)
            );
            if (insertIdx === -1) {
                levels.push(newLevel);
            } else {
                levels.splice(insertIdx, 0, newLevel);
            }
        }
    }

    private handleSequenceBreak() {
        console.log('[MDE] Handling sequence break - fetching snapshot');
        if (this.currentMarket) {
            this.fetchInitialData(this.currentMarket);
        }
    }

    private recalculateDerivedValues() {
        // This would recalculate liquidation prices based on new mark price
        // For now, positions already include liquidation price from API
        // In a more advanced implementation, we'd calculate this client-side
    }

    // Throttled push to store
    private scheduleOrderBookPush() {
        if (this.orderBookTimer) return;

        this.orderBookTimer = setTimeout(() => {
            this.orderBookTimer = null;
            this.pushOrderBookToStore();
        }, this.throttleConfig.orderBookInterval);
    }

    private scheduleTradesPush() {
        if (this.tradesTimer) return;

        this.tradesTimer = setTimeout(() => {
            this.tradesTimer = null;
            this.pushTradesToStore();
        }, this.throttleConfig.tradesInterval);
    }

    private pushOrderBookToStore() {
        if (this.orderBookState) {
            useMarketStore.getState().setOrderBook(this.orderBookState);
        }
    }

    private pushTradesToStore() {
        for (const trade of this.tradesBuffer) {
            useMarketStore.getState().addTrade(trade);
        }
    }

    private clearThrottleTimers() {
        if (this.bboTimer) {
            clearTimeout(this.bboTimer);
            this.bboTimer = null;
        }
        if (this.orderBookTimer) {
            clearTimeout(this.orderBookTimer);
            this.orderBookTimer = null;
        }
        if (this.tradesTimer) {
            clearTimeout(this.tradesTimer);
            this.tradesTimer = null;
        }
    }
}

// Export singleton getter
export const getMDE = () => MarketDataEngine.getInstance();
