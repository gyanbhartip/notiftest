# backend/fast/services/fcm_relay.py
from __future__ import annotations

import os

import httpx
from models.offer import OfferEnvelope

DJANGO_BASE_URL = os.getenv("DJANGO_BASE_URL", "http://127.0.0.1:9005")


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
