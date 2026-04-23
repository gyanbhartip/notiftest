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
