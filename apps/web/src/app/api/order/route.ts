import { NextResponse } from 'next/server';

/**
 * Serverless Proxy for Order Submission
 * 
 * This endpoint injects the builder code before forwarding to Extended API.
 * The builder code is kept server-side to prevent client exposure.
 */

const EXTENDED_API_URL = process.env.NEXT_PUBLIC_EXTENDED_NETWORK === 'mainnet'
    ? 'https://api.starknet.extended.exchange/api/v1'
    : 'https://api.starknet.sepolia.extended.exchange/api/v1';

const BUILDER_CLIENT_ID = process.env.BUILDER_CLIENT_ID;
const BUILDER_FEE_RATE = process.env.BUILDER_FEE_RATE || '0.0001';

export async function POST(request: Request) {
    try {
        const orderPayload = await request.json();

        // Extract API key from the request (sent by client)
        const apiKey = request.headers.get('X-Api-Key');
        if (!apiKey) {
            return NextResponse.json(
                { status: 'ERROR', error: { code: 401, message: 'API key required' } },
                { status: 401 }
            );
        }

        // Inject builder code (server-side secret)
        const finalPayload = {
            ...orderPayload,
            builderId: BUILDER_CLIENT_ID ? parseInt(BUILDER_CLIENT_ID, 10) : undefined,
            builderFee: BUILDER_CLIENT_ID ? parseFloat(BUILDER_FEE_RATE) : undefined,
        };

        // Forward to Extended API
        const response = await fetch(`${EXTENDED_API_URL}/user/order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': apiKey,
                'User-Agent': 'ExoTrade/1.0',
            },
            body: JSON.stringify(finalPayload),
        });

        const data = await response.json();

        // Return the response from Extended
        return NextResponse.json(data, { status: response.status });

    } catch (error) {
        console.error('[Order Proxy] Error:', error);
        return NextResponse.json(
            {
                status: 'ERROR',
                error: {
                    code: 500,
                    message: error instanceof Error ? error.message : 'Internal server error'
                }
            },
            { status: 500 }
        );
    }
}
