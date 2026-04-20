# main.py (or your router file)
import asyncio
import json
from typing import Any, Dict

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}  # user_id -> websocket

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        print(f"✅ WS connected for user: {user_id}")

    def disconnect(self, user_id: str):
        self.active_connections.pop(user_id, None)
        print(f"❌ WS disconnected for user: {user_id}")

    async def send_to_user(self, user_id: str, message: dict[str, Any]):
        if user_id in self.active_connections:
            ws = self.active_connections[user_id]
            await ws.send_text(json.dumps(message))
            print(f"📤 Sent WS notification to {user_id}")


manager = ConnectionManager()


@router.websocket("/ws/notifications")
async def websocket_endpoint(
    websocket: WebSocket, user_id: str = Query(..., description="User ID")
):
    await manager.connect(websocket, user_id)
    try:
        while True:
            msg = await websocket.receive_text()
            print(f"📩 from {user_id}: {msg}")
    except WebSocketDisconnect:
        manager.disconnect(user_id)


# ── TEST ENDPOINT ──
# Hit this from Postman / curl to simulate your backend sending a notification
@router.post("/test/send-ws-notification")
async def send_ws_notification(
    user_id: str, title: str = "Test WS", body: str = "Hello from FastAPI WS!"
):
    payload = {
        "id": f"ws-{int(asyncio.get_event_loop().time())}",
        "title": title,
        "body": body,
        "channelId": "default",
        # You can add android/ios keys for rich styling if you want
    }
    await manager.send_to_user(user_id, payload)
    return {"status": "sent via WS", "user_id": user_id}
