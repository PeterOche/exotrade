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

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ExoTrade/1.0',
                // Forward API key if present
                ...(request.headers.get('X-Api-Key')
                    ? { 'X-Api-Key': request.headers.get('X-Api-Key')! }
                    : {}),
            },
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[Proxy] GET error:', error);
        return NextResponse.json(
            { status: 'ERROR', error: { code: 500, message: 'Proxy request failed' } },
            { status: 500 }
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

        const response = await fetch(targetUrl, {
            method: 'POST',
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
