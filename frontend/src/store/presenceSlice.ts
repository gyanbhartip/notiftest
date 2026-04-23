import {
    createAsyncThunk,
    createSlice,
    type PayloadAction,
} from '@reduxjs/toolkit';

import { setPresenceIntent } from '../service/presenceApi';
import type { PresenceIntent, PresenceStatus } from '../types/presence';
import { hydrateFromStorage } from './hydrate';

export type PresenceState = {
    intent: PresenceIntent;
    status: PresenceStatus;
    lastAck: string | null;
    lastError: string | null;
};

const initialState: PresenceState = {
    intent: 'offline',
    status: 'offline',
    lastAck: null,
    lastError: null,
};

export const toggleIntent = createAsyncThunk<
    { intent: PresenceIntent; server_time: string },
    { device_id: string; intent: PresenceIntent },
    { rejectValue: string }
>('presence/toggle', async ({ device_id, intent }, { rejectWithValue }) => {
    try {
        const result = await setPresenceIntent(device_id, intent);
        return { intent, server_time: result.server_time };
    } catch (err: unknown) {
        const e = err as { message?: string };
        return rejectWithValue(e.message ?? 'presence update failed');
    }
});

const presenceSlice = createSlice({
    name: 'presence',
    initialState,
    reducers: {
        presenceAcked(state, action: PayloadAction<string>) {
            state.lastAck = action.payload;
            if (state.intent === 'online' && state.status === 'offline_stale') {
                state.status = 'online';
            }
        },
        presenceStale(state) {
            if (state.status === 'online') state.status = 'offline_stale';
        },
        presenceServerIntent(state, action: PayloadAction<PresenceIntent>) {
            state.intent = action.payload;
            state.status = action.payload === 'online' ? 'online' : 'offline';
        },
    },
    extraReducers: builder => {
        builder
            .addCase(toggleIntent.pending, (state, action) => {
                state.status =
                    action.meta.arg.intent === 'online'
                        ? 'going_online'
                        : 'going_offline';
                state.lastError = null;
            })
            .addCase(toggleIntent.fulfilled, (state, action) => {
                state.intent = action.payload.intent;
                state.status =
                    action.payload.intent === 'online' ? 'online' : 'offline';
                state.lastAck = action.payload.server_time;
            })
            .addCase(toggleIntent.rejected, (state, action) => {
                state.status = state.intent === 'online' ? 'online' : 'offline';
                state.lastError = action.payload ?? 'unknown';
            })
            .addCase(hydrateFromStorage, (state, action) => {
                if (!action.payload.presence) return;
                state.intent = action.payload.presence.intent;
                state.status = state.intent;
                state.lastAck = action.payload.presence.lastAck;
            });
    },
});

export const { presenceAcked, presenceStale, presenceServerIntent } =
    presenceSlice.actions;
export default presenceSlice.reducer;
