import type { OfferEnvelope, ServiceVisitPayload } from '../types/offer';

export class EnvelopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EnvelopeError';
    }
}

const isString = (v: unknown): v is string =>
    typeof v === 'string' && v.length > 0;
const isNumber = (v: unknown): v is number =>
    typeof v === 'number' && !Number.isNaN(v);

const validatePayload = (raw: unknown): ServiceVisitPayload => {
    if (!raw || typeof raw !== 'object') {
        throw new EnvelopeError('payload is not an object');
    }
    const p = raw as Record<string, unknown>;
    for (const key of [
        'customer',
        'address',
        'appliance',
        'issue',
        'appointment',
        'job_meta',
    ]) {
        if (!p[key] || typeof p[key] !== 'object') {
            throw new EnvelopeError(`payload.${key} missing or not an object`);
        }
    }
    return raw as ServiceVisitPayload;
};

export const validateEnvelope = (raw: unknown): OfferEnvelope => {
    if (!raw || typeof raw !== 'object') {
        throw new EnvelopeError('envelope is not an object');
    }
    const e = raw as Record<string, unknown>;

    if (!isString(e.offer_id)) throw new EnvelopeError('offer_id missing');
    if (e.type !== 'service_visit') {
        throw new EnvelopeError(`unsupported type: ${String(e.type)}`);
    }
    if (!isString(e.created_at)) throw new EnvelopeError('created_at missing');
    if (!isString(e.expires_at)) throw new EnvelopeError('expires_at missing');
    if (!isNumber(e.expires_ms_total)) {
        throw new EnvelopeError('expires_ms_total missing');
    }
    if (e.schema_version !== 1) {
        throw new EnvelopeError(
            `schema_version ${String(e.schema_version)} unsupported`,
        );
    }

    const payload = validatePayload(e.payload);

    return {
        offer_id: e.offer_id,
        type: 'service_visit',
        created_at: e.created_at,
        expires_at: e.expires_at,
        expires_ms_total: e.expires_ms_total,
        schema_version: 1,
        payload,
    };
};
