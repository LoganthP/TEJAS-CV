"""Test isolation: every test session gets its own throw-away TEJAS_HOME."""
import os
import sys
import tempfile
from pathlib import Path

_HOME = tempfile.mkdtemp(prefix="tejas-test-")
os.environ["TEJAS_HOME"] = _HOME
os.environ.setdefault("TEJAS_EMBEDDER", "handcrafted")
# Most tests exercise the engines/API directly; tests/test_auth.py switches enforcement on.
os.environ.setdefault("TEJAS_AUTH_REQUIRED", "0")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app.config import settings  # noqa: E402
from app.core.ledger import ensure_genesis  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402


@pytest.fixture(scope="session")
def db_ready():
    settings.ensure_dirs()
    init_db()
    with SessionLocal() as s:
        ensure_genesis(s)
    return True


@pytest.fixture(scope="session")
def demo_state(db_ready):
    from app.services import demo
    with SessionLocal() as s:
        return demo.bootstrap(s)


@pytest.fixture
def session(db_ready):
    with SessionLocal() as s:
        yield s
