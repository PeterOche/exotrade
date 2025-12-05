# Extended API Reference for ExoTrade

> **Last Updated:** December 2024  
> **Source:** [Extended API Documentation](https://api.docs.extended.exchange)

This document indexes all Extended API endpoints and concepts required for building ExoTrade.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Configuration & Endpoints](#configuration--endpoints)
3. [Authentication](#authentication)
4. [Builder Codes Integration](#builder-codes-integration)
5. [Public REST API](#public-rest-api)
6. [Private REST API](#private-rest-api)
7. [WebSocket Streams](#websocket-streams)
8. [Order Management](#order-management)
9. [Error Codes](#error-codes)
10. [Starknet-Specific Logic](#starknet-specific-logic)

---

## Overview

Extended is a **hybrid Central Limit Order Book (CLOB)** exchange:
- **Off-chain:** Order processing, matching, position risk assessment, transaction sequencing
- **On-chain:** Transaction validation and trade settlement via Starknet

### Key Principles
- Users retain **self-custody** of funds (held in Starknet smart contracts)
- **On-chain validation** ensures no fraudulent transactions
- Orders are **signed off-chain** (gas-free) using SNIP12 standard (EIP712 for Starknet)

---

## Configuration & Endpoints

### Mainnet Configuration

```typescript
const STARKNET_MAINNET_CONFIG = {
  api_base_url: "https://api.starknet.extended.exchange/api/v1",
  stream_url: "wss://api.starknet.extended.exchange/stream.extended.exchange/v1",
  onboarding_url: "https://api.starknet.extended.exchange",
  signing_domain: "extended.exchange",
  collateral_decimals: 6,
  starknet_domain: {
    name: "Perpetuals",
    version: "v0",
    chain_id: "SN_MAIN",
    revision: "1"
  },
  collateral_asset_id: "0x1"
};
```

### Testnet Configuration (Sepolia)

```typescript
const STARKNET_TESTNET_CONFIG = {
  api_base_url: "https://api.starknet.sepolia.extended.exchange/api/v1",
  stream_url: "wss://starknet.sepolia.extended.exchange/stream.extended.exchange/v1",
  onboarding_url: "https://api.starknet.sepolia.extended.exchange",
  signing_domain: "starknet.sepolia.extended.exchange",
  collateral_decimals: 6,
  starknet_domain: {
    name: "Perpetuals",
    version: "v0",
    chain_id: "SN_SEPOLIA",
    revision: "1"
  },
  collateral_asset_id: "0x1"
};
```

### Rate Limits

| Type | Limit | Note |
|------|-------|------|
| REST API | 1,000 requests/minute | Shared across all endpoints |
| Market Makers | 60,000 requests/5 minutes | Higher limit |
| Exceeded | HTTP 429 | Rate limited response |

---

## Authentication

### API Key Authentication

Include API key in HTTP header:
```
X-Api-Key: <API_KEY_FROM_API_MANAGEMENT_PAGE>
```

### Required Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Api-Key` | Yes | API key for authentication |
| `User-Agent` | Yes | Required for both REST and WebSocket |

### Stark Key Signature

Required for order management endpoints. Orders are signed using:
- **SNIP12 standard** (Starknet's EIP712 equivalent)
- **Private Stark key** from account

---

## Builder Codes Integration

> **Critical for ExoTrade Revenue**

### How Builder Codes Work

1. Builder must have an Extended account with a `clientId`
2. Each order includes `builderId` and `builderFee`
3. Fees are transferred to builder's account **daily at 00:00 UTC**
4. Builder code **overrides referral codes** for those trades

### Order Parameters

```typescript
{
  builderId: 123,         // Builder's clientId from Extended UI
  builderFee: 0.0005      // Fee fraction (0.0005 = 0.05%)
}
```

### Maximum Builder Fee

Fetch via `GET /api/v1/user/fees`:
```json
{
  "data": [{
    "market": "BTC-USD",
    "makerFeeRate": "0.00000",
    "takerFeeRate": "0.00025",
    "builderFeeRate": "0.0001"  // Max allowed
  }]
}
```

### Implementation Reference

[Python SDK Example](https://github.com/x10xchange/python_sdk/blob/starknet/examples/04_create_limit_order_with_builder.py)

---

## Public REST API

### Markets

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/info/markets` | GET | List all markets with config |
| `/api/v1/info/markets/{market}/stats` | GET | Market statistics |
| `/api/v1/info/markets/{market}/orderbook` | GET | Order book snapshot |
| `/api/v1/info/markets/{market}/trades` | GET | Recent trades |

### Market Response Structure

```typescript
interface Market {
  name: string;                    // "BTC-USD"
  assetName: string;               // "BTC"
  assetPrecision: number;          // 6
  collateralAssetName: string;     // "USD"
  status: "ACTIVE" | "REDUCE_ONLY" | "DELISTED" | "PRELISTED" | "DISABLED";
  marketStats: {
    dailyVolume: string;
    lastPrice: string;
    askPrice: string;
    bidPrice: string;
    markPrice: string;
    indexPrice: string;
    fundingRate: string;
    nextFundingRate: number;       // Timestamp
    openInterest: string;
  };
  tradingConfig: {
    minOrderSize: string;
    minOrderSizeChange: string;
    minPriceChange: string;
    maxMarketOrderValue: string;
    maxLimitOrderValue: string;
    maxPositionValue: string;
    maxLeverage: string;
    maxNumOrders: string;          // 200
    limitPriceCap: string;
    limitPriceFloor: string;
  };
}
```

### Candles/Historical Data

| Endpoint | Method | Price Type |
|----------|--------|------------|
| `/api/v1/info/candles/{market}/trades` | GET | Last price |
| `/api/v1/info/candles/{market}/mark-prices` | GET | Mark price |
| `/api/v1/info/candles/{market}/index-prices` | GET | Index price |

**Query Parameters:**
- `interval`: ISO 8601 duration (PT1M, PT5M, PT15M, PT30M, PT1H, PT2H, PT4H, PT8H, PT12H, PT24H, P7D, P30D)
- `limit`: Max records (max 10,000)
- `endTime`: End timestamp (epoch ms)

### Funding Rates

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/info/{market}/funding` | GET | Historical funding rates |

---

## Private REST API

### Account

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/user/account/info` | GET | Account details |
| `/api/v1/user/balance` | GET | Balance, equity, margin |
| `/api/v1/user/leverage` | GET | Current leverage |
| `/api/v1/user/leverage` | PATCH | Update leverage |
| `/api/v1/user/fees` | GET | Fee rates |

### Balance Response

```typescript
interface Balance {
  collateralName: string;          // "USDC"
  balance: string;                 // Wallet balance
  equity: string;                  // Balance + Unrealized PnL
  availableForTrade: string;       // Equity - Initial Margin
  availableForWithdrawal: string;
  unrealisedPnl: string;
  initialMargin: string;
  marginRatio: string;             // >100% = Liquidation
  exposure: string;
  leverage: string;
}
```

### Positions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/user/positions` | GET | Open positions |
| `/api/v1/user/positions/history` | GET | Position history |

### Position Response

```typescript
interface Position {
  id: number;
  market: string;
  side: "LONG" | "SHORT";
  leverage: string;
  size: string;                    // Base asset
  value: string;                   // Collateral asset
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
  adl: string;                     // ADL percentile (0-100)
}
```

### Orders

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/user/orders` | GET | Open orders |
| `/api/v1/user/orders/history` | GET | Order history |
| `/api/v1/user/orders/{id}` | GET | Order by ID |
| `/api/v1/user/order` | POST | Create/Edit order |
| `/api/v1/user/order/{id}` | DELETE | Cancel by ID |
| `/api/v1/user/order/massCancel` | POST | Mass cancel |
| `/api/v1/user/deadmanswitch` | POST | Dead man's switch |

### Order Statuses

| Status | Description |
|--------|-------------|
| `NEW` | In order book, unfilled |
| `PARTIALLY_FILLED` | Partially filled |
| `FILLED` | Fully filled |
| `UNTRIGGERED` | Conditional order waiting |
| `CANCELLED` | Cancelled |
| `REJECTED` | Rejected |
| `EXPIRED` | Expired |
| `TRIGGERED` | Transitioning to NEW |

### Trades

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/user/trades` | GET | Trade history |
| `/api/v1/user/funding/history` | GET | Funding payments |

---

## WebSocket Streams

### Connection URLs

| Type | URL |
|------|-----|
| Public | `wss://api.starknet.extended.exchange/stream.extended.exchange/v1` |
| Private | `ws://api.starknet.extended.exchange/stream.extended.exchange/v1` |

### Ping/Pong
- Server sends ping every **15 seconds**
- Client must respond within **10 seconds**

### Public Streams

| Stream | Endpoint | Update Frequency |
|--------|----------|------------------|
| Order Book (Full) | `/orderbooks/{market}` | 100ms |
| Order Book (BBO) | `/orderbooks/{market}?depth=1` | 10ms |
| Trades | `/publicTrades/{market}` | Realtime |
| Funding Rates | `/funding/{market}` | On change |
| Candles | `/candles/{market}/{type}?interval=PT1M` | 1-10s |
| Mark Price | `/prices/mark/{market}` | Realtime |
| Index Price | `/prices/index/{market}` | Realtime |

### Order Book Message Types

```typescript
interface OrderBookMessage {
  ts: number;                      // Timestamp
  type: "SNAPSHOT" | "DELTA";
  seq: number;                     // Sequence number
  data: {
    m: string;                     // Market
    b: Array<{ p: string; q: string }>;  // Bids
    a: Array<{ p: string; q: string }>;  // Asks
  };
}
```

> **Important:** If sequence numbers arrive out of order, reconnect immediately.

### Private Stream

| Stream | Endpoint | Auth Required |
|--------|----------|---------------|
| Account Updates | `/account` | X-Api-Key header |

Includes: Orders, Trades, Balance, Positions updates

---

## Order Management

### Create Order Request

```typescript
interface CreateOrderRequest {
  id: string;                      // External ID (user-assigned)
  market: string;                  // "BTC-USD"
  type: "LIMIT" | "MARKET" | "CONDITIONAL" | "TPSL";
  side: "BUY" | "SELL";
  qty: string;                     // Base asset
  price: string;                   // Required for ALL orders
  timeInForce: "GTT" | "IOC";
  expiryEpochMillis: number;       // Max 90 days (mainnet)
  fee: string;                     // Max fee (decimal, e.g., "0.00025")
  reduceOnly?: boolean;
  postOnly?: boolean;
  selfTradeProtectionLevel?: "DISABLED" | "ACCOUNT" | "CLIENT";
  
  // Starknet Settlement
  settlement: {
    signature: { r: string; s: string };
    starkKey: string;
    collateralPosition: string;
  };
  nonce: string;                   // 1 <= nonce <= 2^31
  
  // Conditional Orders
  trigger?: {
    triggerPrice: string;
    triggerPriceType: "LAST" | "MARK" | "INDEX";
    direction: "UP" | "DOWN";
    executionPriceType: "LIMIT" | "MARKET";
  };
  
  // TP/SL
  tpSlType?: "ORDER" | "POSITION";
  takeProfit?: TakeProfitParams;
  stopLoss?: StopLossParams;
  
  // Builder Code (ExoTrade Revenue!)
  builderId?: number;
  builderFee?: number;
  
  // Order Edit
  cancelId?: string;               // External ID to replace
}
```

### Price Requirements

**Limit Orders:**
- Long: `price ≤ markPrice × (1 + limitPriceCap)`
- Short: `price ≥ markPrice × (1 - limitPriceFloor)`

**Market Orders:**
- Long: `price ≤ markPrice × 1.05`
- Short: `price ≥ markPrice × 0.95`

### Market Order Implementation

> Extended doesn't natively support market orders. Implement as:

```typescript
// Market Buy
const price = bestAskPrice * 1.0075;
const order = { type: "LIMIT", timeInForce: "IOC", price };

// Market Sell  
const price = bestBidPrice * 0.9925;
const order = { type: "LIMIT", timeInForce: "IOC", price };
```

---

## Error Codes

### Critical Order Errors

| Code | Name | User Message |
|------|------|--------------|
| 1120 | OrderQtyLessThanMinTradeSize | "Size too small. Increase quantity." |
| 1122 | OrderValueExceedsMaxOrderValue | "Order exceeds maximum value." |
| 1126 | MaxOpenOrdersNumberExceeded | "Order limit reached. Cancel existing orders." |
| 1127 | MaxPositionValueExceeded | "Position limit exceeded." |
| 1140 | OrderCostExceedsBalance | "Insufficient margin. Reduce size or leverage." |
| 1136 | ReduceOnlyOrderSizeExceedsPositionSize | "Reduce-only size exceeds position." |

### Authentication Errors

| Code | Name | Description |
|------|------|-------------|
| 1100 | InvalidStarknetPublicKey | Invalid Stark public key |
| 1101 | InvalidStarknetSignature | Invalid signature |
| 1102 | InvalidStarknetVault | Invalid vault |

### Market Errors

| Code | Name | Description |
|------|------|-------------|
| 1001 | MarketNotFound | Market doesn't exist |
| 1002 | MarketDisabled | Market is disabled |
| 1013 | MarketReduceOnly | Only reduce-only orders allowed |

---

## Starknet-Specific Logic

### Deposit Flow (Starknet Wallet)

Invoke contract: `0x062da0780fae50d68cecaa5a051606dc21217ba290969b302db4dd99d2e9b470`

### Withdrawal Flow (Starknet Wallet)

```typescript
POST /api/v1/user/withdrawal
{
  chainId: "STRK",
  accountId: number,
  amount: string,
  asset: "USD",
  settlement: {
    recipient: string,
    positionId: number,
    collateralId: string,
    amount: string,
    expiration: { seconds: number },
    salt: number,
    signature: { r: string; s: string }
  }
}
```

### EVM Bridge Flow

1. `GET /api/v1/user/bridge/config` - Get supported chains
2. `GET /api/v1/user/bridge/quote` - Get quote
3. `POST /api/v1/user/bridge/quote` - Commit quote
4. Call `depositWithId` on source chain contract

Supported chains: Arbitrum, Ethereum, Base, BSC, Avalanche, Polygon

---

## SDK Reference

**Python SDK:** [x10xchange/python_sdk](https://github.com/x10xchange/python_sdk)

Key examples:
- Account onboarding
- Order management
- Transfers
- Withdrawals

---

## ExoTrade Implementation Checklist

### Must Implement
- [ ] WebSocket connection with sequence validation
- [ ] REST API fallback for snapshots
- [ ] Order signing with starknet.js (SNIP12)
- [ ] Builder code injection (serverless proxy)
- [ ] All error code translations

### Data Flows
- [ ] Order Book: WS → MDE → Zustand (≤100ms)
- [ ] BBO: WS → MDE → Zustand (≤10ms)  
- [ ] Mark Price: WS → MDE → Calculate Liq Price → Zustand
- [ ] Orders: REST + WS confirmation

### Security
- [ ] Builder code in server-side env var only
- [ ] API keys never exposed to client
- [ ] Stark private key stays in wallet
