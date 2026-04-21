# Service-Engineer Offer Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PoC Uber-style offer flow for company-employed service engineers: dispatcher fires an offer → engineer sees it in any app state (foreground modal, background/killed notification with Accept action button) → engineer accepts (one tap) or declines (with reason) → server receives the terminal action.

**Architecture:** Frontend = React Native / Expo with Redux Toolkit + hand-rolled AsyncStorage persistence (no `redux-persist`). Backend stubs = FastAPI (WS + HTTP + dev triggers) with a thin Django relay for FCM data-messages. Transport-agnostic `OfferEnvelope` + `service_visit` payload. Idempotent accept/decline via `Idempotency-Key` header. Deep link recovery via `notiftest://offer/<id>`.

**Tech Stack:** TypeScript 5.9, React Native 0.81, Expo SDK 54, Redux Toolkit, react-redux, @react-native-async-storage/async-storage, @notifee/react-native, @react-native-firebase/messaging, Python 3.14, FastAPI, uvicorn, httpx, Django 5, firebase_admin.

**Reference spec:** `docs/superpowers/specs/2026-04-21-service-engineer-offer-design.md`

**Verification rule:** No Jest, no testing libs, no `*.test.*` files — per user override. Each task's verification runs static checks (`tsc --noEmit`, `ruff check`, `python manage.py check`). End-to-end flow checklist lives in Task 33.

---

## File Map

**Backend — FastAPI (`backend/fast/`)**

| File                                  | Responsibility                                     |
|---------------------------------------|----------------------------------------------------|
| `models/offer.py` *(new)*             | Pydantic schemas mirroring frontend TS types       |
| `services/offer_store.py` *(new)*     | In-memory offer + idempotency + presence store     |
| `services/fcm_relay.py` *(new)*       | httpx client that POSTs to Django FCM sender       |
| `routers/offers.py` *(new)*           | Accept / decline / superseded HTTP endpoints       |
| `routers/presence.py` *(new)*         | Online / offline HTTP endpoints                    |
| `routers/dev.py` *(new)*              | Dev triggers: fire-offer, seed-offers, reset       |
| `routers/notifications.py` *(extend)* | WS hello + reconcile + offer push                  |
| `main.py` *(extend)*                  | Mount new routers                                  |

**Backend — Django (`backend/dj/fcmapp/`)**

| File                     | Responsibility                                        |
|--------------------------|-------------------------------------------------------|
| `views.py` *(extend)*    | Add `send_fcm_offer` — data-only FCM message          |
| `urls.py` *(extend)*     | Route `POST /test/send-fcm-offer/`                    |

**Frontend (`frontend/src/`)**

| File                            | Responsibility                                     |
|---------------------------------|----------------------------------------------------|
| `types/offer.ts` *(new)*        | `OfferEnvelope`, `ServiceVisitPayload`, `DeclineReason`, `JobDetails` |
| `types/presence.ts` *(new)*     | `PresenceState`, `PresenceStatus`                  |
| `service/envelope.ts` *(new)*   | `validateEnvelope(raw): OfferEnvelope`             |
| `service/presenceApi.ts` *(new)*| HTTP: POST `/api/presence/online|offline`          |
| `service/offerApi.ts` *(new)*   | HTTP: accept / decline / superseded + retry + idempotency key |
| `service/websocket.ts` *(extend)* | Parse envelope, dispatch offerReceived, hello on open, reconcile handling |
| `service/notifications.ts` *(extend)* | Offers channel + notification builder helpers |
| `store/index.ts` *(new)*        | configureStore, typed hooks                        |
| `store/rootReducer.ts` *(new)*  | combineReducers + hydrateFromStorage action        |
| `store/offerSlice.ts` *(new)*   | Slice + thunks + retry policy                      |
| `store/presenceSlice.ts` *(new)*| Slice + toggle thunk                               |
| `store/bootSlice.ts` *(new)*    | Hydrated flag + drain pending_mutations thunk      |
| `store/persistence.ts` *(new)*  | savePersisted / loadPersisted                      |
| `store/persistMiddleware.ts` *(new)* | RTK listener middleware + 250ms debounce      |
| `offer/useCountdown.ts` *(new)* | Hook; remaining ms from expires_at                 |
| `offer/OfferCard.tsx` *(new)*   | Renders `service_visit` payload                    |
| `offer/DeclineReasonSheet.tsx` *(new)* | Reason picker + "other" text                |
| `offer/OfferOverlay.tsx` *(new)*| Root-level modal, countdown ring                   |
| `presence/PresenceToggle.tsx` *(new)* | Online/offline switch                        |
| `nav/RootNavigator.tsx` *(new)* | React Navigation stack + JobDetails route          |
| `nav/JobDetailsScreen.tsx` *(new)* | Post-accept screen                              |
| `nav/deepLink.ts` *(new)*       | Handle `notiftest://offer/<id>`                    |
| `App.tsx` *(rewrite)*           | Provider + hydrate gate + navigator                |
| `index.ts` *(extend)*           | Register FCM + Notifee background handlers for offers |
| `app.json` *(extend)*           | `scheme: "notiftest"` for deep link                |
| `package.json` *(extend)*       | +3 deps (RTK, react-redux, AsyncStorage) + React Navigation |

---

## Phase 1 — Backend stubs (FastAPI)

### Task 1: Pydantic offer models

**Files:**
- Create: `backend/fast/models/__init__.py`
- Create: `backend/fast/models/offer.py`

- [ ] **Step 1: Create package init**

```python
# backend/fast/models/__init__.py
```

- [ ] **Step 2: Write `models/offer.py`**

```python
# backend/fast/models/offer.py
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Customer(BaseModel):
    name: str
    type: Literal["residential", "business"]
    phone_masked: str


class Address(BaseModel):
    line1: str
    line2: Optional[str] = None
    city: str
    postal: str
    lat: float
    lng: float
    landmark: Optional[str] = None


class Appliance(BaseModel):
    category: Literal[
        "ac",
        "refrigerator",
        "washing_machine",
        "microwave",
        "tv",
        "geyser",
        "dishwasher",
        "other",
    ]
    brand: Optional[str] = None
    model: Optional[str] = None
    age_years: Optional[int] = None


class Issue(BaseModel):
    title: str
    description: str
    symptoms: list[str] = Field(default_factory=list)
    urgency: Literal["low", "normal", "high", "emergency"]
    photo_urls: Optional[list[str]] = None


class Appointment(BaseModel):
    window_start: datetime
    window_end: datetime
    slot_label: str


class JobMeta(BaseModel):
    estimated_duration_minutes: int
    requires_parts: bool
    parts_hint: Optional[list[str]] = None


class ServiceVisitPayload(BaseModel):
    customer: Customer
    address: Address
    appliance: Appliance
    issue: Issue
    appointment: Appointment
    job_meta: JobMeta


class OfferEnvelope(BaseModel):
    offer_id: str
    type: Literal["service_visit"] = "service_visit"
    created_at: datetime
    expires_at: datetime
    expires_ms_total: int
    schema_version: Literal[1] = 1
    payload: ServiceVisitPayload


class AcceptBody(BaseModel):
    device_id: str


class DeclineBody(BaseModel):
    device_id: str
    reason: Literal["sick", "on_other_job", "vehicle_issue", "other"]
    other_text: Optional[str] = None


class PresenceBody(BaseModel):
    device_id: str


class JobDetailsActions(BaseModel):
    navigate_url: str
    call_customer_url: str


class JobDetailsCustomer(BaseModel):
    name: str
    type: Literal["residential", "business"]
    phone: str


class JobDetails(BaseModel):
    offer_id: str
    job_id: str
    customer: JobDetailsCustomer
    address: Address
    appliance: Appliance
    issue: Issue
    appointment: Appointment
    job_meta: JobMeta
    actions: JobDetailsActions
```

- [ ] **Step 3: Verify**

```bash
cd backend/fast && uv run ruff check models/offer.py && uv run python -c "from models.offer import OfferEnvelope; print(OfferEnvelope.model_json_schema()['title'])"
```

Expected: `OfferEnvelope`

- [ ] **Step 4: Commit**

```bash
git add backend/fast/models
git commit -m "feat(fast): add Pydantic models for service_visit offer envelope"
```

---

### Task 2: In-memory offer store + idempotency cache

**Files:**
- Create: `backend/fast/services/__init__.py`
- Create: `backend/fast/services/offer_store.py`

- [ ] **Step 1: Create package init**

```python
# backend/fast/services/__init__.py
```

- [ ] **Step 2: Write `services/offer_store.py`**

```python
# backend/fast/services/offer_store.py
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from models.offer import JobDetails, JobDetailsActions, JobDetailsCustomer, OfferEnvelope


IDEM_TTL_S = 600  # 10 min


@dataclass
class Resolution:
    offer_id: str
    status: str  # accepted | declined | expired | superseded
    resolved_at: datetime
    reason: Optional[str] = None
    other_text: Optional[str] = None


@dataclass
class IdemRecord:
    response: dict
    status_code: int
    created_at: float = field(default_factory=time.monotonic)


class OfferStore:
    def __init__(self) -> None:
        self.offers: dict[str, OfferEnvelope] = {}
        self.resolutions: dict[str, Resolution] = {}
        self.idem: dict[str, IdemRecord] = {}
        self.presence: dict[str, dict] = {}

    def put_offer(self, envelope: OfferEnvelope) -> None:
        self.offers[envelope.offer_id] = envelope

    def get_offer(self, offer_id: str) -> Optional[OfferEnvelope]:
        return self.offers.get(offer_id)

    def get_resolution(self, offer_id: str) -> Optional[Resolution]:
        return self.resolutions.get(offer_id)

    def set_resolution(self, resolution: Resolution) -> None:
        self.resolutions[resolution.offer_id] = resolution

    def check_idem(self, key: str) -> Optional[IdemRecord]:
        record = self.idem.get(key)
        if record is None:
            return None
        if time.monotonic() - record.created_at > IDEM_TTL_S:
            self.idem.pop(key, None)
            return None
        return record

    def store_idem(self, key: str, response: dict, status_code: int) -> None:
        self.idem[key] = IdemRecord(response=response, status_code=status_code)

    def update_presence(self, device_id: str, intent: str) -> None:
        self.presence[device_id] = {
            "intent": intent,
            "last_ack": datetime.now(timezone.utc).isoformat(),
        }

    def build_job_details(self, envelope: OfferEnvelope) -> JobDetails:
        p = envelope.payload
        # Unmask phone for PoC — just strip dots.
        unmasked = p.customer.phone_masked.replace("•", "").replace(" ", "")
        unmasked = unmasked or "+911234567890"
        return JobDetails(
            offer_id=envelope.offer_id,
            job_id=f"job_{uuid.uuid4().hex[:8]}",
            customer=JobDetailsCustomer(
                name=p.customer.name,
                type=p.customer.type,
                phone=unmasked,
            ),
            address=p.address,
            appliance=p.appliance,
            issue=p.issue,
            appointment=p.appointment,
            job_meta=p.job_meta,
            actions=JobDetailsActions(
                navigate_url=f"google.navigation:q={p.address.lat},{p.address.lng}",
                call_customer_url=f"tel:{unmasked}",
            ),
        )

    def clear_all(self) -> None:
        self.offers.clear()
        self.resolutions.clear()
        self.idem.clear()
        self.presence.clear()


store = OfferStore()
```

