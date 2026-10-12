"""Shared bootstrapping for the command-line scripts (adds backend/ to sys.path, inits DB)."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def init():
    from app.config import settings
    from app.core.ledger import ensure_genesis
    from app.database import SessionLocal, init_db
    settings.ensure_dirs()
    init_db()
    with SessionLocal() as s:
        ensure_genesis(s)
    return settings
