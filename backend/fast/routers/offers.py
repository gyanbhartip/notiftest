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

    if body.reason == "other" and (
        not body.other_text or len(body.other_text.strip()) < 3
    ):
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