- [ ] **Step 3: Verify**

```bash
cd backend/fast && uv run ruff check services/offer_store.py
```

Expected: `All checks passed!`

- [ ] **Step 4: Commit**

```bash
git add backend/fast/services
git commit -m "feat(fast): in-memory offer store with idempotency cache"
```

---

### Task 3: Offers router (accept / decline / superseded)

**Files:**
- Create: `backend/fast/routers/offers.py`

- [ ] **Step 1: Write `routers/offers.py`**

```python
# backend/fast/routers/offers.py
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

from models.offer import AcceptBody, DeclineBody, JobDetails
from services.offer_store import Resolution, store

router = APIRouter(prefix="/api/offers")


def _is_expired(offer_id: str) -> bool:
    envelope = store.get_offer(offer_id)
    if envelope is None:
        return True
    return datetime.now(timezone.utc) > envelope.expires_at


@router.post("/{offer_id}/accept")
async def accept_offer(
    offer_id: str,
    body: AcceptBody,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
) -> dict:
    cached = store.check_idem(idempotency_key)
    if cached is not None:
        if cached.status_code >= 400:
            raise HTTPException(status_code=cached.status_code, detail=cached.response)
        return cached.response

    existing = store.get_resolution(offer_id)
    if existing is not None and existing.status != "accepted":
        detail = {"code": "already_resolved", "resolution": existing.status}
        store.store_idem(idempotency_key, detail, 409)
        raise HTTPException(status_code=409, detail=detail)

    envelope = store.get_offer(offer_id)
    if envelope is None:
        detail = {"code": "expired"}
        store.store_idem(idempotency_key, detail, 410)
        raise HTTPException(status_code=410, detail=detail)

    if _is_expired(offer_id) and existing is None:
        store.set_resolution(
            Resolution(
                offer_id=offer_id,
                status="expired",
                resolved_at=datetime.now(timezone.utc),
            )
        )
        detail = {"code": "expired"}
        store.store_idem(idempotency_key, detail, 410)
        raise HTTPException(status_code=410, detail=detail)

    if existing is None:
        store.set_resolution(
            Resolution(
                offer_id=offer_id,
                status="accepted",
                resolved_at=datetime.now(timezone.utc),
            )
        )

    job: JobDetails = store.build_job_details(envelope)
    response = {
        "offer_id": offer_id,
        "status": "accepted",
        "job": job.model_dump(mode="json"),
    }
    store.store_idem(idempotency_key, response, 200)
    return response


@router.post("/{offer_id}/decline")
async def decline_offer(
    offer_id: str,
    body: DeclineBody,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
) -> dict:
    cached = store.check_idem(idempotency_key)
    if cached is not None:
        if cached.status_code >= 400:
            raise HTTPException(status_code=cached.status_code, detail=cached.response)
        return cached.response

    if body.reason == "other" and (not body.other_text or len(body.other_text.strip()) < 3):
        raise HTTPException(
            status_code=422,
            detail={"code": "other_text_required", "min_length": 3},
        )

    existing = store.get_resolution(offer_id)
    if existing is not None and existing.status != "declined":
        detail = {"code": "already_resolved", "resolution": existing.status}
        store.store_idem(idempotency_key, detail, 409)
        raise HTTPException(status_code=409, detail=detail)

    if store.get_offer(offer_id) is None:
        detail = {"code": "expired"}
        store.store_idem(idempotency_key, detail, 410)
        raise HTTPException(status_code=410, detail=detail)

    if _is_expired(offer_id) and existing is None:
        store.set_resolution(
            Resolution(
                offer_id=offer_id,
                status="expired",
                resolved_at=datetime.now(timezone.utc),
            )
        )
        detail = {"code": "expired"}
        store.store_idem(idempotency_key, detail, 410)
        raise HTTPException(status_code=410, detail=detail)

    if existing is None:
        store.set_resolution(
            Resolution(
                offer_id=offer_id,
                status="declined",
                resolved_at=datetime.now(timezone.utc),
                reason=body.reason,
                other_text=body.other_text,
            )
        )

    response = {"offer_id": offer_id, "status": "declined"}
    store.store_idem(idempotency_key, response, 200)
    return response


@router.post("/{offer_id}/superseded")
async def supersede_offer(offer_id: str, body: AcceptBody) -> dict:
    existing = store.get_resolution(offer_id)
    if existing is None:
        store.set_resolution(
            Resolution(
                offer_id=offer_id,
                status="superseded",
                resolved_at=datetime.now(timezone.utc),
            )
        )
    return {"ok": True}
```

- [ ] **Step 2: Verify**

```bash
cd backend/fast && uv run ruff check routers/offers.py
```

Expected: `All checks passed!`

- [ ] **Step 3: Commit**

```bash
git add backend/fast/routers/offers.py
git commit -m "feat(fast): accept/decline/superseded endpoints with idempotency"
```

---

### Task 4: Presence router

**Files:**
- Create: `backend/fast/routers/presence.py`

- [ ] **Step 1: Write `routers/presence.py`**

```python
# backend/fast/routers/presence.py
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from models.offer import PresenceBody
from services.offer_store import store

router = APIRouter(prefix="/api/presence")


@router.post("/online")
async def go_online(body: PresenceBody) -> dict:
    store.update_presence(body.device_id, intent="online")
    return {
        "status": "online",
        "server_time": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/offline")
async def go_offline(body: PresenceBody) -> dict:
    store.update_presence(body.device_id, intent="offline")
    return {
        "status": "offline",
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
```

- [ ] **Step 2: Verify**

```bash
cd backend/fast && uv run ruff check routers/presence.py
```

- [ ] **Step 3: Commit**

```bash
git add backend/fast/routers/presence.py
git commit -m "feat(fast): presence online/offline endpoints"
```

---

### Task 5: FCM relay service

**Files:**
- Create: `backend/fast/services/fcm_relay.py`

- [ ] **Step 1: Add httpx dep**

```bash
cd backend/fast && uv add httpx
```

- [ ] **Step 2: Write `services/fcm_relay.py`**

```python
# backend/fast/services/fcm_relay.py
from __future__ import annotations

import os

import httpx

from models.offer import OfferEnvelope

DJANGO_BASE_URL = os.getenv("DJANGO_BASE_URL", "http://127.0.0.1:8001")


async def send_offer_via_fcm(device_id: str, envelope: OfferEnvelope) -> None:
    payload = {
        "device_id": device_id,
        "envelope": envelope.model_dump_json(),
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{DJANGO_BASE_URL}/test/send-fcm-offer/",
            data=payload,
        )
        resp.raise_for_status()
```

- [ ] **Step 3: Verify**

```bash
cd backend/fast && uv run ruff check services/fcm_relay.py
```

- [ ] **Step 4: Commit**

```bash
git add backend/fast/services/fcm_relay.py backend/fast/pyproject.toml backend/fast/uv.lock
git commit -m "feat(fast): FCM relay to Django for data-only offer push"
```

---

### Task 6: Dev router (fire-offer / seed-offers / reset)

**Files:**
- Create: `backend/fast/routers/dev.py`

- [ ] **Step 1: Write `routers/dev.py`**

```python
# backend/fast/routers/dev.py
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.offer import (
    Address,
    Appliance,
    Appointment,
    Customer,
    Issue,
    JobMeta,
    OfferEnvelope,
    ServiceVisitPayload,
)
from services.fcm_relay import send_offer_via_fcm
from services.offer_store import store

router = APIRouter(prefix="/api/dev")


def _default_payload() -> ServiceVisitPayload:
    start = datetime.now(timezone.utc) + timedelta(hours=1)
    return ServiceVisitPayload(
        customer=Customer(
            name="Asha Kumar",
            type="residential",
            phone_masked="+91 •••••• 2345",
        ),
        address=Address(
            line1="B-204, Green Park Apartments",
            line2="Sector 12",
            city="Pune",
            postal="411001",
            lat=18.5204,
            lng=73.8567,
            landmark="Near ICICI ATM",
        ),
        appliance=Appliance(
            category="ac",
            brand="Daikin",
            model="FTKF50",
            age_years=3,
        ),
        issue=Issue(
            title="AC not cooling",
            description="Started two days ago, no cold air from indoor unit.",
            symptoms=["not_cooling", "noisy"],
            urgency="high",
            photo_urls=None,
        ),
        appointment=Appointment(
            window_start=start,
            window_end=start + timedelta(hours=2),
            slot_label="Today, 4–6 PM",
        ),
        job_meta=JobMeta(
            estimated_duration_minutes=60,
            requires_parts=False,
            parts_hint=None,
        ),
    )


def _build_envelope(
    override: Optional[dict[str, Any]] = None,
    window_s: int = 30,
) -> OfferEnvelope:
    now = datetime.now(timezone.utc)
    base = {
        "offer_id": str(uuid.uuid4()),
        "type": "service_visit",
        "created_at": now,
        "expires_at": now + timedelta(seconds=window_s),
        "expires_ms_total": window_s * 1000,
        "schema_version": 1,
        "payload": _default_payload().model_dump(mode="python"),
    }
    if override:
        # shallow merge — override top-level or payload keys
        if "payload" in override and isinstance(override["payload"], dict):
            merged_payload = {**base["payload"], **override["payload"]}
            override = {**override, "payload": merged_payload}
        base.update({k: v for k, v in override.items() if k != "payload"})
        base["payload"] = override.get("payload", base["payload"])
    return OfferEnvelope.model_validate(base)


class FireOfferBody(BaseModel):
    offer_id: Optional[str] = None
    expires_ms_total: Optional[int] = None
    payload: Optional[dict[str, Any]] = None


@router.post("/fire-offer")
async def fire_offer(
    body: FireOfferBody,
    device_id: str = Query(...),
    transport: str = Query("ws", pattern="^(ws|fcm)$"),
) -> dict:
    override: dict[str, Any] = {}
    if body.offer_id:
        override["offer_id"] = body.offer_id
    if body.payload:
        override["payload"] = body.payload
    window_s = (body.expires_ms_total or 30_000) // 1000

    envelope = _build_envelope(override, window_s=window_s)
    store.put_offer(envelope)

    if transport == "ws":
        from routers.notifications import manager

        sent = await manager.send_to_user(
            device_id,
            {"type": "offer", "envelope": envelope.model_dump(mode="json")},
        )
        if not sent:
            raise HTTPException(
                status_code=409,
                detail={"code": "ws_not_connected", "device_id": device_id},
            )
    else:
        await send_offer_via_fcm(device_id, envelope)

    return {
        "offer_id": envelope.offer_id,
        "sent_via": transport,
        "expires_at": envelope.expires_at.isoformat(),
    }


class SeedBody(BaseModel):
    device_id: str
    count: int = 5
    transport: str = "ws"
    interval_s: int = 15


@router.post("/seed-offers")
async def seed_offers(body: SeedBody) -> dict:
    offer_ids: list[str] = []

    async def _fire_sequence() -> None:
        for _ in range(body.count):
            envelope = _build_envelope(window_s=20)
            store.put_offer(envelope)
            offer_ids.append(envelope.offer_id)
            if body.transport == "ws":
                from routers.notifications import manager

                await manager.send_to_user(
                    body.device_id,
                    {"type": "offer", "envelope": envelope.model_dump(mode="json")},
                )
            else:
                await send_offer_via_fcm(body.device_id, envelope)
            await asyncio.sleep(body.interval_s)

    asyncio.create_task(_fire_sequence())
    return {"scheduled": body.count, "interval_s": body.interval_s}


@router.post("/reset")
async def reset_state() -> dict:
    store.clear_all()
    return {"cleared": ["offers", "idempotency", "presence", "resolutions"]}
```

