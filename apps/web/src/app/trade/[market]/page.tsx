'use client';

import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter, useParams } from 'next/navigation';
import { getMDE, useMarketStore, useAccountStore } from '@exotrade/core';

// Components (will be created)
import { Header } from '@/components/trade/Header';
import { MobileNav } from '@/components/trade/MobileNav';
import { ChartPanel } from '@/components/trade/ChartPanel';
import { OrderPanel } from '@/components/trade/OrderPanel';
import { RiskPanel } from '@/components/trade/RiskPanel';
import { useUIStore } from '@exotrade/core';

export default function TradePage() {
    const router = useRouter();
    const params = useParams();
    const market = params.market as string;

    const { authenticated, ready } = usePrivy();
    const activePanel = useUIStore((s) => s.activePanel);
    const orderBook = useMarketStore((s) => s.orderBook);
    const balance = useAccountStore((s) => s.balance);

    // Redirect if not authenticated
    useEffect(() => {
        if (ready && !authenticated) {
            router.push('/');
        }
    }, [ready, authenticated, router]);

    // Initialize Market Data Engine
    useEffect(() => {
        if (authenticated && market) {
            const mde = getMDE();
            mde.start(market);

            return () => {
                mde.stop();
            };
        }
    }, [authenticated, market]);

    if (!ready || !authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-zinc-950">
            {/* Header */}
            <Header market={market} />

            {/* Main Content - Panels */}
            <main className="flex-1 overflow-hidden">
                {/* Chart Panel */}
                <div className={`h-full ${activePanel === 'chart' ? 'block' : 'hidden md:block'}`}>
                    <ChartPanel market={market} />
                </div>

                {/* Order Panel */}
                <div className={`h-full ${activePanel === 'order' ? 'block' : 'hidden md:block'}`}>
                    <OrderPanel market={market} />
                </div>

                {/* Risk Panel */}
                <div className={`h-full ${activePanel === 'risk' ? 'block' : 'hidden md:block'}`}>
                    <RiskPanel />
                </div>
            </main>

            {/* Mobile Navigation */}
            <MobileNav />
        </div>
    );
}
