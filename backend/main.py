import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import uvicorn

from backend.core.database import init_db, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        yield
    finally:
        engine.dispose()


app = FastAPI(title="AI Schedule Manage - Backend", lifespan=lifespan)

# Session middleware (required for OAuth callbacks)
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SESSION_SECRET", "dev-session-secret"))

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Include routers ─────────────────────────────────────────────────────

# Auth routes: /register, /auth/login, /auth/logout, /auth/me, /login, /protected
from backend.api.auth import router as auth_router
app.include_router(auth_router)

# Health check: GET /
from backend.api.health import router as health_router
app.include_router(health_router)

# Schedule CRUD: /schedules
from backend.api.schedules import router as schedules_router
app.include_router(schedules_router, prefix="/schedules")

# AI routes: /ai/summarize, /ai/predict, /ai/free-days, /ai/google/fetch
from backend.integrations.ai import router as ai_router
app.include_router(ai_router, prefix="/ai")

# Google OAuth routes: /google/login, /google/callback, /google/events
from backend.integrations.google import router as google_router
app.include_router(google_router)

# Microsoft OAuth routes: /microsoft/login, /microsoft/callback, /microsoft/events
from backend.integrations.microsoft import router as microsoft_router
app.include_router(microsoft_router)


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