- [ ] **Step 2: Verify**

```bash
cd backend/fast && uv run ruff check routers/dev.py
```

- [ ] **Step 3: Commit**

```bash
git add backend/fast/routers/dev.py
git commit -m "feat(fast): dev triggers fire-offer, seed-offers, reset"
```

---

### Task 7: Extend WS router — hello + reconcile + offer push

**Files:**
- Modify: `backend/fast/routers/notifications.py`

- [ ] **Step 1: Read current file**

```bash
cat backend/fast/routers/notifications.py
```

- [ ] **Step 2: Extend `ConnectionManager` + WS handler**

Replace the entire contents of `routers/notifications.py` with:

```python
# backend/fast/routers/notifications.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from services.offer_store import store

router = APIRouter(prefix="/api")


class ConnectionManager:
    def __init__(self) -> None:
        self._sockets: dict[str, WebSocket] = {}

    async def connect(self, device_id: str, ws: WebSocket) -> None:
        await ws.accept()
        prev = self._sockets.get(device_id)
        if prev is not None:
            try:
                await prev.close(code=1000)
            except Exception:
                pass
        self._sockets[device_id] = ws

    def disconnect(self, device_id: str) -> None:
        self._sockets.pop(device_id, None)

    async def send_to_user(self, device_id: str, payload: dict[str, Any]) -> bool:
        ws = self._sockets.get(device_id)
        if ws is None:
            return False
        try:
            await ws.send_json(payload)
            return True
        except Exception:
            self.disconnect(device_id)
            return False


manager = ConnectionManager()


async def _handle_hello(ws: WebSocket, device_id: str, msg: dict[str, Any]) -> None:
    intent = msg.get("intent")
    last_offer_id = msg.get("last_offer_id")
    if intent in {"online", "offline"}:
        store.update_presence(device_id, intent=intent)

    if not last_offer_id:
        return

    resolution = store.get_resolution(last_offer_id)
    if resolution is not None:
        await ws.send_json(
            {
                "type": "offer_resolved",
                "offer_id": last_offer_id,
                "resolution": resolution.status,
            }
        )
        return

    envelope = store.get_offer(last_offer_id)
    if envelope is None:
        await ws.send_json({"type": "unknown_offer", "offer_id": last_offer_id})
        return

    if datetime.now(timezone.utc) > envelope.expires_at:
        await ws.send_json({"type": "unknown_offer", "offer_id": last_offer_id})
        return

    await ws.send_json(
        {
            "type": "offer_still_live",
            "offer_id": envelope.offer_id,
            "expires_at": envelope.expires_at.isoformat(),
        }
    )


async def _handle_ping(ws: WebSocket, msg: dict[str, Any]) -> None:
    await ws.send_json({"type": "pong", "ts": msg.get("ts")})


@router.websocket("/ws/notifications")
async def notifications_ws(ws: WebSocket, user_id: str = Query(...)) -> None:
    device_id = user_id  # keep query name backwards compatible
    await manager.connect(device_id, ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg_type = msg.get("type")
            if msg_type == "hello":
                await _handle_hello(ws, device_id, msg)
            elif msg_type == "ping":
                await _handle_ping(ws, msg)
    except WebSocketDisconnect:
        manager.disconnect(device_id)


@router.post("/test/send-ws-notification")
async def send_ws_notification(
    user_id: str = Query(...),
    title: str = Query("Hello"),
    body: str = Query("from WS"),
) -> dict:
    sent = await manager.send_to_user(
        user_id,
        {"type": "test", "title": title, "body": body},
    )
    return {"sent": sent, "user_id": user_id}
```

- [ ] **Step 3: Verify**

```bash
cd backend/fast && uv run ruff check routers/notifications.py
```

- [ ] **Step 4: Commit**

```bash
git add backend/fast/routers/notifications.py
git commit -m "feat(fast): WS hello + reconcile + offer push via manager"
```

---

### Task 8: Mount new routers in `main.py`

**Files:**
- Modify: `backend/fast/main.py`

- [ ] **Step 1: Read current file**

```bash
cat backend/fast/main.py
```

- [ ] **Step 2: Replace contents**

```python
# backend/fast/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import dev, notifications, offers, presence

app = FastAPI(title="notiftest-backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(notifications.router)
app.include_router(offers.router)
app.include_router(presence.router)
app.include_router(dev.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}
```

- [ ] **Step 3: Verify server boots**

```bash
cd backend/fast && uv run python -c "import main; print([r.path for r in main.app.routes])"
```

Expected: list includes `/api/ws/notifications`, `/api/offers/{offer_id}/accept`, `/api/presence/online`, `/api/dev/fire-offer`.

- [ ] **Step 4: Commit**

```bash
git add backend/fast/main.py
git commit -m "feat(fast): mount offers/presence/dev routers"
```

---

## Phase 2 — Backend stubs (Django)

### Task 9: Django FCM offer sender

**Files:**
- Modify: `backend/dj/fcmapp/views.py`
- Modify: `backend/dj/fcmapp/urls.py`

- [ ] **Step 1: Read current files**

```bash
cat backend/dj/fcmapp/views.py backend/dj/fcmapp/urls.py
```

- [ ] **Step 2: Add `send_fcm_offer` view**

Append to `backend/dj/fcmapp/views.py`:

```python
# --- offer push (data-only, Notifee renders locally) ---
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from firebase_admin import messaging

from .models import FCMToken


@csrf_exempt
@require_POST
def send_fcm_offer(request):
    device_id = request.POST.get("device_id", "").strip()
    envelope_json = request.POST.get("envelope", "").strip()
    if not device_id or not envelope_json:
        return JsonResponse({"error": "device_id and envelope required"}, status=400)

    try:
        # Validate JSON shape — we re-stringify below for safety.
        envelope = json.loads(envelope_json)
    except json.JSONDecodeError:
        return JsonResponse({"error": "envelope is not valid json"}, status=400)

    try:
        token_row = FCMToken.objects.get(device_id=device_id)
    except FCMToken.DoesNotExist:
        return JsonResponse({"error": "device_id not registered"}, status=404)

    message = messaging.Message(
        token=token_row.token,
        data={
            "envelope": json.dumps(envelope),
            "v": "1",
        },
        android=messaging.AndroidConfig(
            priority="high",
        ),
    )
    try:
        response = messaging.send(message)
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({"error": "fcm_send_failed", "detail": str(exc)}, status=502)

    return JsonResponse({"ok": True, "message_id": response})
```

- [ ] **Step 3: Wire URL**

Extend `backend/dj/fcmapp/urls.py` — add to `urlpatterns`:

```python
from .views import save_fcm_token, send_fcm_notification, send_fcm_offer

urlpatterns = [
    path("fcm-token/", save_fcm_token, name="save_fcm_token"),
    path("test/send-fcm/", send_fcm_notification, name="send_fcm_notification"),
    path("test/send-fcm-offer/", send_fcm_offer, name="send_fcm_offer"),
]
```

(Adjust imports above to match your existing file — this shows the final list.)

- [ ] **Step 4: Verify**

```bash
cd backend/dj && uv run python manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 5: Commit**

```bash
git add backend/dj/fcmapp/views.py backend/dj/fcmapp/urls.py
git commit -m "feat(dj): send_fcm_offer view for data-only offer push"
```

---

## Phase 3 — Frontend foundation

### Task 10: Install dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd frontend && pnpm add @reduxjs/toolkit react-redux @react-native-async-storage/async-storage @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

Expected: no errors.

- [ ] **Step 3: Rebuild native**

```bash
cd frontend && pnpm android
```

(This is slow; may be skipped during subagent execution if emulator not available. Verify again after all UI tasks.)

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(frontend): add RTK, react-redux, AsyncStorage, react-navigation"
```

---

### Task 11: Shared TypeScript types

**Files:**
- Create: `frontend/src/types/offer.ts`
- Create: `frontend/src/types/presence.ts`

- [ ] **Step 1: Write `types/offer.ts`**

```ts
// frontend/src/types/offer.ts

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
```

- [ ] **Step 2: Write `types/presence.ts`**

```ts
// frontend/src/types/presence.ts

export type PresenceIntent = 'offline' | 'online';

export type PresenceStatus =
    | 'offline'
    | 'going_online'
    | 'online'
    | 'going_offline'
    | 'offline_stale';
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types
git commit -m "feat(frontend): offer + presence TypeScript types"
```

---

### Task 12: Envelope validator

**Files:**
- Create: `frontend/src/service/envelope.ts`

- [ ] **Step 1: Write `service/envelope.ts`**

```ts
// frontend/src/service/envelope.ts
import type { OfferEnvelope, ServiceVisitPayload } from '../types/offer';

export class EnvelopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EnvelopeError';
    }
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);

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
        throw new EnvelopeError(`schema_version ${String(e.schema_version)} unsupported`);
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
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/service/envelope.ts
git commit -m "feat(frontend): OfferEnvelope validator with typed errors"
```

---

### Task 13: Persistence helpers

**Files:**
- Create: `frontend/src/store/persistence.ts`

- [ ] **Step 1: Write `store/persistence.ts`**

