import { NextResponse } from 'next/server';

/**
 * CORS Proxy for Extended API
 * 
 * Proxies all REST requests to Extended API to avoid CORS issues in development.
 * Routes: /api/extended/[...path]
 */

const EXTENDED_API_URL = process.env.NEXT_PUBLIC_EXTENDED_NETWORK === 'mainnet'
    ? 'https://api.starknet.extended.exchange/api/v1'
    : 'https://api.starknet.sepolia.extended.exchange/api/v1';

/**
 * Fetch with retry and exponential backoff
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            lastError = error as Error;
            const isRetryable =
                error instanceof Error &&
                (error.name === 'AbortError' ||
                    error.message.includes('timeout') ||
                    error.message.includes('ETIMEDOUT') ||
                    error.message.includes('fetch failed'));

            if (!isRetryable || attempt === maxRetries - 1) {
                throw error;
            }

            // Exponential backoff: 1s, 2s, 4s
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`[Proxy] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError || new Error('Max retries exceeded');
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const pathString = path.join('/');
    const { searchParams } = new URL(request.url);

    // Build target URL
    let targetUrl = `${EXTENDED_API_URL}/${pathString}`;
    if (searchParams.toString()) {
        targetUrl += `?${searchParams.toString()}`;
    }

    // Check if this is a /user/ endpoint that requires auth
    const isUserEndpoint = pathString.startsWith('user/');
    const apiKeyFromRequest = request.headers.get('X-Api-Key');
    const accountIdFromRequest = request.headers.get('X-X10-ACTIVE-ACCOUNT');

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'ExoTrade/1.0',
        };

        // Forward API key if present
        if (apiKeyFromRequest) {
            headers['X-Api-Key'] = apiKeyFromRequest;
        }

        // Forward account ID if present
        if (accountIdFromRequest) {
            headers['X-X10-ACTIVE-ACCOUNT'] = accountIdFromRequest;
        }

        const response = await fetchWithRetry(targetUrl, {
            method: 'GET',
            headers,
        });

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
            const text = await response.text();
            console.error('[Proxy] Non-JSON response:', response.status, '| Body:', text.substring(0, 500));
            return NextResponse.json(
                { status: 'ERROR', error: { code: response.status, message: text.substring(0, 200) || 'Non-JSON response' } },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Proxy request failed';
        console.error('[Proxy] GET error:', message);
        return NextResponse.json(
            { status: 'ERROR', error: { code: 503, message: 'Extended API temporarily unavailable. Please try again.' } },
            { status: 503 }
        );
    }
}


export async function POST(
    request: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const pathString = path.join('/');
    const targetUrl = `${EXTENDED_API_URL}/${pathString}`;

    try {
        const body = await request.json();

        // Build headers, forwarding auth headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'ExoTrade/1.0',
        };

        // Forward API key if present
        if (request.headers.get('X-Api-Key')) {
            headers['X-Api-Key'] = request.headers.get('X-Api-Key')!;
        }

        // Forward L1 signature headers (used for API key creation)
        if (request.headers.get('L1_SIGNATURE')) {
            headers['L1_SIGNATURE'] = request.headers.get('L1_SIGNATURE')!;
        }
        if (request.headers.get('L1_MESSAGE_TIME')) {
            headers['L1_MESSAGE_TIME'] = request.headers.get('L1_MESSAGE_TIME')!;
        }
        if (request.headers.get('X-X10-ACTIVE-ACCOUNT')) {
            headers['X-X10-ACTIVE-ACCOUNT'] = request.headers.get('X-X10-ACTIVE-ACCOUNT')!;
        }

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
            const text = await response.text();
            console.error('[Proxy] POST non-JSON response:', response.status, text.substring(0, 200));
            return NextResponse.json(
                { status: 'ERROR', error: { code: response.status, message: text.substring(0, 100) || 'Request failed' } },
                { status: response.status || 500 }
            );
        }

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[Proxy] POST error:', error);
        return NextResponse.json(
            { status: 'ERROR', error: { code: 500, message: 'Proxy request failed' } },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const pathString = path.join('/');
    const { searchParams } = new URL(request.url);

    let targetUrl = `${EXTENDED_API_URL}/${pathString}`;
    if (searchParams.toString()) {
        targetUrl += `?${searchParams.toString()}`;
    }

    try {
        const response = await fetch(targetUrl, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ExoTrade/1.0',
                ...(request.headers.get('X-Api-Key')
                    ? { 'X-Api-Key': request.headers.get('X-Api-Key')! }
                    : {}),
            },
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[Proxy] DELETE error:', error);
        return NextResponse.json(
            { status: 'ERROR', error: { code: 500, message: 'Proxy request failed' } },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const pathString = path.join('/');
    const targetUrl = `${EXTENDED_API_URL}/${pathString}`;

    try {
        const body = await request.json();

        const response = await fetch(targetUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ExoTrade/1.0',
                ...(request.headers.get('X-Api-Key')
                    ? { 'X-Api-Key': request.headers.get('X-Api-Key')! }
                    : {}),
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[Proxy] PATCH error:', error);
        return NextResponse.json(
            { status: 'ERROR', error: { code: 500, message: 'Proxy request failed' } },
            { status: 500 }
        );
    }
}
