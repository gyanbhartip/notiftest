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
