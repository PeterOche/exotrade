'use client';

import { useMarketStore } from '@exotrade/core';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';

interface HeaderProps {
    market: string;
}

export function Header({ market }: HeaderProps) {
    const { logout } = usePrivy();
    const marketData = useMarketStore((s) =>
        s.markets.find((m) => m.name === market)
    );
    const markPrice = useMarketStore((s) => s.markPrices[market]);

    const priceChange = marketData?.marketStats.dailyPriceChangePercentage || '0';
    const priceChangeNum = parseFloat(priceChange);
    const isPositive = priceChangeNum >= 0;

    return (
        <header className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
            {/* Logo and Market */}
            <div className="flex items-center gap-4">
                <Link href="/" className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                        <span className="text-sm font-bold text-white">E</span>
                    </div>
                </Link>

                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">{market}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                            {isPositive ? '+' : ''}{priceChange}%
                        </span>
                    </div>
                    <span className="text-lg font-mono font-medium">
                        ${markPrice || marketData?.marketStats.markPrice || '—'}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={logout}
                    className="p-2 text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Disconnect"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>
        </header>
    );
}
