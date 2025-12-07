'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useRouter, useParams } from 'next/navigation';
import { getMDE, useMarketStore, useAccountStore, orderService, TESTNET_CONFIG } from '@exotrade/core';

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
    const { wallets } = useWallets();
    const activePanel = useUIStore((s) => s.activePanel);
    const orderBook = useMarketStore((s) => s.orderBook);
    const balance = useAccountStore((s) => s.balance);

    const [isOnboarding, setIsOnboarding] = useState(false);
    const [onboardingError, setOnboardingError] = useState<string | null>(null);
    const [isOnboarded, setIsOnboarded] = useState(false);

    // Redirect if not authenticated
    useEffect(() => {
        if (ready && !authenticated) {
            router.push('/');
        }
    }, [ready, authenticated, router]);

    // Setup order signing credentials
    const setupCredentials = useCallback(async () => {
        if (!authenticated || !wallets.length || isOnboarded) return;

        setIsOnboarding(true);
        setOnboardingError(null);

        try {
            const wallet = wallets[0];

            if (!wallet?.address) {
                throw new Error('Wallet not ready. Please try again.');
            }

            // Create a deterministic message for key derivation
            const message = [
                'ExoTrade Key Derivation',
                '',
                `Domain: ${TESTNET_CONFIG.signingDomain}`,
                `Wallet: ${wallet.address}`,
                'Account Index: 0',
                '',
                'I accept the Terms of Service'
            ].join('\n');

            console.log('[TradePage] Signing message:', message);

            // Use the wallet provider to sign
            const provider = await wallet.getEthereumProvider();
            const signature = await provider.request({
                method: 'personal_sign',
                params: [message, wallet.address],
            }) as string;

            console.log('[TradePage] Signature:', signature);
            // Derive keys from signature
            const { privateKey, publicKey } = orderService.deriveKeysFromSignature(signature);

            // Set credentials (using placeholder vault for now)
            orderService.setCredentials(privateKey, publicKey, '1');
            orderService.setConfig(TESTNET_CONFIG);

            setIsOnboarded(true);
            console.log('[TradePage] Order signing credentials set');
            console.log('[TradePage] Public key:', publicKey);
        } catch (error) {
            console.error('[TradePage] Failed to setup credentials:', error);
            setOnboardingError(error instanceof Error ? error.message : 'Failed to setup trading');
        } finally {
            setIsOnboarding(false);
        }
    }, [authenticated, wallets, isOnboarded]);

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

    // Show onboarding UI if not yet onboarded
    if (!isOnboarded) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6">
                <div className="max-w-md w-full text-center space-y-6">
                    <h2 className="text-2xl font-bold">Setup Trading</h2>
                    <p className="text-zinc-400">
                        Sign a message to derive your trading keys. This is required to place orders.
                    </p>

                    {onboardingError && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {onboardingError}
                        </div>
                    )}

                    <button
                        onClick={setupCredentials}
                        disabled={isOnboarding}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {isOnboarding ? (
                            <span className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Setting up...
                            </span>
                        ) : (
                            'Enable Trading'
                        )}
                    </button>
                </div>
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
