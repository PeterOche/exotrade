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

        // Extract API key from the request
        const apiKey = request.headers.get('X-Api-Key');

        // For now, skip builder injection if no valid builder ID
        // Builder integration requires registration with Extended
        const finalPayload = { ...orderPayload };

        // Only inject builder if explicitly configured and valid
        if (BUILDER_CLIENT_ID && parseInt(BUILDER_CLIENT_ID, 10) > 0) {
            // NOTE: Builder ID must be registered with Extended first
            // finalPayload.builderId = parseInt(BUILDER_CLIENT_ID, 10);
            // finalPayload.builderFee = parseFloat(BUILDER_FEE_RATE);
        }

        console.log('[Order Proxy] Submitting order to Extended API');
        console.log('[Order Proxy] Payload:', JSON.stringify(finalPayload, null, 2));

        // Forward to Extended API
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'ExoTrade/1.0',
        };

        // Add API key if available
        if (apiKey) {
            headers['X-Api-Key'] = apiKey;
        }

        const response = await fetch(`${EXTENDED_API_URL}/user/order`, {
            method: 'POST',
            headers,
            body: JSON.stringify(finalPayload),
        });

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
            const text = await response.text();
            console.error('[Order Proxy] Non-JSON response:', response.status, text.substring(0, 500));
            return NextResponse.json(
                {
                    status: 'ERROR',
                    error: {
                        code: response.status,
                        message: `Extended API error (${response.status}): ${text.substring(0, 100) || 'Unknown error'}`
                    }
                },
                { status: response.status }
            );
        }

        const data = await response.json();
        console.log('[Order Proxy] Response:', response.status, JSON.stringify(data, null, 2));

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
