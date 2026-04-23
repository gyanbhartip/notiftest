import type { PresenceIntent } from '../types/presence';

const API_BASE = process.env.EXPO_PUBLIC_FASTAPI_URL ?? 'http://127.0.0.1:8000';

export const setPresenceIntent = async (
    deviceId: string,
    intent: PresenceIntent,
): Promise<{ server_time: string }> => {
    const resp = await fetch(`${API_BASE}/api/presence/${intent}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
    });
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
    }
    const json = (await resp.json()) as { server_time: string };
    return json;
};
