"""ASGI middleware enforcing the access policy on every HTTP request and WebSocket.

One central gate (instead of per-endpoint decorators) so no route can be forgotten:
tests/test_auth.py walks every registered route and checks its classification."""
from __future__ import annotations

import json
from http.cookies import SimpleCookie
from urllib.parse import parse_qs

import anyio

from ..config import settings
from ..core.actor import reset_actor, set_actor
from .security import COOKIE, aware, now, required_role, token_hash


def _token(scope) -> str | None:
    headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
    auth = headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    if "cookie" in headers:
        c = SimpleCookie()
        c.load(headers["cookie"])
        if COOKIE in c:
            return c[COOKIE].value
    qs = parse_qs(scope.get("query_string", b"").decode())
    return (qs.get("token") or [None])[0]


def lookup_user(token: str | None) -> dict | None:
    """Resolve a session token to an active user with ONE database round-trip.

    Same rules as before: the session must exist, be unrevoked and unexpired, and the
    account must exist, be enabled and have status 'active'."""
    if not token:
        return None
    from ..database import AuthSession, SessionLocal, User
    with SessionLocal() as db:
        row = (db.query(AuthSession.revoked, AuthSession.expires_at, User.id, User.username,
                        User.display_name, User.role, User.disabled, User.status)
               .join(User, User.id == AuthSession.user_id)
               .filter(AuthSession.token_sha256 == token_hash(token))
               .first())
    if row is None:
        return None
    revoked, expires_at, uid, username, display_name, role, disabled, status = row
    if revoked or aware(expires_at) < now() or disabled:
        return None
    status = "active" if status is None else status
    if status != "active":
        return None
    return {"id": uid, "username": username, "display_name": display_name, "role": role, "status": status}


class AuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        path = scope["path"]
        method = scope.get("method", "GET") if scope["type"] == "http" else "GET"
        need = "user" if scope["type"] == "websocket" else required_role(method, path)
        user = await anyio.to_thread.run_sync(lookup_user, _token(scope))
        if not settings.auth_required:
            need = "public"
        if need != "public":
            if user is None:
                return await self._deny(scope, receive, send, 401, "login required")
            if need == "admin" and user["role"] != "admin":
                return await self._deny(scope, receive, send, 403,
                                        "admin access required: users can use the platform but cannot change "
                                        "data, models, the registry or configuration")
        scope.setdefault("state", {})["user"] = user
        tok = set_actor(user["username"] if user else None)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_actor(tok)

    @staticmethod
    async def _deny(scope, receive, send, status, detail):
        if scope["type"] == "websocket":
            await receive()                                   # websocket.connect
            await send({"type": "websocket.close", "code": 4401 if status == 401 else 4403})
            return
        body = json.dumps({"detail": detail}).encode()
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json"),
                                (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})
