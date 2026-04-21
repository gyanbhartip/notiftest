import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';

import type { RootState } from './index';
import {
    acceptOffer,
    acceptedFromBackground,
    clearActiveOffer,
    declineOffer,
    offerCountdownExpired,
    offerReceived,
    offerSuperseded,
} from './offerSlice';
import { savePersisted } from './persistence';
import {
    presenceAcked,
    presenceServerIntent,
    toggleIntent,
} from './presenceSlice';

export const persistMiddleware = createListenerMiddleware();

let pending: ReturnType<typeof setTimeout> | null = null;

persistMiddleware.startListening({
    matcher: isAnyOf(
        offerReceived,
        offerCountdownExpired,
        offerSuperseded,
        clearActiveOffer,
        acceptedFromBackground,
        acceptOffer.fulfilled,
        declineOffer.fulfilled,
        toggleIntent.fulfilled,
        presenceAcked,
        presenceServerIntent,
    ),
    effect: (_action, api) => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => {
            const state = api.getState() as RootState;
            void savePersisted({
                offer: {
                    activeOffer: state.offer.activeOffer,
                    history: state.offer.history,
                    acceptedOfferIds: state.offer.acceptedOfferIds,
                },
                presence: {
                    intent: state.presence.intent,
                    lastAck: state.presence.lastAck,
                },
            });
        }, 250);
    },
});
