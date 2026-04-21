import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HistoryEntry, OfferEnvelope } from '../types/offer';
import type { PresenceIntent } from '../types/presence';

export const PERSIST_KEY = 'notiftest:v1';
export const PERSIST_VERSION = 1;

export type PersistedShape = {
    offer: {
        activeOffer: OfferEnvelope | null;
        history: Array<HistoryEntry>;
        acceptedOfferIds: Array<string>;
    };
    presence: {
        intent: PresenceIntent;
        lastAck: string | null;
    };
};

type Envelope = {
    version: number;
    data: PersistedShape;
};

export const savePersisted = async (data: PersistedShape): Promise<void> => {
    const payload: Envelope = { version: PERSIST_VERSION, data };
    try {
        await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
    } catch (err) {
        console.warn('persist save failed', err);
    }
};

export const loadPersisted = async (): Promise<PersistedShape | null> => {
    try {
        const raw = await AsyncStorage.getItem(PERSIST_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Envelope;
        if (parsed.version !== PERSIST_VERSION) {
            await AsyncStorage.removeItem(PERSIST_KEY);
            return null;
        }
        const active = parsed.data.offer.activeOffer;
        if (active) {
            const exp = Date.parse(active.expires_at);
            if (Number.isFinite(exp) && Date.now() > exp) {
                parsed.data.offer.activeOffer = null;
            }
        }
        return parsed.data;
    } catch (err) {
        console.warn('persist load failed', err);
        return null;
    }
};

export const PENDING_MUTATION_PREFIX = 'pending_mutations:';

export type PendingMutation = {
    offer_id: string;
    action: 'accept' | 'decline';
    reason?: string;
    other_text?: string;
    ts: number;
};

export const writePendingMutation = async (
    m: PendingMutation,
): Promise<void> => {
    await AsyncStorage.setItem(
        `${PENDING_MUTATION_PREFIX}${m.offer_id}`,
        JSON.stringify(m),
    );
};

export const drainPendingMutations = async (): Promise<
    Array<PendingMutation>
> => {
    const keys = await AsyncStorage.getAllKeys();
    const matching = keys.filter(k => k.startsWith(PENDING_MUTATION_PREFIX));
    const out: Array<PendingMutation> = [];
    for (const key of matching) {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        try {
            out.push(JSON.parse(raw) as PendingMutation);
        } catch {
            // corrupt — drop
        }
        await AsyncStorage.removeItem(key);
    }
    return out;
};
