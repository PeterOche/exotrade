import { NextResponse } from 'next/server';

/**
 * Onboarding API Route
 * 
 * Proxies onboarding requests to Extended API to avoid CORS issues.
 */

const EXTENDED_API_URL = process.env.NEXT_PUBLIC_EXTENDED_NETWORK === 'mainnet'
    ? 'https://api.starknet.extended.exchange'
    : 'https://api.starknet.sepolia.extended.exchange';

export async function POST(request: Request) {
    try {
        const payload = await request.json();

        console.log('[Onboarding Proxy] Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(`${EXTENDED_API_URL}/auth/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ExoTrade/1.0',
            },
            body: JSON.stringify(payload),
        });

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
            const text = await response.text();
            console.error('[Onboarding Proxy] Non-JSON response:', response.status, text.substring(0, 500));
            return NextResponse.json(
                {
                    status: 'ERROR',
                    error: {
                        code: response.status,
                        message: text.substring(0, 200) || 'Onboarding failed'
                    }
                },
                { status: response.status }
            );
        }

        const data = await response.json();
        console.log('[Onboarding Proxy] Response:', response.status, JSON.stringify(data, null, 2));

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Onboarding request failed';
        console.error('[Onboarding Proxy] Error:', message, error);
        return NextResponse.json(
            { status: 'ERROR', error: { code: 500, message } },
            { status: 500 }
        );
    }
}
