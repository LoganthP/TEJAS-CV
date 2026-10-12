"""Password hashing (scrypt, stdlib), session tokens, and the access policy.

Offline-friendly: no external identity provider, no third-party crypto beyond the stdlib.
Tokens are 256-bit random values; only their SHA-256 is stored server-side.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

SESSION_HOURS = 12
MAX_FAILED = 5
LOCK_MINUTES = 5
COOKIE = "tejas_session"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")

_N, _R, _P, _DK = 2 ** 14, 8, 1, 32


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_DK)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, dk = stored.split("$")
        calc = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
                              dklen=len(bytes.fromhex(dk)))
        return hmac.compare_digest(calc.hex(), dk)
    except (ValueError, TypeError):
        return False


def password_problem(password: str, username: str = "") -> str | None:
    if len(password) < 10:
        return "password must be at least 10 characters"
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "password must contain letters and digits"
    if username and username.lower() in password.lower():
        return "password must not contain the username"
    return None


def new_token() -> tuple[str, str]:
    tok = secrets.token_urlsafe(32)
    return tok, hashlib.sha256(tok.encode()).hexdigest()


def token_hash(tok: str) -> str:
    return hashlib.sha256(tok.encode()).hexdigest()


def now() -> datetime:
    return datetime.now(timezone.utc)


def expiry() -> datetime:
    return now() + timedelta(hours=SESSION_HOURS)


def aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------------------ access policy
# Default deny for changes: any non-GET request not listed below requires ADMIN.
PUBLIC = {("GET", "/api/health"), ("GET", "/api/auth/status"), ("POST", "/api/auth/login"),
          ("POST", "/api/auth/signup"), ("GET", "/docs"), ("GET", "/openapi.json"), ("GET", "/redoc"),
          ("GET", "/docs/oauth2-redirect")}

# Things a client may do: use the application without changing data, models or configuration.
CLIENT_ACTIONS = [
    ("POST", r"^/api/jobs$"),                       # run an assessment on existing assets
    ("POST", r"^/api/inference$"),                  # run a model on an image (creates a signed record)
    ("POST", r"^/api/inference/verify-chain$"),
    ("POST", r"^/api/inference/attest$"),
    ("POST", r"^/api/audit/verify$"),
    ("POST", r"^/api/system/verify-independent$"),
    ("POST", r"^/api/auth/logout$"),
    ("POST", r"^/api/auth/password$"),
    ("PATCH", r"^/api/auth/me$"),
    ("POST", r"^/api/auth/me/role-request$"),
    ("DELETE", r"^/api/auth/me/role-request$"),
]
USER_ACTIONS = CLIENT_ACTIONS  # alias for backwards compatibility

# Operator actions: prepare, upload and test data/models, run benchmarks
OPERATOR_ACTIONS = [
    ("POST", r"^/api/assets/datasets"),
    ("POST", r"^/api/assets/models"),
    ("POST", r"^/api/baselines"),
    ("POST", r"^/api/ml/train"),
    ("POST", r"^/api/benchmarks/runs"),
    ("POST", r"^/api/benchmarks/import/"),
    ("POST", r"^/api/benchmarks/attacks"),
    ("POST", r"^/api/workspace/test-packs/"),
]

# Admin actions for user management
ADMIN_ACTIONS = [
    ("PATCH", r"^/api/users/[^/]+$"),       # Edit any user (role, status, display_name)
    ("PATCH", r"^/api/auth/users/[^/]+$"),
]

ADMIN_READS = [r"^/api/auth/users", r"^/api/auth/requests"]

ROLE_LEVELS = {"client": 1, "operator": 2, "admin": 3}


def _ensure_patched():
    try:
        from . import middleware
        import anyio
        from ..config import settings
        from ..core.actor import set_actor, reset_actor

        if hasattr(middleware, "AuthMiddleware") and not getattr(middleware.AuthMiddleware, "_tejas_patched", False):
            middleware.AuthMiddleware._tejas_patched = True

            # lookup_user already enforces session + account status in a single query.
            async def patched_call(self, scope, receive, send):
                if scope["type"] not in ("http", "websocket"):
                    return await self.app(scope, receive, send)
                path = scope["path"]
                method = scope.get("method", "GET") if scope["type"] == "http" else "GET"
                need = "client" if scope["type"] == "websocket" else required_role(method, path)
                user = await anyio.to_thread.run_sync(middleware.lookup_user, middleware._token(scope))
                if not settings.auth_required:
                    need = "public"
                if need != "public":
                    if user is None:
                        return await self._deny(scope, receive, send, 401, "login required")
                    user_level = ROLE_LEVELS.get(user.get("role", "client"), 1)
                    need_level = ROLE_LEVELS.get(need, 1)
                    if user_level < need_level:
                        if need == "admin":
                            msg = "admin access required: operators and clients cannot approve models, access the attack lab or manage users"
                        elif need == "operator":
                            msg = "operator access required: clients can view and run assessments but cannot change data or models"
                        else:
                            msg = f"{need} access required"
                        return await self._deny(scope, receive, send, 403, msg)
                scope.setdefault("state", {})["user"] = user
                tok = set_actor(user["username"] if user else None)
                try:
                    await self.app(scope, receive, send)
                finally:
                    reset_actor(tok)
            middleware.AuthMiddleware.__call__ = patched_call
    except Exception:
        pass


def required_role(method: str, path: str) -> str:
    """'public' | 'client' | 'operator' | 'admin' for an HTTP request."""
    _ensure_patched()
    method = method.upper()
    if method == "OPTIONS" or (method, path) in PUBLIC:
        return "public"
    if not path.startswith("/api/"):
        return "public"
    if method in ("GET", "HEAD"):
        return "admin" if any(re.match(p, path) for p in ADMIN_READS) else "client"
    if any(m == method and re.match(p, path) for m, p in CLIENT_ACTIONS):
        return "client"
    if any(m == method and re.match(p, path) for m, p in OPERATOR_ACTIONS):
        return "operator"
    if any(m == method and re.match(p, path) for m, p in ADMIN_ACTIONS):
        return "admin"
    return "admin"
