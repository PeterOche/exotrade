// Extended API Types

// ==================== Markets ====================

export type MarketStatus = 'ACTIVE' | 'REDUCE_ONLY' | 'DELISTED' | 'PRELISTED' | 'DISABLED';

export interface MarketStats {
    dailyVolume: string;
    dailyVolumeBase: string;
    dailyPriceChangePercentage: string;
    dailyLow: string;
    dailyHigh: string;
    lastPrice: string;
    askPrice: string;
    bidPrice: string;
    markPrice: string;
    indexPrice: string;
    fundingRate: string;
    nextFundingRate: number;
    openInterest: string;
    openInterestBase: string;
}

export interface TradingConfig {
    minOrderSize: string;
    minOrderSizeChange: string;
    minPriceChange: string;
    maxMarketOrderValue: string;
    maxLimitOrderValue: string;
    maxPositionValue: string;
    maxLeverage: string;
    maxNumOrders: string;
    limitPriceCap: string;
    limitPriceFloor: string;
}

export interface Market {
    name: string;
    assetName: string;
    assetPrecision: number;
    collateralAssetName: string;
    collateralAssetPrecision: number;
    active: boolean;
    status: MarketStatus;
    marketStats: MarketStats;
    tradingConfig: TradingConfig;
}

// ==================== Order Book ====================

export interface OrderBookLevel {
    price: string;
    qty: string;
}

export interface OrderBook {
    market: string;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    timestamp: number;
    sequence: number;
}

// ==================== Trades ====================

export type TradeSide = 'BUY' | 'SELL';
export type TradeType = 'TRADE' | 'LIQUIDATION' | 'DELEVERAGE';

export interface PublicTrade {
    id: number;
    market: string;
    side: TradeSide;
    tradeType: TradeType;
    timestamp: number;
    price: string;
    qty: string;
}

// ==================== Account ====================

export interface AccountInfo {
    status: string;
    l2Key: string;
    l2Vault: number;
    accountId: number;
    description?: string;
    bridgeStarknetAddress: string;
}

export interface Balance {
    collateralName: string;
    balance: string;
    equity: string;
    availableForTrade: string;
    availableForWithdrawal: string;
    unrealisedPnl: string;
    initialMargin: string;
    marginRatio: string;
    exposure: string;
    leverage: string;
    updatedTime: number;
}

// ==================== Positions ====================

export type PositionSide = 'LONG' | 'SHORT';

export interface Position {
    id: number;
    accountId: number;
    market: string;
    side: PositionSide;
    leverage: string;
    size: string;
    value: string;
    openPrice: string;
    markPrice: string;
    liquidationPrice: string;
    margin: string;
    unrealisedPnl: string;
    realisedPnl: string;
    tpTriggerPrice?: string;
    tpLimitPrice?: string;
    slTriggerPrice?: string;
    slLimitPrice?: string;
    adl: string;
    maxPositionSize: string;
    createdTime: number;
    updatedTime: number;
}

// ==================== Orders ====================

export type OrderType = 'LIMIT' | 'MARKET' | 'CONDITIONAL' | 'TPSL' | 'TWAP';
export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus =
    | 'NEW'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'UNTRIGGERED'
    | 'CANCELLED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'TRIGGERED';
export type TimeInForce = 'GTT' | 'IOC';
export type TriggerPriceType = 'LAST' | 'MARK' | 'INDEX';
export type TriggerDirection = 'UP' | 'DOWN';
export type ExecutionPriceType = 'LIMIT' | 'MARKET';
export type TpSlType = 'ORDER' | 'POSITION';

export interface OrderTrigger {
    triggerPrice: string;
    triggerPriceType: TriggerPriceType;
    triggerPriceDirection: TriggerDirection;
    executionPriceType: ExecutionPriceType;
}

export interface TakeProfit {
    triggerPrice: string;
    triggerPriceType: TriggerPriceType;
    price: string;
    priceType: ExecutionPriceType;
}

export interface StopLoss {
    triggerPrice: string;
    triggerPriceType: TriggerPriceType;
    price: string;
    priceType: ExecutionPriceType;
}

export interface Order {
    id: number;
    externalId: string;
    accountId: number;
    market: string;
    type: OrderType;
    side: OrderSide;
    status: OrderStatus;
    statusReason?: string;
    price?: string;
    averagePrice?: string;
    qty: string;
    filledQty?: string;
    payedFee?: string;
    reduceOnly?: boolean;
    postOnly?: boolean;
    trigger?: OrderTrigger;
    tpSlType?: TpSlType;
    takeProfit?: TakeProfit;
    stopLoss?: StopLoss;
    createdTime: number;
    updatedTime: number;
    timeInForce: TimeInForce;
    expireTime: number;
}

// ==================== Order Creation ====================

export interface StarkSignature {
    r: string;
    s: string;
}

export interface OrderSettlement {
    signature: StarkSignature;
    starkKey: string;
    collateralPosition: string;
}

export interface CreateOrderRequest {
    id: string;
    market: string;
    type: OrderType;
    side: OrderSide;
    qty: string;
    price: string;
    timeInForce: TimeInForce;
    expiryEpochMillis: number;
    fee: string;
    nonce: string;
    settlement: OrderSettlement;
    reduceOnly?: boolean;
    postOnly?: boolean;
    selfTradeProtectionLevel?: 'DISABLED' | 'ACCOUNT' | 'CLIENT';
    trigger?: {
        triggerPrice: string;
        triggerPriceType: TriggerPriceType;
        direction: TriggerDirection;
        executionPriceType: ExecutionPriceType;
    };
    tpSlType?: TpSlType;
    takeProfit?: TakeProfit & { settlement?: OrderSettlement };
    stopLoss?: StopLoss & { settlement?: OrderSettlement };
    cancelId?: string;
    builderId?: number;
    builderFee?: number;
}

export interface CreateOrderResponse {
    id: number;
    externalId: string;
}

// ==================== Fees ====================

export interface FeeRates {
    market: string;
    makerFeeRate: string;
    takerFeeRate: string;
    builderFeeRate: string;
}

// ==================== API Response ====================

export interface ApiResponse<T> {
    status: 'OK' | 'ERROR';
    data?: T;
    error?: {
        code: string | number;
        message: string;
    };
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
    pagination?: {
        cursor: number;
        count: number;
    };
}

// ==================== WebSocket Messages ====================

export interface WSMessage<T> {
    type: string;
    ts: number;
    seq: number;
    data: T;
}

export interface OrderBookWSData {
    m: string;  // market
    b: Array<{ p: string; q: string }>;  // bids
    a: Array<{ p: string; q: string }>;  // asks
}

export interface TradeWSData {
    i: number;  // id
    m: string;  // market
    S: TradeSide;
    tT: TradeType;
    T: number;  // timestamp
    p: string;  // price
    q: string;  // qty
}

export interface MarkPriceWSData {
    m: string;  // market
    p: string;  // price
    ts: number;
}
