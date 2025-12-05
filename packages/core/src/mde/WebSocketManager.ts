import type { ExtendedConfig } from '../config';
import { DEFAULT_CONFIG } from '../config';

export type WSStreamType =
    | 'orderbook'
    | 'trades'
    | 'funding'
    | 'candles'
    | 'mark-price'
    | 'index-price'
    | 'account';

export interface WSSubscription {
    type: WSStreamType;
    market?: string;
    interval?: string;
    depth?: number;
}

interface WSMessage {
    type: string;
    ts: number;
    seq: number;
    data: unknown;
}

type MessageHandler = (message: WSMessage) => void;

/**
 * WebSocket Manager
 * Handles WebSocket connections to Extended exchange
 */
export class WebSocketManager {
    private config: ExtendedConfig;
    private publicWs: WebSocket | null = null;
    private privateWs: WebSocket | null = null;
    private apiKey: string | null = null;
    private messageHandlers: Map<WSStreamType, MessageHandler[]> = new Map();
    private sequences: Map<string, number> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 1000;
    private pingInterval: ReturnType<typeof setInterval> | null = null;
    private isConnecting = false;

    constructor(config: ExtendedConfig = DEFAULT_CONFIG) {
        this.config = config;
    }

    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
    }

    private getPublicStreamUrl(subscription: WSSubscription): string {
        const base = this.config.streamUrl;

        switch (subscription.type) {
            case 'orderbook':
                let url = `${base}/orderbooks`;
                if (subscription.market) url += `/${subscription.market}`;
                if (subscription.depth) url += `?depth=${subscription.depth}`;
                return url;

            case 'trades':
                return subscription.market
                    ? `${base}/publicTrades/${subscription.market}`
                    : `${base}/publicTrades`;

            case 'funding':
                return subscription.market
                    ? `${base}/funding/${subscription.market}`
                    : `${base}/funding`;

            case 'candles':
                return `${base}/candles/${subscription.market}/${subscription.type}?interval=${subscription.interval}`;

            case 'mark-price':
                return subscription.market
                    ? `${base}/prices/mark/${subscription.market}`
                    : `${base}/prices/mark`;

            case 'index-price':
                return subscription.market
                    ? `${base}/prices/index/${subscription.market}`
                    : `${base}/prices/index`;

            default:
                throw new Error(`Unknown stream type: ${subscription.type}`);
        }
    }

    private getPrivateStreamUrl(): string {
        // Private streams use ws:// not wss://
        const base = this.config.streamUrl.replace('wss://', 'ws://');
        return `${base}/account`;
    }

    async connectPublic(subscriptions: WSSubscription[]): Promise<void> {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            // For simplicity, we connect to one stream at a time
            // In production, you might want to multiplex or use multiple connections
            for (const sub of subscriptions) {
                if (sub.type === 'account') continue; // Skip private streams

                const url = this.getPublicStreamUrl(sub);
                this.publicWs = new WebSocket(url);

                this.publicWs.onopen = () => {
                    console.log(`[WS] Connected to ${sub.type} stream`);
                    this.reconnectAttempts = 0;
                    this.startPing();
                };

                this.publicWs.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data) as WSMessage;
                        this.handleMessage(sub.type, message);
                    } catch (error) {
                        console.error('[WS] Failed to parse message:', error);
                    }
                };

                this.publicWs.onclose = () => {
                    console.log(`[WS] Disconnected from ${sub.type} stream`);
                    this.stopPing();
                    this.scheduleReconnect(subscriptions);
                };

                this.publicWs.onerror = (error) => {
                    console.error('[WS] Error:', error);
                };
            }
        } finally {
            this.isConnecting = false;
        }
    }

    async connectPrivate(): Promise<void> {
        if (!this.apiKey) {
            throw new Error('API key required for private streams');
        }

        const url = this.getPrivateStreamUrl();

        // Note: Browser WebSocket doesn't support custom headers
        // Private streams require API key in the URL or via query params
        // For now, we'll use the URL - actual implementation may need server-side proxy
        const urlWithAuth = `${url}?apiKey=${encodeURIComponent(this.apiKey)}`;
        this.privateWs = new WebSocket(urlWithAuth);

        this.privateWs.onopen = () => {
            console.log('[WS] Connected to private stream');
        };

        this.privateWs.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data) as WSMessage;
                this.handleMessage('account', message);
            } catch (error) {
                console.error('[WS] Failed to parse private message:', error);
            }
        };

        this.privateWs.onclose = () => {
            console.log('[WS] Disconnected from private stream');
            // Reconnect private stream
            setTimeout(() => this.connectPrivate(), this.reconnectDelay);
        };
    }

    private handleMessage(streamType: WSStreamType, message: WSMessage) {
        // Validate sequence number
        const seqKey = `${streamType}-${message.type}`;
        const lastSeq = this.sequences.get(seqKey);

        if (lastSeq !== undefined && message.seq !== lastSeq + 1) {
            // Sequence break detected - need to reconnect
            console.warn(`[WS] Sequence break on ${streamType}: expected ${lastSeq + 1}, got ${message.seq}`);
            this.onSequenceBreak(streamType);
            return;
        }

        this.sequences.set(seqKey, message.seq);

        // Dispatch to handlers
        const handlers = this.messageHandlers.get(streamType) || [];
        for (const handler of handlers) {
            try {
                handler(message);
            } catch (error) {
                console.error(`[WS] Handler error for ${streamType}:`, error);
            }
        }
    }

    private onSequenceBreak(streamType: WSStreamType) {
        // Emit event for MDE to handle reconciliation
        const handlers = this.messageHandlers.get(streamType) || [];
        for (const handler of handlers) {
            handler({
                type: 'SEQUENCE_BREAK',
                ts: Date.now(),
                seq: -1,
                data: null,
            });
        }
    }

    on(streamType: WSStreamType, handler: MessageHandler) {
        const handlers = this.messageHandlers.get(streamType) || [];
        handlers.push(handler);
        this.messageHandlers.set(streamType, handlers);
    }

    off(streamType: WSStreamType, handler: MessageHandler) {
        const handlers = this.messageHandlers.get(streamType) || [];
        const index = handlers.indexOf(handler);
        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }

    private startPing() {
        this.pingInterval = setInterval(() => {
            if (this.publicWs?.readyState === WebSocket.OPEN) {
                this.publicWs.send(JSON.stringify({ type: 'ping' }));
            }
            if (this.privateWs?.readyState === WebSocket.OPEN) {
                this.privateWs.send(JSON.stringify({ type: 'ping' }));
            }
        }, 15000);
    }

    private stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private scheduleReconnect(subscriptions: WSSubscription[]) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WS] Max reconnect attempts reached');
            return;
        }

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;

        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connectPublic(subscriptions);
        }, delay);
    }

    disconnect() {
        this.stopPing();

        if (this.publicWs) {
            this.publicWs.close();
            this.publicWs = null;
        }

        if (this.privateWs) {
            this.privateWs.close();
            this.privateWs = null;
        }

        this.sequences.clear();
        this.messageHandlers.clear();
    }
}

// Singleton instance
export const wsManager = new WebSocketManager();
