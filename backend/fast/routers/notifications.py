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
