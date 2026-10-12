"""TEJAS-CV: Trusted Evaluation & Judgement Assurance System for Computer Vision.

Run:  uvicorn app.main:app --host 127.0.0.1 --port 8000
Docs: http://127.0.0.1:8000/docs
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import assets, auth, benchmarks, demo, jobs, ml, provenance, system, workspace, ws, sample_details
from .auth.middleware import AuthMiddleware
from .api.cache import PrivateAPIMiddleware
from .config import settings
from .core.events import bus
from .core.keys import platform_keys
from .core.ledger import ensure_genesis
from .database import SessionLocal, init_db, engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    if os.environ.get("VERCEL") == "1":
        if engine.dialect.name == "sqlite":
            logging.getLogger(__name__).warning(
                "Vercel is using temporary SQLite storage. Accounts and sessions will not survive "
                "cold starts or be shared between instances, so users WILL be logged out randomly. "
                "Connect a PostgreSQL database (Storage tab -> Neon) so DATABASE_URL is set, then redeploy."
            )
        elif not settings.platform_private_key:
            raise RuntimeError(
                "A shared Vercel database requires TEJAS_PLATFORM_PRIVATE_KEY so all instances "
                "use the same signing identity. Configure a stable 64-character hex Ed25519 key."
            )
    settings.ensure_dirs()
    init_db()
    platform_keys()
    with SessionLocal() as db:
        ensure_genesis(db)
    bus.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title="TEJAS-CV Assurance API", version="1.0.0", lifespan=lifespan,
              description="Offline integrity assurance for computer-vision data, models and inference outputs. "
                          "Detect -> Explain -> Prove -> Decide.")
# Starlette: the LAST middleware added is the outermost. Auth is added first so CORS wraps it
# and even 401/403 responses carry CORS headers.
app.add_middleware(AuthMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.add_middleware(PrivateAPIMiddleware)
for r in (auth.router, system.router, assets.router, jobs.router, provenance.router, demo.router,
          benchmarks.router, ml.router, workspace.router, ws.router, sample_details.router):
    app.include_router(r)


@app.get("/api/health", tags=["system"])
def health():
    """Liveness + deployment sanity check (no secrets). On Vercel, `persistent_sessions` must be
    true; if it is false, logins live in temporary per-instance SQLite and users get logged out."""
    dialect = engine.dialect.name
    return {
        "status": "ok",
        "database": dialect,
        "persistent_sessions": dialect == "postgresql" or not settings.on_vercel,
        "signing_key_configured": bool(settings.platform_private_key),
        "vercel": settings.on_vercel,
    }