```ts
// frontend/src/store/persistence.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HistoryEntry, OfferEnvelope } from '../types/offer';
import type { PresenceIntent } from '../types/presence';

export const PERSIST_KEY = 'notiftest:v1';
export const PERSIST_VERSION = 1;

export type PersistedShape = {
    offer: {
        activeOffer: OfferEnvelope | null;
        history: Array<HistoryEntry>;
        acceptedOfferIds: Array<string>;
    };
    presence: {
        intent: PresenceIntent;
        lastAck: string | null;
    };
};

type Envelope = {
    version: number;
    data: PersistedShape;
};

export const savePersisted = async (data: PersistedShape): Promise<void> => {
    const payload: Envelope = { version: PERSIST_VERSION, data };
    try {
        await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
    } catch (err) {
        console.warn('persist save failed', err);
    }
};

export const loadPersisted = async (): Promise<PersistedShape | null> => {
    try {
        const raw = await AsyncStorage.getItem(PERSIST_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Envelope;
        if (parsed.version !== PERSIST_VERSION) {
            await AsyncStorage.removeItem(PERSIST_KEY);
            return null;
        }
        const active = parsed.data.offer.activeOffer;
        if (active) {
            const exp = Date.parse(active.expires_at);
            if (Number.isFinite(exp) && Date.now() > exp) {
                parsed.data.offer.activeOffer = null;
            }
        }
        return parsed.data;
    } catch (err) {
        console.warn('persist load failed', err);
        return null;
    }
};

export const PENDING_MUTATION_PREFIX = 'pending_mutations:';

export type PendingMutation = {
    offer_id: string;
    action: 'accept' | 'decline';
    reason?: string;
    other_text?: string;
    ts: number;
};

export const writePendingMutation = async (m: PendingMutation): Promise<void> => {
    await AsyncStorage.setItem(
        `${PENDING_MUTATION_PREFIX}${m.offer_id}`,
        JSON.stringify(m),
    );
};

export const drainPendingMutations = async (): Promise<Array<PendingMutation>> => {
    const keys = await AsyncStorage.getAllKeys();
    const matching = keys.filter(k => k.startsWith(PENDING_MUTATION_PREFIX));
    const out: Array<PendingMutation> = [];
    for (const key of matching) {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        try {
            out.push(JSON.parse(raw) as PendingMutation);
        } catch {
            // corrupt — drop
        }
        await AsyncStorage.removeItem(key);
    }
    return out;
};
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/persistence.ts
git commit -m "feat(frontend): AsyncStorage persistence + pending_mutations helpers"
```

---

### Task 14: `offerSlice`

**Files:**
- Create: `frontend/src/store/offerSlice.ts`

- [ ] **Step 1: Write `store/offerSlice.ts`**

```ts
// frontend/src/store/offerSlice.ts
import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { acceptOfferHttp, declineOfferHttp } from '../service/offerApi';
import type {
    DeclineReason,
    HistoryEntry,
    OfferEnvelope,
    OfferStatus,
} from '../types/offer';
import { hydrateFromStorage } from './hydrate';

type PendingAction = 'accepting' | 'declining' | null;

export type OfferState = {
    activeOffer: OfferEnvelope | null;
    activeStatus: OfferStatus | null;
    pendingAction: PendingAction;
    postError: { code: string; message: string } | null;
    retryCount: number;
    acceptedOfferIds: Array<string>;
    history: Array<HistoryEntry>;
};

const initialState: OfferState = {
    activeOffer: null,
    activeStatus: null,
    pendingAction: null,
    postError: null,
    retryCount: 0,
    acceptedOfferIds: [],
    history: [],
};

const pushHistory = (
    state: OfferState,
    entry: HistoryEntry,
): void => {
    state.history.unshift(entry);
    if (state.history.length > 20) state.history.length = 20;
};

export const acceptOffer = createAsyncThunk<
    { offer_id: string; alreadyResolved: boolean },
    { offer_id: string; device_id: string },
    { rejectValue: { code: string; message: string } }
>('offer/accept', async ({ offer_id, device_id }, { rejectWithValue }) => {
    try {
        const result = await acceptOfferHttp(offer_id, device_id);
        return { offer_id, alreadyResolved: result.alreadyResolved };
    } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        return rejectWithValue({
            code: e.code ?? 'network_error',
            message: e.message ?? 'Accept failed',
        });
    }
});

export const declineOffer = createAsyncThunk<
    { offer_id: string; reason: DeclineReason },
    { offer_id: string; device_id: string; reason: DeclineReason },
    { rejectValue: { code: string; message: string } }
>('offer/decline', async ({ offer_id, device_id, reason }, { rejectWithValue }) => {
    try {
        await declineOfferHttp(offer_id, device_id, reason);
        return { offer_id, reason };
    } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        return rejectWithValue({
            code: e.code ?? 'network_error',
            message: e.message ?? 'Decline failed',
        });
    }
});

const offerSlice = createSlice({
    name: 'offer',
    initialState,
    reducers: {
        offerReceived(state, action: PayloadAction<OfferEnvelope>) {
            if (state.activeOffer && state.activeOffer.offer_id !== action.payload.offer_id) {
                pushHistory(state, {
                    offer_id: state.activeOffer.offer_id,
                    type: state.activeOffer.type,
                    status: 'superseded',
                    resolved_at: new Date().toISOString(),
                });
            }
            state.activeOffer = action.payload;
            state.activeStatus = 'received';
            state.pendingAction = null;
            state.postError = null;
            state.retryCount = 0;
        },
        offerCountdownExpired(state) {
            if (!state.activeOffer) return;
            pushHistory(state, {
                offer_id: state.activeOffer.offer_id,
                type: state.activeOffer.type,
                status: 'expired',
                resolved_at: new Date().toISOString(),
            });
            state.activeOffer = null;
            state.activeStatus = null;
            state.pendingAction = null;
        },
        offerSuperseded(state, action: PayloadAction<string>) {
            if (!state.activeOffer) return;
            if (state.activeOffer.offer_id !== action.payload) return;
            pushHistory(state, {
                offer_id: state.activeOffer.offer_id,
                type: state.activeOffer.type,
                status: 'superseded',
                resolved_at: new Date().toISOString(),
            });
            state.activeOffer = null;
            state.activeStatus = null;
        },
        clearActiveOffer(state) {
            state.activeOffer = null;
            state.activeStatus = null;
            state.pendingAction = null;
            state.postError = null;
            state.retryCount = 0;
        },
        acceptedFromBackground(state, action: PayloadAction<string>) {
            if (!state.acceptedOfferIds.includes(action.payload)) {
                state.acceptedOfferIds.push(action.payload);
            }
            if (state.activeOffer?.offer_id === action.payload) {
                pushHistory(state, {
                    offer_id: action.payload,
                    type: state.activeOffer.type,
                    status: 'accepted',
                    resolved_at: new Date().toISOString(),
                });
                state.activeOffer = null;
                state.activeStatus = null;
                state.pendingAction = null;
            }
        },
    },
    extraReducers: builder => {
        builder
            .addCase(acceptOffer.pending, state => {
                state.pendingAction = 'accepting';
                state.postError = null;
            })
            .addCase(acceptOffer.fulfilled, (state, action) => {
                const id = action.payload.offer_id;
                if (!state.acceptedOfferIds.includes(id)) {
                    state.acceptedOfferIds.push(id);
                }
                if (state.activeOffer?.offer_id === id) {
                    pushHistory(state, {
                        offer_id: id,
                        type: state.activeOffer.type,
                        status: 'accepted',
                        resolved_at: new Date().toISOString(),
                    });
                    state.activeOffer = null;
                    state.activeStatus = null;
                }
                state.pendingAction = null;
                state.retryCount = 0;
            })
            .addCase(acceptOffer.rejected, (state, action) => {
                state.pendingAction = null;
                state.retryCount += 1;
                state.postError = action.payload ?? {
                    code: 'unknown',
                    message: 'Unknown error',
                };
                if (action.payload?.code === 'expired' && state.activeOffer) {
                    pushHistory(state, {
                        offer_id: state.activeOffer.offer_id,
                        type: state.activeOffer.type,
                        status: 'expired',
                        resolved_at: new Date().toISOString(),
                    });
                    state.activeOffer = null;
                    state.activeStatus = null;
                }
            })
            .addCase(declineOffer.pending, state => {
                state.pendingAction = 'declining';
                state.postError = null;
            })
            .addCase(declineOffer.fulfilled, (state, action) => {
                const id = action.payload.offer_id;
                if (state.activeOffer?.offer_id === id) {
                    pushHistory(state, {
                        offer_id: id,
                        type: state.activeOffer.type,
                        status: 'declined',
                        resolved_at: new Date().toISOString(),
                        decline_reason: action.payload.reason,
                    });
                    state.activeOffer = null;
                    state.activeStatus = null;
                }
                state.pendingAction = null;
            })
            .addCase(declineOffer.rejected, (state, action) => {
                state.pendingAction = null;
                state.postError = action.payload ?? {
                    code: 'unknown',
                    message: 'Unknown error',
                };
            })
            .addCase(hydrateFromStorage, (state, action) => {
                const persisted = action.payload.offer;
                if (!persisted) return;
                state.activeOffer = persisted.activeOffer;
                state.activeStatus = persisted.activeOffer ? 'received' : null;
                state.history = persisted.history;
                state.acceptedOfferIds = persisted.acceptedOfferIds;
            });
    },
});

export const {
    offerReceived,
    offerCountdownExpired,
    offerSuperseded,
    clearActiveOffer,
    acceptedFromBackground,
} = offerSlice.actions;

export default offerSlice.reducer;
```

- [ ] **Step 2: Create `store/hydrate.ts` (referenced above)**

```ts
// frontend/src/store/hydrate.ts
import { createAction } from '@reduxjs/toolkit';

import type { PersistedShape } from './persistence';

export const hydrateFromStorage = createAction<PersistedShape>('app/hydrate');
```

