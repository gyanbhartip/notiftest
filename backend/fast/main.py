from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.notifications import router as notifications_router

app = FastAPI(
    title="Notification Test API",
    description="API for testing notifications",
    version="0.1.0",
    root_path="/",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(notifications_router, prefix="/api", tags=["notifications"])


@app.get("/")
async def get():
    return {"message": "Root route works."}
