import type { PresenceIntent } from '../types/presence';

export const setPresenceIntent = async (
    _deviceId: string,
    _intent: PresenceIntent,
): Promise<{ server_time: string }> => {
    throw new Error('not implemented — replaced in Task 18');
};