- [ ] **Step 3: Verify** (will fail until offerApi exists — that's Task 17; leave failing until then or stub)

For now, create stub `service/offerApi.ts`:

```ts
// frontend/src/service/offerApi.ts (stub — replaced in Task 17)
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
```

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/offerSlice.ts frontend/src/store/hydrate.ts frontend/src/service/offerApi.ts
git commit -m "feat(frontend): offerSlice with retry-aware thunks + history"
```

---

### Task 15: `presenceSlice`

**Files:**
- Create: `frontend/src/store/presenceSlice.ts`
- Create: `frontend/src/service/presenceApi.ts` (stub now; replaced in Task 18)

- [ ] **Step 1: Write stub `service/presenceApi.ts`**

```ts
// frontend/src/service/presenceApi.ts (stub — replaced in Task 18)
import type { PresenceIntent } from '../types/presence';

export const setPresenceIntent = async (
    _deviceId: string,
    _intent: PresenceIntent,
): Promise<{ server_time: string }> => {
    throw new Error('not implemented — replaced in Task 18');
};
```

- [ ] **Step 2: Write `store/presenceSlice.ts`**

```ts
// frontend/src/store/presenceSlice.ts
import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { setPresenceIntent } from '../service/presenceApi';
import type { PresenceIntent, PresenceStatus } from '../types/presence';
import { hydrateFromStorage } from './hydrate';

export type PresenceState = {
    intent: PresenceIntent;
    status: PresenceStatus;
    lastAck: string | null;
    lastError: string | null;
};

const initialState: PresenceState = {
    intent: 'offline',
    status: 'offline',
    lastAck: null,
    lastError: null,
};

export const toggleIntent = createAsyncThunk<
    { intent: PresenceIntent; server_time: string },
    { device_id: string; intent: PresenceIntent },
    { rejectValue: string }
>('presence/toggle', async ({ device_id, intent }, { rejectWithValue }) => {
    try {
        const result = await setPresenceIntent(device_id, intent);
        return { intent, server_time: result.server_time };
    } catch (err: unknown) {
        const e = err as { message?: string };
        return rejectWithValue(e.message ?? 'presence update failed');
    }
});

const presenceSlice = createSlice({
    name: 'presence',
    initialState,
    reducers: {
        presenceAcked(state, action: PayloadAction<string>) {
            state.lastAck = action.payload;
            if (state.intent === 'online' && state.status === 'offline_stale') {
                state.status = 'online';
            }
        },
        presenceStale(state) {
            if (state.status === 'online') state.status = 'offline_stale';
        },
        presenceServerIntent(state, action: PayloadAction<PresenceIntent>) {
            state.intent = action.payload;
            state.status = action.payload === 'online' ? 'online' : 'offline';
        },
    },
    extraReducers: builder => {
        builder
            .addCase(toggleIntent.pending, (state, action) => {
                state.status =
                    action.meta.arg.intent === 'online' ? 'going_online' : 'going_offline';
                state.lastError = null;
            })
            .addCase(toggleIntent.fulfilled, (state, action) => {
                state.intent = action.payload.intent;
                state.status = action.payload.intent === 'online' ? 'online' : 'offline';
                state.lastAck = action.payload.server_time;
            })
            .addCase(toggleIntent.rejected, (state, action) => {
                state.status = state.intent === 'online' ? 'online' : 'offline';
                state.lastError = action.payload ?? 'unknown';
            })
            .addCase(hydrateFromStorage, (state, action) => {
                if (!action.payload.presence) return;
                state.intent = action.payload.presence.intent;
                state.status = state.intent;
                state.lastAck = action.payload.presence.lastAck;
            });
    },
});

export const { presenceAcked, presenceStale, presenceServerIntent } = presenceSlice.actions;
export default presenceSlice.reducer;
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/presenceSlice.ts frontend/src/service/presenceApi.ts
git commit -m "feat(frontend): presenceSlice with toggle thunk + stale handling"
```

---

### Task 16: `bootSlice` — hydrate gate + drain pending mutations

**Files:**
- Create: `frontend/src/store/bootSlice.ts`

- [ ] **Step 1: Write `store/bootSlice.ts`**

```ts
// frontend/src/store/bootSlice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { acceptOfferHttp } from '../service/offerApi';
import { getDeviceId } from '../service/deviceId';
import { drainPendingMutations, loadPersisted } from './persistence';
import { hydrateFromStorage } from './hydrate';
import { acceptedFromBackground } from './offerSlice';

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
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/bootSlice.ts
git commit -m "feat(frontend): bootSlice with pending_mutations drain"
```

---

### Task 17: `offerApi` with retry + idempotency

**Files:**
- Modify: `frontend/src/service/offerApi.ts` (replace stub)

- [ ] **Step 1: Rewrite `service/offerApi.ts`**

```ts
// frontend/src/service/offerApi.ts
import type { DeclineReason } from '../types/offer';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

const RETRY_DELAYS_MS = [500, 1500, 4000];

type HttpError = { code: string; message: string; status?: number };

const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

const parseError = async (resp: Response): Promise<HttpError> => {
    try {
        const body = (await resp.json()) as { code?: string; detail?: { code?: string } };
        const code = body.code ?? body.detail?.code ?? `http_${resp.status}`;
        return { code, message: `HTTP ${resp.status}`, status: resp.status };
    } catch {
        return { code: `http_${resp.status}`, message: `HTTP ${resp.status}`, status: resp.status };
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
            if (resp.status === 409 || resp.status === 410 || resp.status === 422) {
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
        : ({ code: 'network_error', message: (e as Error).message } satisfies HttpError);
};

export const acceptOfferHttp = async (
    offerId: string,
    deviceId: string,
): Promise<{ alreadyResolved: boolean }> => {
    const resp = await fetchWithRetry(`${API_BASE}/api/offers/${offerId}/accept`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `${offerId}:accept`,
        },
        body: JSON.stringify({ device_id: deviceId }),
    });
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
    const resp = await fetchWithRetry(`${API_BASE}/api/offers/${offerId}/decline`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `${offerId}:decline`,
        },
        body: JSON.stringify(body),
    });
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
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/service/offerApi.ts
git commit -m "feat(frontend): offerApi with retry/backoff + idempotency key"
```

---

### Task 18: `presenceApi`

**Files:**
- Modify: `frontend/src/service/presenceApi.ts`

- [ ] **Step 1: Rewrite `service/presenceApi.ts`**

```ts
// frontend/src/service/presenceApi.ts
import type { PresenceIntent } from '../types/presence';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

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
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/service/presenceApi.ts
git commit -m "feat(frontend): presenceApi.setPresenceIntent"
```

---

### Task 19: Store wiring + persist middleware + typed hooks

**Files:**
- Create: `frontend/src/store/rootReducer.ts`
- Create: `frontend/src/store/persistMiddleware.ts`
- Create: `frontend/src/store/index.ts`

- [ ] **Step 1: Write `store/rootReducer.ts`**

```ts
// frontend/src/store/rootReducer.ts
import { combineReducers } from '@reduxjs/toolkit';

import bootReducer from './bootSlice';
import offerReducer from './offerSlice';
import presenceReducer from './presenceSlice';

export const rootReducer = combineReducers({
    boot: bootReducer,
    offer: offerReducer,
    presence: presenceReducer,
});
```

- [ ] **Step 2: Write `store/persistMiddleware.ts`**

```ts
// frontend/src/store/persistMiddleware.ts
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';

import {
    acceptOffer,
    acceptedFromBackground,
    clearActiveOffer,
    declineOffer,
    offerCountdownExpired,
    offerReceived,
    offerSuperseded,
} from './offerSlice';
import { presenceAcked, presenceServerIntent, toggleIntent } from './presenceSlice';
import { savePersisted } from './persistence';
import type { RootState } from './index';

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
```

- [ ] **Step 3: Write `store/index.ts`**

```ts
// frontend/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import { persistMiddleware } from './persistMiddleware';
import { rootReducer } from './rootReducer';

export const store = configureStore({
    reducer: rootReducer,
    middleware: getDefault =>
        getDefault({
            serializableCheck: {
                // envelope carries ISO strings; no Date objects. Safe.
                ignoredActions: ['app/hydrate'],
            },
        }).prepend(persistMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/rootReducer.ts frontend/src/store/persistMiddleware.ts frontend/src/store/index.ts
git commit -m "feat(frontend): configureStore + persist listener + typed hooks"
```

---

## Phase 4 — Frontend transport

### Task 20: Extend `websocket.ts` — parse envelopes, hello, reconcile

**Files:**
- Modify: `frontend/src/service/websocket.ts`

- [ ] **Step 1: Read current file**

```bash
cat frontend/src/service/websocket.ts
```

- [ ] **Step 2: Rewrite to dispatch into Redux**

Replace the contents of `frontend/src/service/websocket.ts`:

```ts
// frontend/src/service/websocket.ts
import { getDeviceId } from './deviceId';
import { validateEnvelope, EnvelopeError } from './envelope';
import { store } from '../store';
import {
    clearActiveOffer,
    offerReceived,
    offerSuperseded,
} from '../store/offerSlice';
import { presenceAcked, presenceServerIntent } from '../store/presenceSlice';

const WS_URL =
    process.env.EXPO_PUBLIC_WS_URL ?? 'ws://127.0.0.1:8000/api/ws/notifications';

type Status = 'connecting' | 'open' | 'closed' | 'error';
type StatusListener = (s: Status) => void;

let socket: WebSocket | null = null;
const listeners = new Set<StatusListener>();

const notify = (s: Status): void => {
    listeners.forEach(l => l(s));
};

const sendHello = async (): Promise<void> => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const state = store.getState();
    const device_id = await getDeviceId();
    socket.send(
        JSON.stringify({
            type: 'hello',
            device_id,
            intent: state.presence.intent,
            last_offer_id: state.offer.activeOffer?.offer_id ?? null,
            last_action: state.offer.pendingAction ?? null,
        }),
    );
};

const schedulePing = (): (() => void) => {
    const id = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
    }, 20_000);
    return () => clearInterval(id);
};

const handleMessage = (raw: string): void => {
    let msg: unknown;
    try {
        msg = JSON.parse(raw);
    } catch {
        return;
    }
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;

    switch (m.type) {
        case 'offer': {
            try {
                const envelope = validateEnvelope(m.envelope);
                store.dispatch(offerReceived(envelope));
            } catch (err) {
                if (err instanceof EnvelopeError) {
                    console.warn('bad envelope', err.message);
                } else {
                    console.warn('envelope dispatch failed', err);
                }
            }
            break;
        }
        case 'offer_still_live': {
            // server says offer still open; we keep current modal if ids match.
            break;
        }
        case 'offer_resolved': {
            const id = m.offer_id;
            if (typeof id !== 'string') return;
            const active = store.getState().offer.activeOffer;
            if (active?.offer_id === id) {
                store.dispatch(clearActiveOffer());
            }
            break;
        }
        case 'unknown_offer': {
            const id = m.offer_id;
            if (typeof id !== 'string') return;
            const active = store.getState().offer.activeOffer;
            if (active?.offer_id === id) {
                store.dispatch(offerSuperseded(id));
            }
            break;
        }
        case 'intent_mismatch': {
            const si = m.server_intent;
            if (si === 'online' || si === 'offline') {
                store.dispatch(presenceServerIntent(si));
            }
            break;
        }
        case 'pong': {
            store.dispatch(presenceAcked(new Date().toISOString()));
            break;
        }
        default:
            break;
    }
};

let cancelPing: (() => void) | null = null;

export const connectWebSocket = async (): Promise<void> => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }
    notify('connecting');
    const deviceId = await getDeviceId();
    socket = new WebSocket(`${WS_URL}?user_id=${encodeURIComponent(deviceId)}`);

    socket.onopen = () => {
        notify('open');
        void sendHello();
        cancelPing = schedulePing();
    };
    socket.onmessage = ev => handleMessage(ev.data as string);
    socket.onerror = () => notify('error');
    socket.onclose = () => {
        notify('closed');
        socket = null;
        if (cancelPing) {
            cancelPing();
            cancelPing = null;
        }
    };
};

export const disconnectWebSocket = (): void => {
    if (socket) {
        socket.close();
        socket = null;
    }
};

