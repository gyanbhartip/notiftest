import type { DeclineReason } from '../types/offer';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

const RETRY_DELAYS_MS = [500, 1500, 4000];

type HttpError = { code: string; message: string; status?: number };

const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

const parseError = async (resp: Response): Promise<HttpError> => {
    try {
        const body = (await resp.json()) as {
            code?: string;
            detail?: { code?: string };
        };
        const code = body.code ?? body.detail?.code ?? `http_${resp.status}`;
        return { code, message: `HTTP ${resp.status}`, status: resp.status };
    } catch {
        return {
            code: `http_${resp.status}`,
            message: `HTTP ${resp.status}`,
            status: resp.status,
        };
    }
};

const fetchWithRetry = async (
    input: RequestInfo,
    init: RequestInit,
): Promise<Response> => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt += 1) {
        try {
            const resp = await fetch(input, init);
            if (
                resp.status === 409 ||
                resp.status === 410 ||
                resp.status === 422
            ) {
                return resp; // terminal — no retry
            }
            if (resp.status >= 500) {
                lastErr = await parseError(resp);
            } else {
                return resp;
            }
        } catch (err) {
            lastErr = err;
        }
        if (attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt]);
        }
    }
    const e = lastErr as HttpError | Error;
    throw 'code' in e
        ? e
        : ({
              code: 'network_error',
              message: (e as Error).message,
          } satisfies HttpError);
};

export const acceptOfferHttp = async (
    offerId: string,
    deviceId: string,
): Promise<{ alreadyResolved: boolean }> => {
    const resp = await fetchWithRetry(
        `${API_BASE}/api/offers/${offerId}/accept`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': `${offerId}:accept`,
            },
            body: JSON.stringify({ device_id: deviceId }),
        },
    );
    if (resp.ok) return { alreadyResolved: false };
    if (resp.status === 409) return { alreadyResolved: true };
    throw await parseError(resp);
};

export const declineOfferHttp = async (
    offerId: string,
    deviceId: string,
    reason: DeclineReason,
): Promise<void> => {
    const body: Record<string, unknown> = {
        device_id: deviceId,
        reason: reason.kind,
    };
    if (reason.kind === 'other') body.other_text = reason.text;
    const resp = await fetchWithRetry(
        `${API_BASE}/api/offers/${offerId}/decline`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': `${offerId}:decline`,
            },
            body: JSON.stringify(body),
        },
    );
    if (resp.ok) return;
    if (resp.status === 409) return; // already_resolved — treat as success
    throw await parseError(resp);
};

export const supersededOfferHttp = async (
    offerId: string,
    deviceId: string,
): Promise<void> => {
    await fetch(`${API_BASE}/api/offers/${offerId}/superseded`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
    }).catch(err => console.warn('superseded audit failed', err));
};
