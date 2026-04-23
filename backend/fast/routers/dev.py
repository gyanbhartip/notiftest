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