export const onWsStatus = (listener: StatusListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/service/websocket.ts
git commit -m "feat(frontend): WS dispatches offer/reconcile into Redux + ping loop"
```

---

## Phase 5 — Frontend UI

### Task 21: `useCountdown` hook

**Files:**
- Create: `frontend/src/offer/useCountdown.ts`

- [ ] **Step 1: Write `offer/useCountdown.ts`**

```ts
// frontend/src/offer/useCountdown.ts
import { useEffect, useState } from 'react';

import { useAppDispatch } from '../store';
import { offerCountdownExpired } from '../store/offerSlice';

export const useCountdown = (expiresAt: string | null): number => {
    const [remainingMs, setRemainingMs] = useState(0);
    const dispatch = useAppDispatch();

    useEffect(() => {
        if (!expiresAt) {
            setRemainingMs(0);
            return;
        }
        const target = Date.parse(expiresAt);
        const tick = () => {
            const ms = target - Date.now();
            const clamped = Math.max(0, ms);
            setRemainingMs(clamped);
            if (clamped <= 0) {
                dispatch(offerCountdownExpired());
            }
        };
        tick();
        const id = setInterval(tick, 200);
        return () => clearInterval(id);
    }, [expiresAt, dispatch]);

    return remainingMs;
};
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/offer/useCountdown.ts
git commit -m "feat(frontend): useCountdown hook driving expired action"
```

---

### Task 22: `OfferCard` component

**Files:**
- Create: `frontend/src/offer/OfferCard.tsx`

- [ ] **Step 1: Write `offer/OfferCard.tsx`**

```tsx
// frontend/src/offer/OfferCard.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ServiceVisitPayload } from '../types/offer';

type Props = { payload: ServiceVisitPayload };

const prettyCategory = (c: string): string =>
    c.replace('_', ' ').replace(/^./, s => s.toUpperCase());

export const OfferCard = ({ payload }: Props) => {
    const urgencyBadge =
        payload.issue.urgency === 'emergency'
            ? '🚨 EMERGENCY'
            : payload.issue.urgency.toUpperCase();
    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.category}>{prettyCategory(payload.appliance.category)}</Text>
                <Text
                    style={[
                        styles.urgency,
                        payload.issue.urgency === 'emergency' && styles.urgencyEmergency,
                    ]}>
                    {urgencyBadge}
                </Text>
            </View>
            <Text style={styles.title}>{payload.issue.title}</Text>
            <Text style={styles.description}>{payload.issue.description}</Text>

            <Text style={styles.sectionLabel}>Appointment</Text>
            <Text style={styles.sectionValue}>{payload.appointment.slot_label}</Text>

            <Text style={styles.sectionLabel}>Customer</Text>
            <Text style={styles.sectionValue}>
                {payload.customer.name} ({payload.customer.type})
            </Text>
            <Text style={styles.sectionValueMuted}>{payload.customer.phone_masked}</Text>

            <Text style={styles.sectionLabel}>Address</Text>
            <Text style={styles.sectionValue}>
                {payload.address.line1}
                {payload.address.line2 ? `, ${payload.address.line2}` : ''}
            </Text>
            <Text style={styles.sectionValueMuted}>
                {payload.address.city} • {payload.address.postal}
            </Text>
            {payload.address.landmark ? (
                <Text style={styles.sectionValueMuted}>Landmark: {payload.address.landmark}</Text>
            ) : null}

            {payload.appliance.brand || payload.appliance.model ? (
                <>
                    <Text style={styles.sectionLabel}>Appliance</Text>
                    <Text style={styles.sectionValue}>
                        {[payload.appliance.brand, payload.appliance.model]
                            .filter(Boolean)
                            .join(' ')}
                        {payload.appliance.age_years
                            ? ` • ${payload.appliance.age_years}y old`
                            : ''}
                    </Text>
                </>
            ) : null}

            {payload.issue.symptoms.length > 0 ? (
                <>
                    <Text style={styles.sectionLabel}>Symptoms</Text>
                    <Text style={styles.sectionValue}>
                        {payload.issue.symptoms.join(', ')}
                    </Text>
                </>
            ) : null}

            <Text style={styles.sectionLabel}>Estimated duration</Text>
            <Text style={styles.sectionValue}>
                {payload.job_meta.estimated_duration_minutes} min
                {payload.job_meta.requires_parts ? ' • parts may be needed' : ''}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        padding: 20,
        backgroundColor: '#fff',
        borderRadius: 12,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    category: { fontSize: 14, fontWeight: '600', color: '#555' },
    urgency: { fontSize: 12, fontWeight: '700', color: '#1e88e5' },
    urgencyEmergency: { color: '#d32f2f' },
    title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
    description: { fontSize: 14, color: '#333', marginBottom: 16 },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#888',
        textTransform: 'uppercase',
        marginTop: 10,
    },
    sectionValue: { fontSize: 15, color: '#111' },
    sectionValueMuted: { fontSize: 14, color: '#555' },
});
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/offer/OfferCard.tsx
git commit -m "feat(frontend): OfferCard renders service_visit payload"
```

---

### Task 23: `DeclineReasonSheet` component

**Files:**
- Create: `frontend/src/offer/DeclineReasonSheet.tsx`

- [ ] **Step 1: Write `offer/DeclineReasonSheet.tsx`**

```tsx
// frontend/src/offer/DeclineReasonSheet.tsx
import React, { useState } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import type { DeclineReason } from '../types/offer';

type Props = {
    visible: boolean;
    onCancel: () => void;
    onSubmit: (reason: DeclineReason) => void;
};

type ReasonKind = DeclineReason['kind'];

const OPTIONS: Array<{ kind: ReasonKind; label: string }> = [
    { kind: 'sick', label: 'Sick / unwell' },
    { kind: 'on_other_job', label: 'On another job' },
    { kind: 'vehicle_issue', label: 'Vehicle issue' },
    { kind: 'other', label: 'Other' },
];

export const DeclineReasonSheet = ({ visible, onCancel, onSubmit }: Props) => {
    const [selected, setSelected] = useState<ReasonKind | null>(null);
    const [otherText, setOtherText] = useState('');

    const canSubmit =
        selected !== null &&
        (selected !== 'other' || otherText.trim().length >= 3);

    const handleSubmit = () => {
        if (!selected) return;
        if (selected === 'other') {
            onSubmit({ kind: 'other', text: otherText.trim() });
        } else {
            onSubmit({ kind: selected } as DeclineReason);
        }
        setSelected(null);
        setOtherText('');
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <Text style={styles.title}>Decline offer</Text>
                    <Text style={styles.subtitle}>Tell dispatch why.</Text>
                    {OPTIONS.map(opt => {
                        const isSelected = selected === opt.kind;
                        return (
                            <Pressable
                                key={opt.kind}
                                onPress={() => setSelected(opt.kind)}
                                style={[
                                    styles.option,
                                    isSelected && styles.optionSelected,
                                ]}>
                                <Text
                                    style={[
                                        styles.optionLabel,
                                        isSelected && styles.optionLabelSelected,
                                    ]}>
                                    {opt.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                    {selected === 'other' ? (
                        <TextInput
                            placeholder="At least 3 characters"
                            value={otherText}
                            onChangeText={setOtherText}
                            style={styles.otherInput}
                            multiline
                        />
                    ) : null}
                    <View style={styles.actionsRow}>
                        <Pressable onPress={onCancel} style={[styles.btn, styles.btnGhost]}>
                            <Text style={styles.btnGhostText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            style={[
                                styles.btn,
                                styles.btnPrimary,
                                !canSubmit && styles.btnDisabled,
                            ]}>
                            <Text style={styles.btnPrimaryText}>Submit</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
        backgroundColor: '#fff',
        padding: 20,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    title: { fontSize: 20, fontWeight: '700' },
    subtitle: { fontSize: 14, color: '#555', marginBottom: 12 },
    option: {
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        marginTop: 8,
    },
    optionSelected: { borderColor: '#1e88e5', backgroundColor: '#e3f2fd' },
    optionLabel: { fontSize: 15, color: '#111' },
    optionLabelSelected: { color: '#1e88e5', fontWeight: '600' },
    otherInput: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 10,
        padding: 12,
        marginTop: 8,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 16,
        justifyContent: 'flex-end',
    },
    btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
    btnGhost: { backgroundColor: '#f0f0f0' },
    btnGhostText: { color: '#333', fontWeight: '600' },
    btnPrimary: { backgroundColor: '#d32f2f' },
    btnPrimaryText: { color: '#fff', fontWeight: '700' },
    btnDisabled: { opacity: 0.45 },
});
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/offer/DeclineReasonSheet.tsx
git commit -m "feat(frontend): DeclineReasonSheet with reason picker + other validation"
```

---

### Task 24: `OfferOverlay` — root-level modal

**Files:**
- Create: `frontend/src/offer/OfferOverlay.tsx`

- [ ] **Step 1: Write `offer/OfferOverlay.tsx`**

```tsx
// frontend/src/offer/OfferOverlay.tsx
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    Vibration,
    View,
} from 'react-native';

import { getDeviceId } from '../service/deviceId';
import {
    acceptOffer,
    clearActiveOffer,
    declineOffer,
} from '../store/offerSlice';
import { useAppDispatch, useAppSelector } from '../store';
import type { DeclineReason } from '../types/offer';
import { DeclineReasonSheet } from './DeclineReasonSheet';
import { OfferCard } from './OfferCard';
import { useCountdown } from './useCountdown';

const formatRemaining = (ms: number): string => {
    const s = Math.ceil(ms / 1000);
    return `${s}s`;
};

export const OfferOverlay = () => {
    const dispatch = useAppDispatch();
    const activeOffer = useAppSelector(s => s.offer.activeOffer);
    const pendingAction = useAppSelector(s => s.offer.pendingAction);
    const postError = useAppSelector(s => s.offer.postError);
    const remainingMs = useCountdown(activeOffer?.expires_at ?? null);
    const [declineOpen, setDeclineOpen] = useState(false);

    React.useEffect(() => {
        if (activeOffer) Vibration.vibrate([0, 400, 200, 400]);
    }, [activeOffer?.offer_id]);

    const handleAccept = useCallback(async () => {
        if (!activeOffer) return;
        const device_id = await getDeviceId();
        await dispatch(
            acceptOffer({ offer_id: activeOffer.offer_id, device_id }),
        );
    }, [activeOffer, dispatch]);

    const handleDeclineSubmit = useCallback(
        async (reason: DeclineReason) => {
            if (!activeOffer) return;
            const device_id = await getDeviceId();
            setDeclineOpen(false);
            await dispatch(
                declineOffer({
                    offer_id: activeOffer.offer_id,
                    device_id,
                    reason,
                }),
            );
        },
        [activeOffer, dispatch],
    );

    if (!activeOffer) return null;

    const totalMs = activeOffer.expires_ms_total;
    const pct = Math.max(0, Math.min(1, remainingMs / totalMs));

    return (
        <Modal visible animationType="fade" transparent>
            <View style={styles.backdrop}>
                <View style={styles.container}>
                    <View style={styles.countdownRow}>
                        <View style={styles.countdownBarBg}>
                            <View
                                style={[
                                    styles.countdownBar,
                                    { width: `${pct * 100}%` },
                                    pct < 0.25 && styles.countdownBarUrgent,
                                ]}
                            />
                        </View>
                        <Text style={styles.countdownText}>
                            {formatRemaining(remainingMs)}
                        </Text>
                    </View>

                    <ScrollView contentContainerStyle={styles.scroll}>
                        <OfferCard payload={activeOffer.payload} />
                    </ScrollView>

                    {postError ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>
                                Error: {postError.message}
                            </Text>
                            <Pressable onPress={handleAccept} style={styles.retryBtn}>
                                <Text style={styles.retryBtnText}>Retry accept</Text>
                            </Pressable>
                        </View>
                    ) : null}

                    <View style={styles.actionsRow}>
                        <Pressable
                            onPress={() => setDeclineOpen(true)}
                            disabled={pendingAction !== null}
                            style={[styles.actionBtn, styles.declineBtn]}>
                            <Text style={styles.declineBtnText}>Decline</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleAccept}
                            disabled={pendingAction !== null}
                            style={[styles.actionBtn, styles.acceptBtn]}>
                            {pendingAction === 'accepting' ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.acceptBtnText}>Accept</Text>
                            )}
                        </Pressable>
                    </View>
                </View>

                <DeclineReasonSheet
                    visible={declineOpen}
                    onCancel={() => setDeclineOpen(false)}
                    onSubmit={handleDeclineSubmit}
                />

                {/* fallback dismiss in error state only — not on happy path */}
                {postError && remainingMs === 0 ? (
                    <Pressable
                        style={styles.dismissLink}
                        onPress={() => dispatch(clearActiveOffer())}>
                        <Text style={styles.dismissLinkText}>Dismiss</Text>
                    </Pressable>
                ) : null}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    container: {
        flex: 1,
        paddingTop: 60,
        paddingBottom: 30,
        paddingHorizontal: 16,
    },
    countdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    countdownBarBg: {
        flex: 1,
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 5,
        overflow: 'hidden',
    },
    countdownBar: { height: '100%', backgroundColor: '#4caf50', borderRadius: 5 },
    countdownBarUrgent: { backgroundColor: '#e53935' },
    countdownText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        width: 48,
        textAlign: 'right',
    },
    scroll: { paddingBottom: 16 },
    errorBox: {
        backgroundColor: '#c62828',
        padding: 12,
        borderRadius: 8,
        marginTop: 12,
    },
    errorText: { color: '#fff', fontSize: 14 },
    retryBtn: {
        marginTop: 8,
        backgroundColor: '#fff',
        paddingVertical: 8,
        borderRadius: 6,
        alignItems: 'center',
    },
    retryBtnText: { color: '#c62828', fontWeight: '700' },
    actionsRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    declineBtn: { backgroundColor: '#424242' },
    declineBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    acceptBtn: { backgroundColor: '#2e7d32' },
    acceptBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    dismissLink: {
        position: 'absolute',
        top: 20,
        right: 20,
    },
    dismissLinkText: { color: '#ddd', fontSize: 14 },
});
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/offer/OfferOverlay.tsx
git commit -m "feat(frontend): OfferOverlay full-screen modal with countdown + actions"
```

---

### Task 25: `PresenceToggle` component

**Files:**
- Create: `frontend/src/presence/PresenceToggle.tsx`

- [ ] **Step 1: Write `presence/PresenceToggle.tsx`**

```tsx
// frontend/src/presence/PresenceToggle.tsx
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDeviceId } from '../service/deviceId';
import { useAppDispatch, useAppSelector } from '../store';
import { toggleIntent } from '../store/presenceSlice';

