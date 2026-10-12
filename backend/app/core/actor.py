"""Who is acting right now.

Set per HTTP request by the auth middleware, per background job from Job.created_by, and
falls back to the local OS account for command-line scripts. Everything that records
provenance (asset uploads, jobs, inference records, audit blocks) reads it from here."""
from __future__ import annotations

import getpass
from contextlib import contextmanager
from contextvars import ContextVar

_actor: ContextVar[str | None] = ContextVar("tejas_actor", default=None)


def current_actor() -> str:
    a = _actor.get()
    if a:
        return a
    try:
        return f"local:{getpass.getuser()}"
    except Exception:  # noqa: BLE001
        return "local:unknown"


def set_actor(name: str | None):
    return _actor.set(name)


def reset_actor(token) -> None:
    _actor.reset(token)


@contextmanager
def acting_as(name: str | None):
    tok = _actor.set(name)
    try:
        yield
    finally:
        _actor.reset(tok)
