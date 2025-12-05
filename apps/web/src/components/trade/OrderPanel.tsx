'use client';

import { useState } from 'react';
import { useMarketStore } from '@exotrade/core';
import { orderService } from '@exotrade/core';
import type { OrderSide } from '@exotrade/core';

interface OrderPanelProps {
    market: string;
}

type OrderType = 'MARKET' | 'LIMIT';

export function OrderPanel({ market }: OrderPanelProps) {
    const [orderType, setOrderType] = useState<OrderType>('MARKET');
    const [side, setSide] = useState<OrderSide>('BUY');
    const [size, setSize] = useState('');
    const [price, setPrice] = useState('');
    const [leverage, setLeverage] = useState('10');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [tpPrice, setTpPrice] = useState('');
    const [slPrice, setSlPrice] = useState('');
    const [reduceOnly, setReduceOnly] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const orderBook = useMarketStore((s) => s.orderBook);
    const bestBid = orderBook?.bids[0]?.price || '—';
    const bestAsk = orderBook?.asks[0]?.price || '—';

    const handleSubmit = async () => {
        if (!size) {
            setError('Please enter a size');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await orderService.createOrder({
                market,
                side,
                type: orderType,
                size,
                price: orderType === 'LIMIT' ? price : undefined,
                leverage,
                reduceOnly,
                takeProfit: tpPrice ? { triggerPrice: tpPrice } : undefined,
                stopLoss: slPrice ? { triggerPrice: slPrice } : undefined,
            });

            // Clear form on success
            setSize('');
            setPrice('');
            setTpPrice('');
            setSlPrice('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Order failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="h-full flex flex-col overflow-auto">
            <div className="px-4 py-3 border-b border-zinc-800">
                <span className="text-sm font-medium">Place Order</span>
            </div>

            <div className="flex-1 p-4 space-y-4 pb-20 md:pb-4">
                {/* Order Type Toggle */}
                <div className="flex rounded-lg bg-zinc-900 p-1">
                    {(['MARKET', 'LIMIT'] as const).map((type) => (
                        <button
                            key={type}
                            onClick={() => setOrderType(type)}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${orderType === type
                                    ? 'bg-zinc-800 text-white'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>

                {/* Side Toggle */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setSide('BUY')}
                        className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${side === 'BUY'
                                ? 'bg-green-600 text-white'
                                : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                            }`}
                    >
                        Long
                    </button>
                    <button
                        onClick={() => setSide('SELL')}
                        className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${side === 'SELL'
                                ? 'bg-red-600 text-white'
                                : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                            }`}
                    >
                        Short
                    </button>
                </div>

                {/* BBO Display */}
                <div className="flex justify-between text-sm">
                    <div>
                        <span className="text-zinc-500">Bid: </span>
                        <span className="text-green-400 font-mono">{bestBid}</span>
                    </div>
                    <div>
                        <span className="text-zinc-500">Ask: </span>
                        <span className="text-red-400 font-mono">{bestAsk}</span>
                    </div>
                </div>

                {/* Price Input (for Limit orders) */}
                {orderType === 'LIMIT' && (
                    <div>
                        <label className="block text-sm text-zinc-400 mb-1">Price</label>
                        <input
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-green-500 focus:outline-none font-mono"
                        />
                    </div>
                )}

                {/* Size Input */}
                <div>
                    <label className="block text-sm text-zinc-400 mb-1">Size (USD)</label>
                    <input
                        type="number"
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-green-500 focus:outline-none font-mono"
                    />
                    <div className="flex gap-2 mt-2">
                        {['25%', '50%', '75%', '100%'].map((pct) => (
                            <button
                                key={pct}
                                className="flex-1 py-1.5 text-xs rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400"
                            >
                                {pct}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Leverage Slider */}
                <div>
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-400">Leverage</span>
                        <span className="font-mono">{leverage}x</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="50"
                        value={leverage}
                        onChange={(e) => setLeverage(e.target.value)}
                        className="w-full accent-green-500"
                    />
                </div>

                {/* Advanced Options */}
                <button
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300"
                >
                    <svg
                        className={`w-4 h-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Advanced
                </button>

                {isAdvancedOpen && (
                    <div className="space-y-4 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                        {/* TP/SL */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-zinc-500 mb-1">Take Profit</label>
                                <input
                                    type="number"
                                    value={tpPrice}
                                    onChange={(e) => setTpPrice(e.target.value)}
                                    placeholder="Price"
                                    className="w-full px-3 py-2 text-sm rounded bg-zinc-900 border border-zinc-800 focus:border-green-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-zinc-500 mb-1">Stop Loss</label>
                                <input
                                    type="number"
                                    value={slPrice}
                                    onChange={(e) => setSlPrice(e.target.value)}
                                    placeholder="Price"
                                    className="w-full px-3 py-2 text-sm rounded bg-zinc-900 border border-zinc-800 focus:border-red-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Reduce Only */}
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={reduceOnly}
                                onChange={(e) => setReduceOnly(e.target.checked)}
                                className="rounded border-zinc-700 bg-zinc-900 text-green-500 focus:ring-green-500"
                            />
                            <span className="text-zinc-400">Reduce Only</span>
                        </label>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Submit Button */}
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !size}
                    className={`w-full py-4 rounded-xl font-semibold text-lg transition-colors ${side === 'BUY'
                            ? 'bg-green-600 hover:bg-green-500 disabled:bg-green-800'
                            : 'bg-red-600 hover:bg-red-500 disabled:bg-red-800'
                        } disabled:cursor-not-allowed`}
                >
                    {isSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Submitting...
                        </span>
                    ) : (
                        `${side === 'BUY' ? 'Long' : 'Short'} ${market.split('-')[0]}`
                    )}
                </button>
            </div>
        </div>
    );
}
