'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000, // 1 minute
                retry: 2,
            },
        },
    }));

    return (
        <PrivyProvider
            appId={privyAppId}
            config={{
                appearance: {
                    theme: 'dark',
                    accentColor: '#22c55e', // Green accent
                    logo: '/logo.svg',
                },
                loginMethods: ['wallet', 'email', 'google', 'twitter'],
                embeddedWallets: {
                    createOnLogin: 'users-without-wallets',
                },
                // Starknet configuration
                defaultChain: {
                    id: 1, // Placeholder - Privy handles chain internally
                    name: 'Starknet',
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: { default: { http: ['https://starknet-mainnet.public.blastapi.io'] } },
                },
            }}
        >
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </PrivyProvider>
    );
}
