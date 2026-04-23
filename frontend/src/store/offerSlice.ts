import {
    createAsyncThunk,
    createSlice,
    type PayloadAction,
} from '@reduxjs/toolkit';

import { acceptOfferHttp, declineOfferHttp } from '../service/offerApi';
import type {
    DeclineReason,
    HistoryEntry,
    OfferEnvelope,
    OfferStatus,
} from '../types/offer';
import { hydrateFromStorage } from './hydrate';

type PendingAction = 'accepting' | 'declining' | null;

export type OfferState = {
    activeOffer: OfferEnvelope | null;
    activeStatus: OfferStatus | null;
    pendingAction: PendingAction;
    postError: { code: string; message: string } | null;
    retryCount: number;
    acceptedOfferIds: Array<string>;
    history: Array<HistoryEntry>;
};

const initialState: OfferState = {
    activeOffer: null,
    activeStatus: null,
    pendingAction: null,
    postError: null,
    retryCount: 0,
    acceptedOfferIds: [],
    history: [],
};

const pushHistory = (state: OfferState, entry: HistoryEntry): void => {
    state.history.unshift(entry);
    if (state.history.length > 20) state.history.length = 20;
};

export const acceptOffer = createAsyncThunk<
    { offer_id: string; alreadyResolved: boolean },
    { offer_id: string; device_id: string },
    { rejectValue: { code: string; message: string } }
>('offer/accept', async ({ offer_id, device_id }, { rejectWithValue }) => {
    try {
        const result = await acceptOfferHttp(offer_id, device_id);
        return { offer_id, alreadyResolved: result.alreadyResolved };
    } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        return rejectWithValue({
            code: e.code ?? 'network_error',
            message: e.message ?? 'Accept failed',
        });
    }
});

export const declineOffer = createAsyncThunk<
    { offer_id: string; reason: DeclineReason },
    { offer_id: string; device_id: string; reason: DeclineReason },
    { rejectValue: { code: string; message: string } }
>(
    'offer/decline',
    async ({ offer_id, device_id, reason }, { rejectWithValue }) => {
        try {
            await declineOfferHttp(offer_id, device_id, reason);
            return { offer_id, reason };
        } catch (err: unknown) {
            const e = err as { code?: string; message?: string };
            return rejectWithValue({
                code: e.code ?? 'network_error',
                message: e.message ?? 'Decline failed',
            });
        }
    },
);

const offerSlice = createSlice({
    name: 'offer',
    initialState,
    reducers: {
        offerReceived(state, action: PayloadAction<OfferEnvelope>) {
            if (
                state.activeOffer &&
                state.activeOffer.offer_id !== action.payload.offer_id
            ) {
                pushHistory(state, {
                    offer_id: state.activeOffer.offer_id,
                    type: state.activeOffer.type,
                    status: 'superseded',
                    resolved_at: new Date().toISOString(),
                });
            }
            state.activeOffer = action.payload;
            state.activeStatus = 'received';
            state.pendingAction = null;
            state.postError = null;
            state.retryCount = 0;
        },
        offerCountdownExpired(state) {
            if (!state.activeOffer) return;
            pushHistory(state, {
                offer_id: state.activeOffer.offer_id,
                type: state.activeOffer.type,
                status: 'expired',
                resolved_at: new Date().toISOString(),
            });
            state.activeOffer = null;
            state.activeStatus = null;
            state.pendingAction = null;
        },
        offerSuperseded(state, action: PayloadAction<string>) {
            if (!state.activeOffer) return;
            if (state.activeOffer.offer_id !== action.payload) return;
            pushHistory(state, {
                offer_id: state.activeOffer.offer_id,
                type: state.activeOffer.type,
                status: 'superseded',
                resolved_at: new Date().toISOString(),
            });
            state.activeOffer = null;
            state.activeStatus = null;
        },
        clearActiveOffer(state) {
            state.activeOffer = null;
            state.activeStatus = null;
            state.pendingAction = null;
            state.postError = null;
            state.retryCount = 0;
        },
        acceptedFromBackground(state, action: PayloadAction<string>) {
            if (!state.acceptedOfferIds.includes(action.payload)) {
                state.acceptedOfferIds.push(action.payload);
            }
            if (state.activeOffer?.offer_id === action.payload) {
                pushHistory(state, {
                    offer_id: action.payload,
                    type: state.activeOffer.type,
                    status: 'accepted',
                    resolved_at: new Date().toISOString(),
                });
                state.activeOffer = null;
                state.activeStatus = null;
                state.pendingAction = null;
            }
        },
    },
    extraReducers: builder => {
        builder
            .addCase(acceptOffer.pending, state => {
                state.pendingAction = 'accepting';
                state.postError = null;
            })
            .addCase(acceptOffer.fulfilled, (state, action) => {
                const id = action.payload.offer_id;
                if (!state.acceptedOfferIds.includes(id)) {
                    state.acceptedOfferIds.push(id);
                }
                if (state.activeOffer?.offer_id === id) {
                    pushHistory(state, {
                        offer_id: id,
                        type: state.activeOffer.type,
                        status: 'accepted',
                        resolved_at: new Date().toISOString(),
                    });
                    state.activeOffer = null;
                    state.activeStatus = null;
                }
                state.pendingAction = null;
                state.retryCount = 0;
            })
            .addCase(acceptOffer.rejected, (state, action) => {
                state.pendingAction = null;
                state.retryCount += 1;
                state.postError = action.payload ?? {
                    code: 'unknown',
                    message: 'Unknown error',
                };
                if (action.payload?.code === 'expired' && state.activeOffer) {
                    pushHistory(state, {
                        offer_id: state.activeOffer.offer_id,
                        type: state.activeOffer.type,
                        status: 'expired',
                        resolved_at: new Date().toISOString(),
                    });
                    state.activeOffer = null;
                    state.activeStatus = null;
                }
            })
            .addCase(declineOffer.pending, state => {
                state.pendingAction = 'declining';
                state.postError = null;
            })
            .addCase(declineOffer.fulfilled, (state, action) => {
                const id = action.payload.offer_id;
                if (state.activeOffer?.offer_id === id) {
                    pushHistory(state, {
                        offer_id: id,
                        type: state.activeOffer.type,
                        status: 'declined',
                        resolved_at: new Date().toISOString(),
                        decline_reason: action.payload.reason,
                    });
                    state.activeOffer = null;
                    state.activeStatus = null;
                }
                state.pendingAction = null;
            })
            .addCase(declineOffer.rejected, (state, action) => {
                state.pendingAction = null;
                state.postError = action.payload ?? {
                    code: 'unknown',
                    message: 'Unknown error',
                };
            })
            .addCase(hydrateFromStorage, (state, action) => {
                const persisted = action.payload.offer;
                if (!persisted) return;
                state.activeOffer = persisted.activeOffer;
                state.activeStatus = persisted.activeOffer ? 'received' : null;
                state.history = persisted.history;
                state.acceptedOfferIds = persisted.acceptedOfferIds;
            });
    },
});

export const {
    offerReceived,
    offerCountdownExpired,
    offerSuperseded,
    clearActiveOffer,
    acceptedFromBackground,
} = offerSlice.actions;

export default offerSlice.reducer;
