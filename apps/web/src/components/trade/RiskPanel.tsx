'use client';

import { useAccountStore, useOrderStore } from '@exotrade/core';
import type { Position, Order } from '@exotrade/core';

export function RiskPanel() {
    const balance = useAccountStore((s) => s.balance);
    const positions = useAccountStore((s) => s.positions);
    const openOrders = useOrderStore((s) => s.openOrders);

    return (
        <div className="h-full flex flex-col overflow-auto pb-20 md:pb-0">
            {/* Balance Section */}
            <div className="p-4 border-b border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-400 mb-3">Account</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-xs text-zinc-500">Equity</div>
                        <div className="text-lg font-mono font-medium">
                            ${balance?.equity || '0.00'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-zinc-500">Available</div>
                        <div className="text-lg font-mono font-medium">
                            ${balance?.availableForTrade || '0.00'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-zinc-500">Unrealized P&L</div>
                        <div className={`text-lg font-mono font-medium ${parseFloat(balance?.unrealisedPnl || '0') >= 0
                                ? 'text-green-400'
                                : 'text-red-400'
                            }`}>
                            {parseFloat(balance?.unrealisedPnl || '0') >= 0 ? '+' : ''}
                            ${balance?.unrealisedPnl || '0.00'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-zinc-500">Margin Ratio</div>
                        <div className="text-lg font-mono font-medium">
                            {balance?.marginRatio || '0'}%
                        </div>
                    </div>
                </div>
            </div>

            {/* Positions Section */}
            <div className="p-4 border-b border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-400 mb-3">
                    Positions ({positions.length})
                </h3>
                {positions.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">
                        No open positions
                    </div>
                ) : (
                    <div className="space-y-3">
                        {positions.map((position) => (
                            <PositionCard key={position.id} position={position} />
                        ))}
                    </div>
                )}
            </div>

            {/* Open Orders Section */}
            <div className="p-4">
                <h3 className="text-sm font-medium text-zinc-400 mb-3">
                    Open Orders ({openOrders.length})
                </h3>
                {openOrders.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">
                        No open orders
                    </div>
                ) : (
                    <div className="space-y-2">
                        {openOrders.map((order) => (
                            <OrderCard key={order.id} order={order} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function PositionCard({ position }: { position: Position }) {
    const pnl = parseFloat(position.unrealisedPnl);
    const isProfit = pnl >= 0;

    return (
        <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="font-medium">{position.market}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${position.side === 'LONG'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                        {position.side} {position.leverage}x
                    </span>
                </div>
                <button className="text-xs text-zinc-500 hover:text-red-400 transition-colors">
                    Close
                </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                    <div className="text-xs text-zinc-500">Size</div>
                    <div className="font-mono">${position.value}</div>
                </div>
                <div>
                    <div className="text-xs text-zinc-500">Entry</div>
                    <div className="font-mono">${position.openPrice}</div>
                </div>
                <div>
                    <div className="text-xs text-zinc-500">P&L</div>
                    <div className={`font-mono ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}${position.unrealisedPnl}
                    </div>
                </div>
            </div>

            {/* Liquidation Warning */}
            <div className="mt-2 text-xs text-zinc-500">
                Liq. Price: <span className="text-orange-400 font-mono">${position.liquidationPrice}</span>
            </div>
        </div>
    );
}

function OrderCard({ order }: { order: Order }) {
    return (
        <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{order.market}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${order.side === 'BUY'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                        {order.side}
                    </span>
                    <span className="text-xs text-zinc-500">{order.type}</span>
                </div>
                <button className="text-xs text-zinc-500 hover:text-red-400 transition-colors">
                    Cancel
                </button>
            </div>
            <div className="flex justify-between mt-2 text-sm text-zinc-400">
                <span className="font-mono">{order.qty} @ ${order.price}</span>
                <span className="text-xs">{order.status}</span>
            </div>
        </div>
    );
}
