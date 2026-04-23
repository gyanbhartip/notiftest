import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { getDeviceId } from '../service/deviceId';
import { acceptOfferHttp } from '../service/offerApi';
import { hydrateFromStorage } from './hydrate';
import { acceptedFromBackground } from './offerSlice';
import { drainPendingMutations, loadPersisted } from './persistence';

type BootState = {
    hydrated: boolean;
    error: string | null;
};

const initialState: BootState = { hydrated: false, error: null };

export const initializeBoot = createAsyncThunk<void, void>(
    'boot/initialize',
    async (_, { dispatch }) => {
        const persisted = await loadPersisted();
        if (persisted) dispatch(hydrateFromStorage(persisted));

        const device_id = await getDeviceId();
        const pending = await drainPendingMutations();
        for (const m of pending) {
            if (m.action === 'accept') {
                dispatch(acceptedFromBackground(m.offer_id));
                try {
                    await acceptOfferHttp(m.offer_id, device_id);
                } catch (err) {
                    console.warn('boot replay accept failed', m.offer_id, err);
                }
            }
        }
    },
);

const bootSlice = createSlice({
    name: 'boot',
    initialState,
    reducers: {},
    extraReducers: builder => {
        builder
            .addCase(initializeBoot.fulfilled, state => {
                state.hydrated = true;
            })
            .addCase(initializeBoot.rejected, (state, action) => {
                state.hydrated = true;
                state.error = action.error.message ?? 'boot failed';
            });
    },
});

export default bootSlice.reducer;
