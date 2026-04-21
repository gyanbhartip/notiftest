import type { DeclineReason } from '../types/offer';

export const acceptOfferHttp = async (
    _offerId: string,
    _deviceId: string,
): Promise<{ alreadyResolved: boolean }> => {
    throw new Error('not implemented — replaced in Task 17');
};

export const declineOfferHttp = async (
    _offerId: string,
    _deviceId: string,
    _reason: DeclineReason,
): Promise<void> => {
    throw new Error('not implemented — replaced in Task 17');
};
