'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useRouter, useParams } from 'next/navigation';
import {
    getMDE,
    useMarketStore,
    useAccountStore,
    orderService,
    onboardingService,
    TESTNET_CONFIG
} from '@exotrade/core';

// Components
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
    const [isCheckingCredentials, setIsCheckingCredentials] = useState(true);

    // Redirect if not authenticated
    useEffect(() => {
        if (ready && !authenticated) {
            router.push('/');
        }
    }, [ready, authenticated, router]);

    // Check for stored credentials on mount
    useEffect(() => {
        if (!authenticated || !wallets.length) {
            setIsCheckingCredentials(false);
            return;
        }

        const wallet = wallets[0];
        if (!wallet?.address) {
            setIsCheckingCredentials(false);
            return;
        }

        // Check for existing credentials
        const checkCredentials = async () => {
            try {
                const credentials = await onboardingService.checkOnboardingStatus(wallet.address);
                if (credentials) {
                    console.log('[TradePage] Found stored credentials');
                    // Set up OrderService with stored credentials
                    orderService.setCredentials(
                        credentials.starkPrivateKey,
                        credentials.starkPublicKey,
                        String(credentials.vault)
                    );
                    orderService.setConfig(TESTNET_CONFIG);
                    setIsOnboarded(true);
                }
            } catch (error) {
                console.error('[TradePage] Error checking credentials:', error);
            } finally {
                setIsCheckingCredentials(false);
            }
        };

        checkCredentials();
    }, [authenticated, wallets]);

    // Setup credentials by signing and onboarding
    const setupCredentials = useCallback(async () => {
        if (!authenticated || !wallets.length || isOnboarded) return;

        setIsOnboarding(true);
        setOnboardingError(null);

        try {
            const wallet = wallets[0];

            if (!wallet?.address) {
                throw new Error('Wallet not ready. Please try again.');
            }

            console.log('[TradePage] Starting onboarding for:', wallet.address);

            // Get the Ethereum provider for signing
            const provider = await wallet.getEthereumProvider();

            // Create a sign typed data function for the onboarding service
            const signTypedData = async (typedData: object): Promise<string> => {
                // eth_signTypedData_v4 expects the typed data as a JSON string
                const signature = await provider.request({
                    method: 'eth_signTypedData_v4',
                    params: [wallet.address, JSON.stringify(typedData)],
                }) as string;
                return signature;
            };

            // Create a sign message function for API key creation
            const signMessage = async (message: string): Promise<string> => {
                const signature = await provider.request({
                    method: 'personal_sign',
                    params: [message, wallet.address],
                }) as string;
                return signature;
            };

            // Attempt full Extended onboarding
            console.log('[TradePage] Attempting Extended onboarding...');
            try {
                const credentials = await onboardingService.onboard(
                    wallet.address,
                    signTypedData,
                    signMessage
                );
                console.log('[TradePage] Onboarding successful, vault:', credentials.vault);

                // Set OrderService credentials
                orderService.setCredentials(
                    credentials.starkPrivateKey,
                    credentials.starkPublicKey,
                    String(credentials.vault)
                );
            } catch (onboardingError) {
                // If full onboarding fails, try simplified key derivation
                console.warn('[TradePage] Full onboarding failed:', onboardingError);
                console.log('[TradePage] Falling back to simplified key derivation...');

                // Sign a simple message for key derivation
                const message = [
                    'ExoTrade Key Derivation',
                    '',
                    `Domain: ${TESTNET_CONFIG.signingDomain}`,
                    `Wallet: ${wallet.address}`,
                    'Account Index: 0',
                    '',
                    'I accept the Terms of Service'
                ].join('\n');

                const signature = await provider.request({
                    method: 'personal_sign',
                    params: [message, wallet.address],
                }) as string;

                const { privateKey, publicKey } = onboardingService.deriveStarkKeyFromSignature(signature);
                orderService.setCredentials(privateKey, publicKey, '1');
                console.log('[TradePage] Simplified setup complete (orders may fail without API key)');
            }

            orderService.setConfig(TESTNET_CONFIG);
            setIsOnboarded(true);
            console.log('[TradePage] Trading setup complete');
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

    // Show loading while checking credentials
    if (isCheckingCredentials) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                <p className="mt-4 text-zinc-400">Loading...</p>
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
                        Sign a message to derive your trading keys and register with Extended. This is required to place orders.
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

