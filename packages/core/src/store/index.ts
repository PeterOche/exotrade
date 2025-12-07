import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Market, OrderBook, PublicTrade, Balance, Position, Order } from '../types';

// ==================== Auth Store ====================

interface AuthState {
    isAuthenticated: boolean;
    isOnboarded: boolean;
    apiKey: string | null;
    starkKey: string | null;
    accountId: number | null;
    depositAddress: string | null;  // Starknet bridge address for deposits
    setAuth: (apiKey: string, starkKey: string, accountId: number) => void;
    setOnboarded: (value: boolean) => void;
    setDepositAddress: (address: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
    isAuthenticated: false,
    isOnboarded: false,
    apiKey: null,
    starkKey: null,
    accountId: null,
    depositAddress: null,
    setAuth: (apiKey, starkKey, accountId) => set({
        isAuthenticated: true,
        apiKey,
        starkKey,
        accountId
    }),
    setOnboarded: (value) => set({ isOnboarded: value }),
    setDepositAddress: (address) => set({ depositAddress: address }),
    logout: () => set({
        isAuthenticated: false,
        isOnboarded: false,
        apiKey: null,
        starkKey: null,
        accountId: null,
        depositAddress: null
    }),
}));

// ==================== Account Store ====================

interface AccountState {
    balance: Balance | null;
    positions: Position[];
    setBalance: (balance: Balance) => void;
    setPositions: (positions: Position[]) => void;
    updatePosition: (position: Position) => void;
    removePosition: (positionId: number) => void;
}

export const useAccountStore = create<AccountState>()((set) => ({
    balance: null,
    positions: [],
    setBalance: (balance) => set({ balance }),
    setPositions: (positions) => set({ positions }),
    updatePosition: (position) => set((state) => ({
        positions: state.positions.map((p) =>
            p.id === position.id ? position : p
        ),
    })),
    removePosition: (positionId) => set((state) => ({
        positions: state.positions.filter((p) => p.id !== positionId),
    })),
}));

// ==================== Market Store ====================

interface MarketState {
    markets: Market[];
    selectedMarket: string | null;
    orderBook: OrderBook | null;
    recentTrades: PublicTrade[];
    markPrices: Record<string, string>;
    setMarkets: (markets: Market[]) => void;
    setSelectedMarket: (market: string) => void;
    setOrderBook: (orderBook: OrderBook) => void;
    addTrade: (trade: PublicTrade) => void;
    setMarkPrice: (market: string, price: string) => void;
    getSelectedMarketData: () => Market | undefined;
}

export const useMarketStore = create<MarketState>()(
    subscribeWithSelector((set, get) => ({
        markets: [],
        selectedMarket: null,
        orderBook: null,
        recentTrades: [],
        markPrices: {},
        setMarkets: (markets) => set({ markets }),
        setSelectedMarket: (market) => set({ selectedMarket: market }),
        setOrderBook: (orderBook) => set({ orderBook }),
        addTrade: (trade) => set((state) => ({
            recentTrades: [trade, ...state.recentTrades].slice(0, 100),
        })),
        setMarkPrice: (market, price) => set((state) => ({
            markPrices: { ...state.markPrices, [market]: price },
        })),
        getSelectedMarketData: () => {
            const state = get();
            return state.markets.find((m) => m.name === state.selectedMarket);
        },
    }))
);

// ==================== Order Store ====================

interface OrderState {
    openOrders: Order[];
    orderHistory: Order[];
    pendingOrders: Set<string>;
    setOpenOrders: (orders: Order[]) => void;
    setOrderHistory: (orders: Order[]) => void;
    addOrder: (order: Order) => void;
    updateOrder: (order: Order) => void;
    removeOrder: (orderId: number) => void;
    setPending: (externalId: string, pending: boolean) => void;
}

export const useOrderStore = create<OrderState>()((set) => ({
    openOrders: [],
    orderHistory: [],
    pendingOrders: new Set(),
    setOpenOrders: (orders) => set({ openOrders: orders }),
    setOrderHistory: (orders) => set({ orderHistory: orders }),
    addOrder: (order) => set((state) => ({
        openOrders: [order, ...state.openOrders],
    })),
    updateOrder: (order) => set((state) => {
        const isOpen = ['NEW', 'PARTIALLY_FILLED', 'UNTRIGGERED'].includes(order.status);
        if (isOpen) {
            return {
                openOrders: state.openOrders.map((o) =>
                    o.id === order.id ? order : o
                ),
            };
        } else {
            return {
                openOrders: state.openOrders.filter((o) => o.id !== order.id),
                orderHistory: [order, ...state.orderHistory],
            };
        }
    }),
    removeOrder: (orderId) => set((state) => ({
        openOrders: state.openOrders.filter((o) => o.id !== orderId),
    })),
    setPending: (externalId, pending) => set((state) => {
        const newPending = new Set(state.pendingOrders);
        if (pending) {
            newPending.add(externalId);
        } else {
            newPending.delete(externalId);
        }
        return { pendingOrders: newPending };
    }),
}));

// ==================== UI Store ====================

export type PanelType = 'chart' | 'order' | 'risk';

interface UIState {
    activePanel: PanelType;
    isOrderFormExpanded: boolean;
    theme: 'dark' | 'light';
    setActivePanel: (panel: PanelType) => void;
    setOrderFormExpanded: (expanded: boolean) => void;
    toggleTheme: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
    activePanel: 'chart',
    isOrderFormExpanded: false,
    theme: 'dark',
    setActivePanel: (panel) => set({ activePanel: panel }),
    setOrderFormExpanded: (expanded) => set({ isOrderFormExpanded: expanded }),
    toggleTheme: () => set((state) => ({
        theme: state.theme === 'dark' ? 'light' : 'dark'
    })),
}));
