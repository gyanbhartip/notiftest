import type { LinkingOptions } from '@react-navigation/native';
import { store } from '../store';
import type { RootStackParamList } from './RootNavigator';

export const isDeepLinkedOfferLive = (offerId: string): boolean => {
    const state = store.getState();
    const active = state.offer.activeOffer;
    if (active?.offer_id !== offerId) return false;
    const exp = Date.parse(active.expires_at);
    return Number.isFinite(exp) && Date.now() < exp;
};

export const linkingConfig: LinkingOptions<RootStackParamList> = {
    prefixes: ['notiftest://'],
    config: {
        screens: {
            Home: '',
            JobDetails: 'offer/:offer_id',
        },
    },
};
