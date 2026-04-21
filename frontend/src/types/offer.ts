export type ApplianceCategory =
    | 'ac'
    | 'refrigerator'
    | 'washing_machine'
    | 'microwave'
    | 'tv'
    | 'geyser'
    | 'dishwasher'
    | 'other';

export type Urgency = 'low' | 'normal' | 'high' | 'emergency';

export type ServiceVisitPayload = {
    customer: {
        name: string;
        type: 'residential' | 'business';
        phone_masked: string;
    };
    address: {
        line1: string;
        line2?: string;
        city: string;
        postal: string;
        lat: number;
        lng: number;
        landmark?: string;
    };
    appliance: {
        category: ApplianceCategory;
        brand?: string;
        model?: string;
        age_years?: number;
    };
    issue: {
        title: string;
        description: string;
        symptoms: Array<string>;
        urgency: Urgency;
        photo_urls?: Array<string>;
    };
    appointment: {
        window_start: string;
        window_end: string;
        slot_label: string;
    };
    job_meta: {
        estimated_duration_minutes: number;
        requires_parts: boolean;
        parts_hint?: Array<string>;
    };
};

export type OfferEnvelope = {
    offer_id: string;
    type: 'service_visit';
    created_at: string;
    expires_at: string;
    expires_ms_total: number;
    schema_version: 1;
    payload: ServiceVisitPayload;
};

export type DeclineReason =
    | { kind: 'sick' }
    | { kind: 'on_other_job' }
    | { kind: 'vehicle_issue' }
    | { kind: 'other'; text: string };

export type OfferStatus =
    | 'received'
    | 'accepted'
    | 'declined'
    | 'expired'
    | 'superseded';

export type HistoryEntry = {
    offer_id: string;
    type: string;
    status: OfferStatus;
    resolved_at: string;
    decline_reason?: DeclineReason;
};

export type JobDetails = {
    offer_id: string;
    job_id: string;
    customer: {
        name: string;
        type: 'residential' | 'business';
        phone: string;
    };
    address: ServiceVisitPayload['address'];
    appliance: ServiceVisitPayload['appliance'];
    issue: ServiceVisitPayload['issue'];
    appointment: ServiceVisitPayload['appointment'];
    job_meta: ServiceVisitPayload['job_meta'];
    actions: {
        navigate_url: string;
        call_customer_url: string;
    };
};