export const PresenceToggle = () => {
    const dispatch = useAppDispatch();
    const intent = useAppSelector(s => s.presence.intent);
    const status = useAppSelector(s => s.presence.status);
    const lastError = useAppSelector(s => s.presence.lastError);

    const busy = status === 'going_online' || status === 'going_offline';
    const isOnline = intent === 'online';

    const handleToggle = useCallback(async () => {
        if (busy) return;
        const device_id = await getDeviceId();
        const next = isOnline ? 'offline' : 'online';
        await dispatch(toggleIntent({ device_id, intent: next }));
    }, [busy, dispatch, isOnline]);

    return (
        <View style={styles.row}>
            <Pressable
                onPress={handleToggle}
                disabled={busy}
                style={[
                    styles.btn,
                    isOnline && styles.btnOn,
                    busy && styles.btnBusy,
                ]}>
                <Text style={[styles.btnText, isOnline && styles.btnTextOn]}>
                    {busy
                        ? '...'
                        : isOnline
                          ? 'Online — tap to go Offline'
                          : 'Offline — tap to go Online'}
                </Text>
            </Pressable>
            {status === 'offline_stale' ? (
                <Text style={styles.staleText}>Connection stale</Text>
            ) : null}
            {lastError ? <Text style={styles.errorText}>{lastError}</Text> : null}
        </View>
    );
};

const styles = StyleSheet.create({
    row: { padding: 16, gap: 8 },
    btn: {
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ccc',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    btnOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
    btnBusy: { opacity: 0.6 },
    btnText: { color: '#333', fontWeight: '600' },
    btnTextOn: { color: '#fff' },
    staleText: { color: '#e65100', fontSize: 12 },
    errorText: { color: '#c62828', fontSize: 12 },
});
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/presence/PresenceToggle.tsx
git commit -m "feat(frontend): PresenceToggle online/offline switch"
```

---

### Task 26: Navigation + JobDetails screen

**Files:**
- Create: `frontend/src/nav/JobDetailsScreen.tsx`
- Create: `frontend/src/nav/RootNavigator.tsx`
- Create: `frontend/src/nav/deepLink.ts`
- Modify: `frontend/app.json` — add `"scheme": "notiftest"`

- [ ] **Step 1: Add URL scheme**

Edit `frontend/app.json`. Inside `expo` object, add:

```json
"scheme": "notiftest"
```

(Place next to the existing top-level keys — do not duplicate the `android` block.)

- [ ] **Step 2: Write `nav/JobDetailsScreen.tsx`**

```tsx
// frontend/src/nav/JobDetailsScreen.tsx
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppSelector } from '../store';

export const JobDetailsScreen = () => {
    const lastAccepted = useAppSelector(s => s.offer.acceptedOfferIds.at(-1));
    const history = useAppSelector(s => s.offer.history);
    const lastEntry = history.find(h => h.offer_id === lastAccepted && h.status === 'accepted');

    if (!lastAccepted || !lastEntry) {
        return (
            <View style={styles.empty}>
                <Text>No accepted offer.</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Job accepted</Text>
            <Text style={styles.muted}>Offer ID: {lastAccepted}</Text>
            <Text style={styles.sectionLabel}>Resolved at</Text>
            <Text>{lastEntry.resolved_at}</Text>
            <View style={styles.actionsRow}>
                <Pressable
                    onPress={() => Linking.openURL('tel:+911234567890')}
                    style={styles.btn}>
                    <Text style={styles.btnText}>Call customer (stub)</Text>
                </Pressable>
                <Pressable
                    onPress={() =>
                        Linking.openURL('google.navigation:q=18.5204,73.8567')
                    }
                    style={styles.btn}>
                    <Text style={styles.btnText}>Navigate (stub)</Text>
                </Pressable>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { padding: 20, gap: 8 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: '700' },
    muted: { color: '#777' },
    sectionLabel: { marginTop: 12, fontWeight: '600' },
    actionsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
    btn: {
        flex: 1,
        padding: 14,
        borderRadius: 8,
        backgroundColor: '#1e88e5',
        alignItems: 'center',
    },
    btnText: { color: '#fff', fontWeight: '700' },
});
```

- [ ] **Step 3: Write `nav/RootNavigator.tsx`**

```tsx
// frontend/src/nav/RootNavigator.tsx
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { PresenceToggle } from '../presence/PresenceToggle';
import { useAppSelector } from '../store';
import { JobDetailsScreen } from './JobDetailsScreen';

export type RootStackParamList = {
    Home: undefined;
    JobDetails: { offer_id?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
    prefixes: ['notiftest://'],
    config: {
        screens: {
            Home: '',
            JobDetails: 'offer/:offer_id',
        },
    },
};

const HomeScreen = () => {
    const activeOfferId = useAppSelector(s => s.offer.activeOffer?.offer_id);
    const presence = useAppSelector(s => s.presence.intent);
    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.h1}>notiftest</Text>
            <Text style={styles.muted}>presence: {presence}</Text>
            <Text style={styles.muted}>active offer: {activeOfferId ?? 'none'}</Text>
            <PresenceToggle />
        </SafeAreaView>
    );
};

export const RootNavigator = () => (
    <NavigationContainer linking={linking}>
        <Stack.Navigator>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="JobDetails" component={JobDetailsScreen} />
        </Stack.Navigator>
    </NavigationContainer>
);

const styles = StyleSheet.create({
    container: { padding: 20, gap: 8 },
    h1: { fontSize: 24, fontWeight: '700' },
    muted: { color: '#666' },
});
```

- [ ] **Step 4: Write `nav/deepLink.ts`**

```ts
// frontend/src/nav/deepLink.ts
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
```

- [ ] **Step 5: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/nav frontend/app.json
git commit -m "feat(frontend): react-navigation stack + JobDetails + notiftest:// scheme"
```

---

## Phase 6 — Frontend background / entry

### Task 27: Extend `notifications.ts` with offers channel + builder

**Files:**
- Modify: `frontend/src/service/notifications.ts`

- [ ] **Step 1: Read current file**

```bash
cat frontend/src/service/notifications.ts
```

- [ ] **Step 2: Extend**

Append to `frontend/src/service/notifications.ts`:

```ts
import notifee, { AndroidImportance } from '@notifee/react-native';

import type { OfferEnvelope, ServiceVisitPayload } from '../types/offer';

export const OFFERS_CHANNEL_ID = 'offers';

export const ensureOffersChannel = async (): Promise<void> => {
    await notifee.createChannel({
        id: OFFERS_CHANNEL_ID,
        name: 'Offers',
        importance: AndroidImportance.HIGH,
    });
};

const buildTitle = (payload: ServiceVisitPayload): string => {
    const prefix = payload.issue.urgency === 'emergency' ? '🚨 ' : '';
    return `${prefix}${payload.appliance.category} — ${payload.appointment.slot_label}`;
};

const buildBody = (payload: ServiceVisitPayload): string =>
    `${payload.issue.title} • ${payload.address.city}`;

export const displayOfferNotification = async (
    envelope: OfferEnvelope,
): Promise<void> => {
    await ensureOffersChannel();
    await notifee.displayNotification({
        id: envelope.offer_id,
        title: buildTitle(envelope.payload),
        body: buildBody(envelope.payload),
        data: { offer_id: envelope.offer_id },
        android: {
            channelId: OFFERS_CHANNEL_ID,
            importance: AndroidImportance.HIGH,
            pressAction: { id: 'default', launchActivity: 'default' },
            actions: [
                {
                    title: 'Accept',
                    pressAction: { id: 'accept', launchActivity: 'default' },
                },
            ],
        },
    });
};
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/service/notifications.ts
git commit -m "feat(frontend): offers channel + displayOfferNotification helper"
```

---

### Task 28: Extend `index.ts` — FCM + Notifee background handlers

**Files:**
- Modify: `frontend/index.ts`

- [ ] **Step 1: Read current file**

```bash
cat frontend/index.ts
```

- [ ] **Step 2: Rewrite `frontend/index.ts`**

