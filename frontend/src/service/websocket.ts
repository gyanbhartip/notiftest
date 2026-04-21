import { store } from '../store';
import {
    clearActiveOffer,
    offerReceived,
    offerSuperseded,
} from '../store/offerSlice';
import { presenceAcked, presenceServerIntent } from '../store/presenceSlice';
import { getDeviceId } from './deviceId';
import { EnvelopeError, validateEnvelope } from './envelope';

const WS_URL =
    process.env.EXPO_PUBLIC_WS_URL ??
    'ws://127.0.0.1:8000/api/ws/notifications';

type Status = 'connecting' | 'open' | 'closed' | 'error';
type StatusListener = (s: Status) => void;

let socket: WebSocket | null = null;
const listeners = new Set<StatusListener>();

const notify = (s: Status): void => {
    listeners.forEach(l => l(s));
};

const sendHello = async (): Promise<void> => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const state = store.getState();
    const device_id = await getDeviceId();
    socket.send(
        JSON.stringify({
            type: 'hello',
            device_id,
            intent: state.presence.intent,
            last_offer_id: state.offer.activeOffer?.offer_id ?? null,
            last_action: state.offer.pendingAction ?? null,
        }),
    );
};

const schedulePing = (): (() => void) => {
    const id = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
    }, 20_000);
    return () => clearInterval(id);
};

const handleMessage = (raw: string): void => {
    let msg: unknown;
    try {
        msg = JSON.parse(raw);
    } catch {
        return;
    }
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;

    switch (m.type) {
        case 'offer': {
            try {
                const envelope = validateEnvelope(m.envelope);
                store.dispatch(offerReceived(envelope));
            } catch (err) {
                if (err instanceof EnvelopeError) {
                    console.warn('bad envelope', err.message);
                } else {
                    console.warn('envelope dispatch failed', err);
                }
            }
            break;
        }
        case 'offer_still_live': {
            // server says offer still open; we keep current modal if ids match.
            break;
        }
        case 'offer_resolved': {
            const id = m.offer_id;
            if (typeof id !== 'string') return;
            const active = store.getState().offer.activeOffer;
            if (active?.offer_id === id) {
                store.dispatch(clearActiveOffer());
            }
            break;
        }
        case 'unknown_offer': {
            const id = m.offer_id;
            if (typeof id !== 'string') return;
            const active = store.getState().offer.activeOffer;
            if (active?.offer_id === id) {
                store.dispatch(offerSuperseded(id));
            }
            break;
        }
        case 'intent_mismatch': {
            const si = m.server_intent;
            if (si === 'online' || si === 'offline') {
                store.dispatch(presenceServerIntent(si));
            }
            break;
        }
        case 'pong': {
            store.dispatch(presenceAcked(new Date().toISOString()));
            break;
        }
        default:
            break;
    }
};

let cancelPing: (() => void) | null = null;

export const connectWebSocket = async (): Promise<void> => {
    if (
        socket &&
        (socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING)
    ) {
        return;
    }
    notify('connecting');
    const deviceId = await getDeviceId();
    socket = new WebSocket(`${WS_URL}?user_id=${encodeURIComponent(deviceId)}`);

    socket.onopen = () => {
        notify('open');
        void sendHello();
        cancelPing = schedulePing();
    };
    socket.onmessage = ev => handleMessage(ev.data as string);
    socket.onerror = () => notify('error');
    socket.onclose = () => {
        notify('closed');
        socket = null;
        if (cancelPing) {
            cancelPing();
            cancelPing = null;
        }
    };
};

export const disconnectWebSocket = (): void => {
    if (socket) {
        socket.close();
        socket = null;
    }
};

export const onWsStatus = (listener: StatusListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
