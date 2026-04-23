# Service-Engineer Offer Flow — Frontend Design

**Status:** Design (pre-implementation)
**Date:** 2026-04-21
**Scope:** Frontend-only (React Native / Expo dev client). Backend endpoints stubbed in existing `backend/fast/` + `backend/dj/` to drive end-to-end client flows.
**Author:** Gyan Bharti (via brainstorming session)

---

## 1. Purpose

Extend the `notiftest` harness into a PoC of an Uber-style job-offer flow for a **company-employed field service engineer** (fridge / AC / washing-machine / etc. technician).

Company dispatcher sends a service visit to an engineer. Engineer receives a notification in **every app state** (foreground, background, killed), reviews the job, and either **accepts** (default expectation) or **declines with a reason**. Since engineers are salaried — not gig workers — the offer carries no pay, no distance, no ETA. Accepting is the expectation; declining requires a reason.

Architecturally the PoC is a staging ground for patterns the production app (Redux Toolkit + AsyncStorage) will adopt unchanged. Backend stubs live in-repo so other devs can replace the internals without touching the HTTP / WS / FCM contract.

## 2. Non-Goals

- Dispatch / matching logic (backend team's domain; only a dev-only `fire-offer` trigger exists).
- Auth (the harness runs on a trusted LAN; `device_id` is identity).
- Persistence / durability across server restarts (in-memory only).
- Multi-worker / multi-replica backend fan-out.
- Automated test suites (see §9 — verification is static checks + manual flows).
- Pay, distance, ETA, or travel fields — engineers are company-employed.

## 3. Decisions (from brainstorming)

| # | Decision                                                                 |
|---|--------------------------------------------------------------------------|
| 1 | Scope: offer delivery + accept/decline loop (A) **and** worker availability (C). |
| 2 | Background/killed interaction: **hybrid** — action buttons on notification, tap-body deep link, in-app modal on foreground. |
| 3 | Foreground UX: **full-screen modal takeover** (root-level `<OfferOverlay />`, countdown ring, haptic + sound). |
| 4 | Presence semantics: **intent-based**. Toggle persists server-side until the engineer toggles off (or long heartbeat silence). Foreground → WS; background/killed → FCM. |
| 5 | Offer payload: **layered envelope + typed payload**. One concrete type (`service_visit`). |
| 6 | Decline: **Accept + decline-with-reason sheet**. Reject from notification shade is disabled — opening the app is required to decline (friction by design). |
| 7 | State management: **Redux Toolkit** (matches main app). |
| 8 | Persistence: **AsyncStorage** with hand-rolled listener middleware + hydrate gate — no `redux-persist` dep. |
| 9 | Verification: **TypeScript + ruff + Django check + manual flows**. No Jest, no testing libs, no `*.test.*` files. |

## 4. Offer Schema

### 4.1 Envelope (transport-agnostic; identical over WS + FCM `data`)

```ts
type OfferEnvelope = {
    offer_id: string;           // uuid v4
    type: 'service_visit';      // discriminant; allows future types without schema churn
    created_at: string;         // ISO8601, server-stamped
    expires_at: string;         // ISO8601, server-stamped — countdown target
    expires_ms_total: number;   // window duration ms; init UI without clock sync
    schema_version: 1;          // breaking-change guard
    payload: ServiceVisitPayload;
};
```

### 4.2 `service_visit` payload

```ts
type ServiceVisitPayload = {
    customer: {
        name: string;
        type: 'residential' | 'business';
        phone_masked: string;     // real number revealed only after accept (returned in JobDetails)
    };
    address: {
        line1: string;
        line2?: string;
        city: string;
        postal: string;
        lat: number;              // map preview + navigate button post-accept
        lng: number;
        landmark?: string;
    };
    appliance: {
        category:
            | 'ac' | 'refrigerator' | 'washing_machine'
            | 'microwave' | 'tv' | 'geyser' | 'dishwasher' | 'other';
        brand?: string;
        model?: string;
        age_years?: number;
    };
    issue: {
        title: string;            // short; shown on notification body + card header
        description: string;      // free text from customer
        symptoms: Array<string>;  // tags e.g. ['not_cooling', 'noisy']
        urgency: 'low' | 'normal' | 'high' | 'emergency';
        photo_urls?: Array<string>;
    };
    appointment: {
        window_start: string;     // ISO8601
        window_end: string;
        slot_label: string;       // pre-formatted "Today, 4–6 PM"
    };
    job_meta: {
        estimated_duration_minutes: number;
        requires_parts: boolean;
        parts_hint?: Array<string>;
    };
};
```

### 4.3 Notification body (derived from payload)

- **Title:** `${urgency === 'emergency' ? '🚨 ' : ''}${appliance.category} — ${slot_label}`
- **Body:**  `${issue.title} • ${address.city}`
- **Action button:** `Accept` only (decline requires opening the app).
- **Tap body:** deep link `notiftest://offer/${offer_id}`.

### 4.4 Decline reasons

```ts
type DeclineReason =
    | { kind: 'sick' }
    | { kind: 'on_other_job' }
    | { kind: 'vehicle_issue' }
    | { kind: 'other'; text: string };   // text is required, min 3 chars
```

## 5. Client Architecture

### 5.1 Module layout

```
frontend/
├── index.ts                              # extend: register FCM + Notifee background handlers
├── App.tsx                               # <Provider> + hydrate gate + <OfferOverlay /> + <PresenceToggle />
├── src/
│   ├── service/
│   │   ├── websocket.ts                  # (existing) extend: parse envelope, dispatch offerReceived
│   │   ├── fcm.ts                        # (existing) unchanged
│   │   ├── notifications.ts              # (existing) extend: 'offers' channel + action-button helper
│   │   ├── deviceId.ts                   # (existing) unchanged
│   │   ├── presenceApi.ts                # NEW: POST /api/presence/online|offline
│   │   └── offerApi.ts                   # NEW: POST accept / decline / superseded (idempotent)
│   ├── store/
│   │   ├── index.ts                      # configureStore + typed hooks
│   │   ├── rootReducer.ts                # combines slices + listens to hydrateFromStorage
│   │   ├── offerSlice.ts                 # activeOffer, history, acceptedOfferIds, thunks
│   │   ├── presenceSlice.ts              # intent, status, lastAck, toggleIntent thunk
│   │   ├── bootSlice.ts                  # hydrated flag + pending_mutations drain thunk
│   │   ├── persistence.ts                # savePersisted / loadPersisted
│   │   └── persistMiddleware.ts          # RTK listener middleware (debounced writes)
│   ├── offer/
│   │   ├── OfferOverlay.tsx              # root modal; conditional on activeOffer
│   │   ├── OfferCard.tsx                 # renders ServiceVisitPayload
│   │   ├── DeclineReasonSheet.tsx        # bottom sheet; reason picker + 'other' text
│   │   └── useCountdown.ts               # hook; recomputes remaining ms from expires_at
│   ├── presence/
│   │   └── PresenceToggle.tsx            # online/offline switch; disabled during going_*
│   └── nav/
│       └── deepLink.ts                   # notiftest://offer/<id> → hydrate + route
```

### 5.2 Dependencies to add

```
@reduxjs/toolkit
react-redux
@react-native-async-storage/async-storage
```

None are present in `frontend/package.json` today. These are the only additions. No testing libraries.

### 5.3 Key design choices

- **Single source of truth for active offer** — `offer.activeOffer`. WS handler, FCM foreground handler, and boot replay all feed the same slice. `<OfferOverlay>` subscribes.
- **Transport-agnostic payload layer** — `offerSlice` consumes a parsed `OfferEnvelope`. Never sees whether it came from WS, FCM, or hydrate.
- **Idempotent accept/decline** — every POST carries `Idempotency-Key: ${offer_id}:${action}`. Background-handler acceptance + in-app modal acceptance converges to a single server-side resolution.
- **Hand-rolled persistence** — no `redux-persist`. RTK `createListenerMiddleware` watches a whitelist of actions and debounces `AsyncStorage.setItem`. Hydrate is a one-shot `useEffect` in `App.tsx` gated by a `hydrated` flag.
- **Background handler cannot dispatch** — it runs in headless JS without the Redux store. Pattern: write `pending_mutations:<offer_id>` directly to AsyncStorage; on cold start, `bootSlice.initialize` drains and replays into Redux (dedup via `acceptedOfferIds` + server-side idempotency).

### 5.4 Data flow — foreground WS accept

```
FastAPI stub ── WS push ─► websocket.ts onmessage
                             │
                             ▼
                      validateEnvelope → dispatch(offerReceived)
                             │
                             ▼
                      <OfferOverlay> renders modal (countdown live)
                             │ (user taps Accept)
                             ▼
                      dispatch(acceptOffer) → offerApi.accept(offer_id) [Idempotency-Key]
                             │
                             ▼
                      fulfilled → offer moved to history, activeOffer=null, acceptedOfferIds.push
                             │
                             ▼
                      nav to JobDetails (unmasked phone + navigate URL)
```

### 5.5 Data flow — background FCM accept via action button

```
FastAPI stub ── HTTP ─► Django /test/send-fcm-offer/ ── FCM ─► Notifee background handler (index.ts)
                                                                  │
                                                                  ▼
                                                 notifee.displayNotification (Accept action)
                                                                  │ (user taps Accept from shade)
                                                                  ▼
                                                 event.pressAction.id === 'accept'
                                                                  │
                                                                  ▼
                                                 offerApi.accept(offer_id)   (HTTP, headless JS)
                                                                  │
                                                                  ▼
                                                 AsyncStorage.setItem('pending_mutations:<id>', ...)
                                                                  │
                                                                  ▼
                                                 notifee.cancelNotification(offer_id)

...later, user opens app...
                                                                  ▼
                                                 hydrate gate → bootSlice.initialize
                                                                  │
                                                                  ▼
                                                 drains pending_mutations → dispatch(acceptedFromBackground)
                                                                  │
                                                                  ▼
                                                 re-POST accept (idempotent) → nav to JobDetails
```

### 5.6 Edge cases

| Case                                          | Handling                                                                                |
|-----------------------------------------------|-----------------------------------------------------------------------------------------|
| Offer arrives while another active            | `offerSuperseded(prevId)`; previous moves to history as `superseded`; new becomes active; client POSTs `/offers/:prevId/superseded` as audit. |
| Accept POST fails (network)                   | Retry 3× with backoff (500ms, 1500ms, 4000ms). Modal stays up, spinner visible. Final fail → `postError` set, retry button. |
| Accept POST returns 409 `already_resolved`    | Treat server view as truth; apply resolution; clear modal.                               |
| Accept POST returns 410 `expired`             | Transition to `expired`; toast "Offer expired"; clear modal.                             |
| Countdown hits 0 while accept in flight       | `expired_with_intent_to_accept`; server reconciles on next WS `hello`.                   |
| WS reconnect mid-offer                        | `hello` with `last_offer_id` + `last_action`. Server replies `offer_still_live` / `offer_resolved` / `unknown_offer`. Client applies. |
| Deep link on expired offer                    | `deepLink.ts` checks `Date.parse(expires_at) > Date.now()` before mounting modal; expired → toast + home. |
| Background handler accepted, app opens        | `acceptedOfferIds` contains `offer_id` → overlay skips render; boot replay re-POSTs (idempotent) and routes to JobDetails. |
| Zombie offer rehydrated from AsyncStorage     | `loadPersisted` inspects `activeOffer.expires_at`; drops if past.                        |

## 6. State Machines

### 6.1 Offer FSM

```
                      offerReceived (WS | FCM foreground | hydrate replay)
           idle ──────────────────────────────────────────► received
            ▲                                                   │
            │                                                   │ acceptOffer.pending / declineOffer.pending
            │                                                   │ (pendingAction set)
            │                                                   ▼
            │                      ┌──────────────────── thunk fulfilled
            │                      │                            │
            │                  accepted                    declined
            │                      │                            │
            │                      │ nav to JobDetails          │ 2s toast, then clear
            │                      ▼                            ▼
            └─────────────── clearActiveOffer ───────────────────┘
                                     ▲
                          ┌──────────┴──────────┐
                          │                     │
                      expired               superseded
               (countdown → 0)         (new offerReceived while active)
```

**Invariant:** at most one `activeOffer` at any time.

### 6.2 Offer slice shape

```ts
type OfferStatus = 'received' | 'accepted' | 'declined' | 'expired' | 'superseded';

type OfferState = {
    activeOffer: OfferEnvelope | null;
    activeStatus: OfferStatus | null;
    pendingAction: 'accepting' | 'declining' | null;
    postError: { code: string; message: string } | null;
    retryCount: number;
    acceptedOfferIds: Array<string>;     // background-handler dedup
    history: Array<HistoryEntry>;         // last 20
};

type HistoryEntry = {
    offer_id: string;
    type: string;
    status: OfferStatus;
    resolved_at: string;
    decline_reason?: DeclineReason;
};
```

### 6.3 Action surface

```ts
// synchronous reducers
offerReceived(envelope: OfferEnvelope)
offerCountdownExpired()
offerSuperseded(prevOfferId: string)
clearActiveOffer()
acceptedFromBackground(offerId: string)      // boot replay
hydrateFromStorage(persisted: PersistedShape) // root action; all slices listen

// async thunks
acceptOffer  = createAsyncThunk('offer/accept',  ...)
declineOffer = createAsyncThunk('offer/decline', ...)
```

Retry policy (in `acceptOffer` thunk): 3 attempts; backoff 500 / 1500 / 4000 ms. On 409 → treat as success. On 410 → transition to `expired`. On final network failure → set `postError`, retain modal.

### 6.4 Presence FSM

```
offline ── toggleIntent('online').pending ──► going_online
going_online ── fulfilled ──► online
going_online ── rejected ──► offline (inline error toast)

online ── toggleIntent('offline').pending ──► going_offline
going_offline ── fulfilled ──► offline
going_offline ── rejected ──► offline (client-side; honor user intent after one retry)

online ── WS 'intent_mismatch' ──► (update local to server view)
online ── no pong for >90s ──► offline_stale (visual indicator; intent unchanged)
offline_stale ── pong received ──► online
```

### 6.5 Presence slice shape

```ts
type PresenceState = {
    intent: 'offline' | 'online';
    status: 'offline' | 'going_online' | 'online' | 'going_offline' | 'offline_stale';
    lastAck: string | null;      // ISO8601, updated on every WS pong
    lastError: string | null;
};
```

### 6.6 WS `hello` reconcile protocol

On every WS open (cold start, reconnect, foreground resume):

```json
{
    "type": "hello",
    "device_id": "<uuid>",
    "intent": "online" | "offline",
    "last_offer_id": "<uuid>" | null,
    "last_action": "accept" | "decline" | null
}
```

| Server reply                                      | Client action                                                         |
|---------------------------------------------------|-----------------------------------------------------------------------|
| `offer_still_live { offer_id, expires_at }`       | Keep modal. Re-sync `expires_at`. Resume countdown.                   |
| `offer_resolved { offer_id, resolution }`         | Dispatch terminal action. Move to history.                            |
| `unknown_offer { offer_id }`                      | Assume expired. Clear active. Move to history as `expired`.           |
| `intent_mismatch { server_intent }`               | Trust server. Update local intent. Surface toast if divergent.        |

### 6.7 Countdown hook

```ts
const useCountdown = (expiresAt: string | null) => {
    const [remainingMs, set] = useState(0);
    const dispatch = useAppDispatch();
    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => {
            const ms = Date.parse(expiresAt) - Date.now();
            set(Math.max(0, ms));
            if (ms <= 0) dispatch(offerCountdownExpired());
        };
        tick();
        const id = setInterval(tick, 200);   // 200ms for smooth ring
        return () => clearInterval(id);
    }, [expiresAt]);
    return remainingMs;
};
```

Countdown is derived from `expires_at`, not `expires_ms_total`. Server authority is re-established via `hello` reconcile.

## 7. Persistence (hand-rolled, no `redux-persist`)

### 7.1 Shape

```ts
// store/persistence.ts
const PERSIST_KEY = 'notiftest:v1';
const PERSIST_VERSION = 1;

const pickPersistable = (state: RootState) => ({
    offer: {
        activeOffer: state.offer.activeOffer,
        history: state.offer.history.slice(-20),
        acceptedOfferIds: state.offer.acceptedOfferIds,
    },
    presence: {
        intent: state.presence.intent,
        lastAck: state.presence.lastAck,
    },
});

export const savePersisted = async (state: RootState) => {
    const payload = { version: PERSIST_VERSION, data: pickPersistable(state) };
    await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
};

export const loadPersisted = async () => {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== PERSIST_VERSION) {
        await AsyncStorage.removeItem(PERSIST_KEY);
        return null;
    }
    // expiry guard — drop zombie offer
    if (parsed.data.offer?.activeOffer) {
        const exp = Date.parse(parsed.data.offer.activeOffer.expires_at);
        if (Date.now() > exp) parsed.data.offer.activeOffer = null;
    }
    return parsed.data;
};
```

### 7.2 Write side

```ts
// store/persistMiddleware.ts
const persistMiddleware = createListenerMiddleware();
let pending: ReturnType<typeof setTimeout> | null = null;

persistMiddleware.startListening({
    matcher: isAnyOf(
        offerReceived, offerCountdownExpired, offerSuperseded, clearActiveOffer,
        acceptedFromBackground,
        acceptOffer.fulfilled, declineOffer.fulfilled,
        toggleIntent.fulfilled, presenceAcked,
    ),
    effect: (_action, api) => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => {
            void savePersisted(api.getState() as RootState);
        }, 250);   // debounce — one write per 250ms burst
    },
});
```

### 7.3 Read side (hydrate gate in `App.tsx`)

```tsx
const [hydrated, setHydrated] = useState(false);

useEffect(() => {
    (async () => {
        const data = await loadPersisted();
        if (data) store.dispatch(hydrateFromStorage(data));
        await store.dispatch(initializeBoot()).unwrap();  // drains pending_mutations
        setHydrated(true);
    })();
}, []);

if (!hydrated) return <Splash />;

return (
    <Provider store={store}>
        <OfferOverlay />
        <PresenceToggle />
        {/* rest */}
    </Provider>
);
```

## 8. Backend Stub Contract

Stubs live in the existing `backend/fast/` and `backend/dj/` apps. Designed so production team can swap internals without touching the contract.

### 8.1 File additions

```
backend/fast/
├── main.py                       # extend: mount new routers
├── routers/
│   ├── notifications.py          # (existing) extend: /ws/notifications hello + reconcile
│   ├── offers.py                 # NEW
│   ├── presence.py               # NEW
│   └── dev.py                    # NEW — dev-only triggers
├── models/
│   └── offer.py                  # NEW — Pydantic schemas mirroring TS types
└── services/
    ├── offer_store.py            # NEW — in-memory offers + idempotency + resolutions
    └── fcm_relay.py              # NEW — httpx call to Django /test/send-fcm-offer/

backend/dj/fcmapp/
├── views.py                      # extend: add send_fcm_offer view (data-only payload)
└── urls.py                       # extend: POST /test/send-fcm-offer/
```

### 8.2 HTTP endpoints (prefix `/api/` on FastAPI)

**Presence**
```
POST /api/presence/online
  body: { "device_id": "<uuid>" }
  resp: 200 { "status": "online", "server_time": "<iso>" }

POST /api/presence/offline
  body: { "device_id": "<uuid>" }
  resp: 200 { "status": "offline", "server_time": "<iso>" }
```

**Offer actions**
```
POST /api/offers/{offer_id}/accept
  headers: Idempotency-Key: {offer_id}:accept
  body:    { "device_id": "<uuid>" }
  resp:    200 { "offer_id", "status": "accepted", "job": JobDetails }
           409 { "code": "already_resolved", "resolution": "declined"|"expired"|"superseded" }
           410 { "code": "expired" }

POST /api/offers/{offer_id}/decline
  headers: Idempotency-Key: {offer_id}:decline
  body:    { "device_id", "reason": "sick"|"on_other_job"|"vehicle_issue"|"other", "other_text"?: string }
  resp:    200 { "offer_id", "status": "declined" }
           409 { "code": "already_resolved", "resolution": "accepted"|"expired"|"superseded" }
           410 { "code": "expired" }

POST /api/offers/{offer_id}/superseded
  body:    { "device_id" }
  resp:    200 { "ok": true }        # pure audit signal
```

**Dev-only triggers**
```
POST /api/dev/fire-offer
  query: device_id=<uuid>, transport=ws|fcm
  body:  partial OfferEnvelope   (server fills missing fields with sensible defaults)
  resp:  200 { "offer_id", "sent_via": "ws"|"fcm", "expires_at" }

POST /api/dev/seed-offers
  body:  { "count": 5, "device_id": "<uuid>", "transport": "ws", "interval_s": 15 }
  resp:  200 { "offer_ids": [...] }

POST /api/dev/reset
  resp:  200 { "cleared": ["offers", "idempotency", "presence", "pending_mutations"] }
```

### 8.3 `JobDetails` (returned from accept; drives the next screen)

```ts
type JobDetails = {
    offer_id: string;
    job_id: string;
    customer: { name; type; phone: string };     // phone unmasked
    address: Address;
    appliance: Appliance;
    issue: Issue;
    appointment: Appointment;
    job_meta: JobMeta;
    actions: {
        navigate_url: string;      // geo: or Google Maps deep link
        call_customer_url: string; // tel:+...
    };
};
```

### 8.4 WS contract

Endpoint unchanged: `ws://<host>:8000/api/ws/notifications?user_id=<device_id>`

**Client → server**
```ts
{ type: 'hello', device_id, intent: 'online'|'offline', last_offer_id?, last_action? }
{ type: 'ping', ts: number }
```

**Server → client**
```ts
{ type: 'offer', envelope: OfferEnvelope }
{ type: 'offer_still_live', offer_id, expires_at }
{ type: 'offer_resolved', offer_id, resolution: 'accepted'|'declined'|'expired'|'superseded' }
{ type: 'unknown_offer', offer_id }
{ type: 'intent_mismatch', server_intent: 'online'|'offline' }
{ type: 'pong', ts: number }
```

### 8.5 FCM data-message shape (Django → device)

**Data-only — no `notification` block** (lets Notifee render with action buttons):

```json
{
    "message": {
        "token": "<fcm_token>",
        "data": {
            "envelope": "<json-stringified OfferEnvelope>",
            "v": "1"
        },
        "android": { "priority": "HIGH" }
    }
}
```

Client background handler (in `frontend/index.ts`):

```ts
messaging().setBackgroundMessageHandler(async remoteMessage => {
    try {
        const envelope: OfferEnvelope = JSON.parse(remoteMessage.data?.envelope ?? '');
        await notifee.createChannel({
            id: 'offers',
            name: 'Offers',
            importance: AndroidImportance.HIGH,
        });
        await notifee.displayNotification({
            id: envelope.offer_id,
            title: buildNotifTitle(envelope.payload),
            body:  buildNotifBody(envelope.payload),
            android: {
                channelId: 'offers',
                importance: AndroidImportance.HIGH,
                pressAction: { id: 'default', launchActivity: 'default' },
                actions: [
                    { title: 'Accept', pressAction: { id: 'accept', launchActivity: 'default' } },
                ],
            },
        });
    } catch (err) {
        console.warn('FCM display failed', err);
    }
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type !== EventType.ACTION_PRESS) return;
    if (detail.pressAction?.id !== 'accept') return;
    const offerId = detail.notification?.id;
    if (!offerId) return;
    try {
        await offerApi.accept(offerId);
        await AsyncStorage.setItem(
            `pending_mutations:${offerId}`,
            JSON.stringify({ offer_id: offerId, action: 'accept', ts: Date.now() }),
        );
        await notifee.cancelNotification(offerId);
    } catch (err) {
        console.warn('background accept failed', err);
    }
});
```

### 8.6 Idempotency (stub)

In-memory `dict[idempotency_key, response_body]` in `offer_store.py`, TTL 10 minutes. Server restart clears it; acceptable for PoC. `Idempotency-Key` format: `{offer_id}:{accept|decline}`.

### 8.7 What the stub deliberately skips

- No dispatch / matching logic — offers only exist via `/api/dev/fire-offer`.
- No server-side timeout reaper — `expires_at` is a timestamp only. Accept/decline after expiry returns 410.
- No persistence — in-memory `offer_store` only.
- No auth. `device_id` is identity.
- No rate limits, no pub/sub, no distributed anything.

The **routes, payloads, and WS message shapes** are production-intent — the backend team should not need to break the contract to replace the stub.

## 9. Verification Strategy

**No automated tests, no testing libraries.** User override of the default TDD workflow. Verification relies on:

### 9.1 Static checks (run before claiming any task done)

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
cd backend/fast && uv run ruff check .
cd backend/fast && uv run ruff format --check .
cd backend/dj  && uv run python manage.py check
```

All four must be clean.

### 9.2 Manual flow checklist

Prereqs: FastAPI on `:8000`, Django on `:8001`, Android dev client installed (`pnpm android`), `deviceId` visible in UI.

**A. Foreground WS accept**
- [ ] Toggle online → Postman / FastAPI logs show `POST /api/presence/online` 200.
- [ ] `curl -X POST "http://<host>:8000/api/dev/fire-offer?device_id=<id>&transport=ws" -H "Content-Type: application/json" -d '{}'` → modal pops instantly.
- [ ] Countdown ring animates smoothly; remaining ms tracks `expires_at`.
- [ ] Tap Accept → modal clears, navigates to JobDetails with unmasked phone + navigate button.
- [ ] FastAPI logs `accept offer_id=... 200`.

**B. Foreground WS decline**
- [ ] Fire an offer (as in A).
- [ ] Tap Decline → reason sheet slides up.
- [ ] Pick `on_other_job`, submit → modal clears.
- [ ] FastAPI logs include the chosen reason.

**C. Decline with "other" text**
- [ ] Fire offer, Decline, pick `other`.
- [ ] Submit disabled until ≥3 chars in free-text field.
- [ ] Submit → reason sheet closes; FastAPI logs include `other_text`.

**D. Background FCM accept via action button**
- [ ] Toggle online, lock phone.
- [ ] `curl -X POST "http://<host>:8000/api/dev/fire-offer?device_id=<id>&transport=fcm" -d '{}' -H "Content-Type: application/json"` → notification on lock screen with **Accept** button.
- [ ] Tap Accept from shade without unlocking → FastAPI logs `accept` received.
- [ ] Unlock phone, open app → lands on JobDetails (not on the offer modal).
- [ ] No duplicate accept POST (idempotency verified in FastAPI logs).

**E. Background FCM tap-body**
- [ ] Lock phone, fire FCM offer.
- [ ] Tap notification body (not Accept) → app opens via `notiftest://offer/<id>`.
- [ ] Modal appears with the correct offer; countdown resumed from `expires_at`.
- [ ] Accept from modal → JobDetails.

**F. Kill-state FCM delivery**
- [ ] Swipe app away from recents.
- [ ] Fire FCM offer → notification arrives in shade.
- [ ] Accept from shade → FastAPI logs accept.
- [ ] Open app → boot replay drains `pending_mutations`; no duplicate POST; lands on JobDetails.

**G. Countdown expiry**
- [ ] Fire offer with `expires_ms_total: 5000` (short window).
- [ ] Do nothing → at 0, modal auto-clears; history entry for this offer has status `expired`.

**H. Supersede**
- [ ] Fire offer A (20s window); modal up.
- [ ] At t=10s, fire offer B → A dismissed, B shown; A in history as `superseded`.
- [ ] FastAPI logs receive `POST /api/offers/{A}/superseded`.

**I. Network flap during accept**
- [ ] Fire offer; tap Accept.
- [ ] Immediately enable airplane mode → retry spinner visible on modal.
- [ ] Disable airplane mode within 10s → retry succeeds → JobDetails.
- [ ] If the countdown expires during retry: confirm state becomes `expired_with_intent_to_accept`; next WS `hello` reconciles.

**J. Presence stale / reconcile**
- [ ] Toggle online; kill FastAPI.
- [ ] Wait >90s; restart FastAPI.
- [ ] App reconnects → sends `hello` → server returns `intent_mismatch` (server forgot state) → UI re-syncs to actual server intent.

**K. Zombie offer on cold start**
- [ ] Fire offer, kill app immediately.
- [ ] Wait past `expires_at`.
- [ ] Relaunch app → no modal appears (hydrate drops expired offer).

### 9.3 Definition of done

- All 11 manual flows (A–K) pass on at least one Android dev-client build.
- All static checks from §9.1 are clean.
- Design doc + manual checklist committed to `docs/`.
- No new dependencies beyond the three in §5.2.

## 10. Open Questions (resolve during implementation)

1. **Navigation library.** `App.tsx` currently has no router. Either introduce `@react-navigation/native` + `native-stack` for the `JobDetails` screen, or use a lightweight conditional-render approach tied to Redux state. Recommend the former — production app will need it anyway.
2. **Sound asset for offer arrival.** Bundled or system default? Default for PoC unless product provides a file.
3. **Decline "other" minimum length.** Currently 3 chars in this spec; confirm with dispatcher team before finalizing UI copy.
4. **Supersede semantics for the engineer.** Does the old modal silently swap, or show a brief "new offer arriving" transition? Spec says silent swap for simplicity; revisit after Flow H walkthrough.

## 11. Adaptation notes (for production)

When the real backend replaces the stub:

- Routes + payloads + WS message shapes are stable — no client rewrite.
- `offer_store.OfferStore` (in-memory dict) → a real store (Redis + Postgres, a dispatch service, whatever). External to client.
- Timeout enforcement moves server-side; client continues to enforce UI countdown but becomes optimistic rather than authoritative.
- Idempotency cache moves from dict-TTL to Redis with longer TTL.
- Production app swaps hand-rolled persistence for `redux-persist` (same persisted shape via `pickPersistable`).