```ts
// frontend/index.ts
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import { registerRootComponent } from 'expo';

import App from './App';
import { getDeviceId } from './src/service/deviceId';
import { validateEnvelope, EnvelopeError } from './src/service/envelope';
import { displayOfferNotification } from './src/service/notifications';
import { acceptOfferHttp } from './src/service/offerApi';
import { writePendingMutation } from './src/store/persistence';

messaging().setBackgroundMessageHandler(async remoteMessage => {
    try {
        const envelopeRaw = remoteMessage.data?.envelope;
        if (!envelopeRaw) return;
        const envelope = validateEnvelope(JSON.parse(envelopeRaw));
        await displayOfferNotification(envelope);
    } catch (err) {
        if (err instanceof EnvelopeError) {
            console.warn('bad envelope in background FCM', err.message);
        } else {
            console.warn('background FCM failed', err);
        }
    }
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type !== EventType.ACTION_PRESS) return;
    const actionId = detail.pressAction?.id;
    const offerId = detail.notification?.id;
    if (!offerId || actionId !== 'accept') return;

    try {
        const deviceId = await getDeviceId();
        await acceptOfferHttp(offerId, deviceId);
        await writePendingMutation({
            offer_id: offerId,
            action: 'accept',
            ts: Date.now(),
        });
        await notifee.cancelNotification(offerId);
    } catch (err) {
        console.warn('background accept failed', err);
    }
});

registerRootComponent(App);
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/index.ts
git commit -m "feat(frontend): FCM + Notifee background handlers wired for offers"
```

---

### Task 29: Rewrite `App.tsx` — Provider + hydrate gate + navigator

**Files:**
- Modify: `frontend/App.tsx`

- [ ] **Step 1: Read current file**

```bash
cat frontend/App.tsx
```

- [ ] **Step 2: Rewrite `App.tsx`**

```tsx
// frontend/App.tsx
import messaging, {
    type FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Provider } from 'react-redux';

import { OfferOverlay } from './src/offer/OfferOverlay';
import { RootNavigator } from './src/nav/RootNavigator';
import { registerFCMToken } from './src/service/fcm';
import {
    validateEnvelope,
    EnvelopeError,
} from './src/service/envelope';
import {
    connectWebSocket,
    disconnectWebSocket,
} from './src/service/websocket';
import { store } from './src/store';
import { initializeBoot } from './src/store/bootSlice';
import { offerReceived } from './src/store/offerSlice';

const HydrationSplash = () => (
    <View style={styles.splash}>
        <ActivityIndicator />
        <Text style={styles.splashText}>Loading…</Text>
    </View>
);

const InnerApp = () => {
    useEffect(() => {
        void registerFCMToken();
        void connectWebSocket();
        const unsub: FirebaseMessagingTypes.MessageHandler = async remoteMessage => {
            try {
                const raw = remoteMessage.data?.envelope;
                if (!raw) return;
                const envelope = validateEnvelope(JSON.parse(raw));
                store.dispatch(offerReceived(envelope));
            } catch (err) {
                if (err instanceof EnvelopeError) {
                    console.warn('bad foreground FCM envelope', err.message);
                }
            }
        };
        const offMessage = messaging().onMessage(unsub);
        return () => {
            offMessage();
            disconnectWebSocket();
        };
    }, []);

    return (
        <>
            <RootNavigator />
            <OfferOverlay />
        </>
    );
};

const App = () => {
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        void store.dispatch(initializeBoot()).finally(() => setHydrated(true));
    }, []);

    if (!hydrated) return <HydrationSplash />;

    return (
        <Provider store={store}>
            <InnerApp />
        </Provider>
    );
};

const styles = StyleSheet.create({
    splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    splashText: { color: '#555' },
});

export default App;
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/App.tsx
git commit -m "feat(frontend): App hosts Provider + hydrate gate + overlay + navigator"
```

---

## Phase 7 — Verification

### Task 30: Full static-check pass

- [ ] **Step 1: TypeScript**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck
```

Expected: no errors.

- [ ] **Step 2: ruff check**

```bash
cd backend/fast && uv run ruff check .
```

Expected: `All checks passed!`

- [ ] **Step 3: ruff format check**

```bash
cd backend/fast && uv run ruff format --check .
```

Expected: no unformatted files. If it fails, run `uv run ruff format .`, review the diff, commit, and retry.

- [ ] **Step 4: Django check**

```bash
cd backend/dj && uv run python manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 5: Rebuild native dev client**

```bash
cd frontend && pnpm android
```

(One-shot to confirm all native modules link.)

- [ ] **Step 6: Commit lint fixes if any**

```bash
git add -A
git commit -m "chore: format + lint fixes"
```

---

### Task 31: Manual flow checklist (device)

Prereqs:
- `cd backend/fast && uv run fastapi dev main.py`
- `cd backend/dj && uv run python manage.py runserver 0.0.0.0:8001`
- Android device running the dev client (`pnpm android`)
- `deviceId` visible on Home screen
- `frontend/.env.local` sets `EXPO_PUBLIC_WS_URL` and `EXPO_PUBLIC_API_URL` pointing at the dev machine's LAN IP

Replace `<DID>` with the on-screen device id and `<HOST>` with the LAN IP.

- [ ] **Flow A — Foreground WS accept**
  - Toggle Online → FastAPI log shows `POST /api/presence/online 200`
  - `curl -X POST "http://<HOST>:8000/api/dev/fire-offer?device_id=<DID>&transport=ws" -H "Content-Type: application/json" -d '{}'`
  - Modal pops instantly; countdown ring shrinks smoothly
  - Tap Accept → modal closes, JobDetails screen appears
  - FastAPI logs `POST /api/offers/<id>/accept 200`

- [ ] **Flow B — Foreground WS decline (reason)**
  - Fire offer → modal
  - Tap Decline → reason sheet
  - Pick `on_other_job`, Submit → modal closes
  - FastAPI logs decline with reason

- [ ] **Flow C — Decline with "other"**
  - Fire offer, Decline, pick `Other`
  - Submit disabled with <3 chars; type "no tools" → Submit enabled
  - Submit → FastAPI logs include `other_text`

- [ ] **Flow D — Background FCM accept from shade**
  - Toggle Online, lock phone
  - `curl -X POST "http://<HOST>:8000/api/dev/fire-offer?device_id=<DID>&transport=fcm" -H "Content-Type: application/json" -d '{}'`
  - Notification with Accept button on lock screen
  - Tap Accept from shade → FastAPI logs accept (single row; no duplicate)
  - Open app → JobDetails (not modal)

- [ ] **Flow E — Background FCM tap-body**
  - Lock phone, fire FCM offer
  - Tap notification body → app opens to deep link
  - Modal visible with correct offer; countdown resumed
  - Accept → JobDetails

- [ ] **Flow F — Kill-state delivery**
  - Swipe app away from recents
  - Fire FCM offer → notification arrives
  - Accept from shade
  - Open app → boot replay drains; lands on JobDetails; no duplicate POST in FastAPI logs

- [ ] **Flow G — Countdown expiry**
  - `curl -X POST "http://<HOST>:8000/api/dev/fire-offer?device_id=<DID>&transport=ws" -d '{"expires_ms_total": 5000}' -H "Content-Type: application/json"`
  - Do nothing → at 0s, modal auto-clears
  - Attempting accept after expiry returns 410 in FastAPI logs (verify via follow-up attempt)

- [ ] **Flow H — Supersede**
  - Fire offer A (20s window); modal up
  - At t≈10s, fire offer B
  - A dismissed, B shown
  - FastAPI logs include `POST /api/offers/<A>/superseded`

- [ ] **Flow I — Network flap during accept**
  - Fire offer, tap Accept, immediately airplane-mode on
  - Modal shows retry spinner / error
  - Airplane-mode off within 10s → retry succeeds → JobDetails

- [ ] **Flow J — Presence stale / reconcile**
  - Toggle Online; kill FastAPI (`Ctrl-C`)
  - Wait 60s+; restart FastAPI
  - App reconnects; if it sent `hello` with `online`, server has empty presence — verify via Redux DevTools-style console log or FastAPI log

- [ ] **Flow K — Zombie offer on cold start**
  - Fire offer, kill app immediately
  - Wait past `expires_at`
  - Relaunch app → no modal appears (hydrate drops expired offer)

- [ ] **Step 2: Record outcomes**

Copy the ticked checklist into a section of `docs/superpowers/specs/2026-04-21-service-engineer-offer-design.md` titled `Verification Log (YYYY-MM-DD)` with Pass/Fail per flow. Commit.

```bash
git add docs/superpowers/specs/2026-04-21-service-engineer-offer-design.md
git commit -m "docs(spec): verification log for service-engineer offer flow"
```

---

## Self-Review Notes

**Spec coverage check:**

| Spec §  | Section                             | Implemented in Task(s) |
|---------|-------------------------------------|------------------------|
| §4      | Offer schema (envelope + payload)   | 1 (Py), 11 (TS)        |
| §5.1    | Client module layout                | 10–29                  |
| §5.2    | Dependencies                        | 10                     |
| §5.3    | Single source of truth, idempotency, hand-rolled persistence | 13, 14, 17, 19, 28 |
| §5.4    | Foreground WS accept flow           | 20, 24                 |
| §5.5    | Background FCM accept flow          | 27, 28                 |
| §5.6    | Edge cases                          | 14, 17 (retry), 19 (persist), 20 (reconcile), 24 (retry UI) |
| §6.1–6.3| Offer FSM + slice shape + thunks    | 14, 17                 |
| §6.4–6.5| Presence FSM + slice                | 15, 18                 |
| §6.6    | WS `hello` reconcile                | 7, 20                  |
| §6.7    | useCountdown                        | 21                     |
| §7      | Persistence (hand-rolled)           | 13, 19, 29             |
| §8.1    | Backend file additions              | 1–9                    |
| §8.2    | HTTP endpoints                      | 3, 4, 6                |
| §8.3    | JobDetails                          | 1, 3, 11               |
| §8.4    | WS contract                         | 7, 20                  |
| §8.5    | FCM data-message + Notifee handler  | 9, 27, 28              |
| §8.6    | Idempotency (stub)                  | 2, 3                   |
| §9      | Verification strategy               | 30, 31                 |

No gaps.

**Type consistency check:**

- `OfferEnvelope.offer_id`, `type`, `created_at`, `expires_at`, `expires_ms_total`, `schema_version`, `payload` — same field names in Task 1 (Py) and Task 11 (TS). ✓
- `acceptOfferHttp` / `declineOfferHttp` / `supersededOfferHttp` consistent across Tasks 14, 16, 17, 28. ✓
- `pending_mutations:<id>` prefix used identically in Tasks 13 and 28 via exported constant. ✓
- `notiftest://offer/<id>` referenced in Tasks 26, 28 and scheme declared in Task 26 Step 1. ✓
- `Idempotency-Key` format `${offer_id}:${action}` used in Tasks 3 (server) and 17 (client). ✓

**Placeholder scan:** no TBD / "implement later" / "similar to Task N" without code / "appropriate error handling" patterns in the body of any task. Stubs in Tasks 14 and 15 are explicitly marked "replaced in Task 17/18" and given full replacement code there.
