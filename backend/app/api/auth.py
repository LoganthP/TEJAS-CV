"""Accounts: sign-up, login, logout, and admin access management.

Roles
  admin    : everything (ingest, train, approve models, baselines, attack lab, benchmarks, users)
  operator : prepare, ingest, upload and train models, build baselines, run benchmarks
  client   : use the platform: view dashboards, evidence, ledger, run assessments and inference,
             verify the ledger. Cannot ingest, train, approve, tamper, reset or manage users.

The first account ever created becomes the admin (setup mode). After that, self sign-up
creates a pending request; an administrator must approve it and assign a role.
"""
from __future__ import annotations

import re
from datetime import timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.security import (COOKIE, LOCK_MINUTES, MAX_FAILED, SESSION_HOURS, USERNAME_RE, aware, expiry,
                             hash_password, new_token, now, password_problem, token_hash, verify_password)
from ..config import settings
from ..core.actor import acting_as
from ..core.ledger import append_block
from ..database import AuthSession, User, get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(val: Optional[str]) -> str | None:
    if val is None:
        return None
    val = val.strip()
    if not val:
        return ""
    if not EMAIL_RE.match(val):
        raise HTTPException(400, "invalid email address format")
    return val


class SignupIn(BaseModel):
    username: str = Field(..., examples=["analyst.priya"])
    password: str
    display_name: str = ""
    requested_role: Optional[str] = "client"
    note: Optional[str] = None


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


class CreateUserIn(SignupIn):
    role: Literal["admin", "operator", "client", "user"] = "client"


class UpdateUserIn(BaseModel):
    role: Optional[Literal["admin", "operator", "client", "user"]] = None
    disabled: Optional[bool] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    unit: Optional[str] = None


class ResetPasswordIn(BaseModel):
    new_password: str


class ApproveRequestIn(BaseModel):
    role: Literal["admin", "operator", "client"] = "client"
    note: Optional[str] = None


class RejectRequestIn(BaseModel):
    note: Optional[str] = None


class RoleRequestIn(BaseModel):
    role: Literal["admin", "operator", "client"]
    note: Optional[str] = None


class RoleChangeDecisionIn(BaseModel):
    role: Optional[Literal["admin", "operator", "client"]] = None
    note: Optional[str] = None


def public_user(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "display_name": u.display_name or u.username,
        "role": u.role,
        "status": getattr(u, "status", "active") or "active",
        "requested_role": getattr(u, "requested_role", None),
        "request_note": getattr(u, "request_note", None),
        "reviewed_by": getattr(u, "reviewed_by", None),
        "reviewed_at": u.reviewed_at.isoformat() if getattr(u, "reviewed_at", None) else None,
        "review_note": getattr(u, "review_note", None),
        "email": getattr(u, "email", None),
        "unit": getattr(u, "unit", None),
        "role_request": getattr(u, "role_request", None),
        "role_request_note": getattr(u, "role_request_note", None),
        "role_request_at": u.role_request_at.isoformat() if getattr(u, "role_request_at", None) else None,
        "disabled": u.disabled,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "created_by": u.created_by,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        "permissions": permissions(u.role),
    }


def permissions(role: str) -> dict:
    is_admin = role == "admin"
    is_operator = role in ("admin", "operator")
    return {
        "view": True,
        "run_assessments": True,
        "run_inference": True,
        "verify": True,
        "ingest_data": is_operator,
        "upload_models": is_operator,
        "build_baselines": is_operator,
        "train_models": is_operator,
        "benchmarks": is_operator,
        "approve_models": is_admin,
        "attack_lab": is_admin,
        "register_contributors": is_admin,
        "manage_users": is_admin,
    }


def current_user(request: Request) -> dict:
    u = (request.scope.get("state") or {}).get("user")
    if u is None:
        raise HTTPException(401, "login required")
    return u


def _validate(db: Session, body: SignupIn) -> None:
    if not USERNAME_RE.match(body.username):
        raise HTTPException(400, "username: 3-32 characters, letters, digits, dot, dash or underscore")
    if db.query(User).filter(User.username.ilike(body.username)).first():
        raise HTTPException(409, "that username is taken")
    problem = password_problem(body.password, body.username)
    if problem:
        raise HTTPException(400, problem)


def _admins(db: Session) -> int:
    return db.query(User).filter_by(role="admin", disabled=False).count()


@router.get("/status", summary="Is setup needed? Is auth enforced?")
def auth_status(request: Request, db: Session = Depends(get_db)):
    return {
        "auth_required": settings.auth_required,
        "setup_required": db.query(User).count() == 0,
        "self_signup": True,
        "user": (request.scope.get("state") or {}).get("user"),
    }


@router.post("/signup", summary="Create an account / request access (first account becomes the admin)")
def signup(body: SignupIn, db: Session = Depends(get_db)):
    if db.get_bind().dialect.name == "postgresql":
        # Only one concurrent signup may become the initial administrator.
        from sqlalchemy import text
        db.execute(text("SELECT pg_advisory_xact_lock(74219004)"))
    if body.requested_role == "admin":
        raise HTTPException(400, "cannot request admin role; only an administrator can assign admin privileges")
    if body.requested_role and body.requested_role not in ("operator", "client", "user"):
        raise HTTPException(400, "requested role must be operator or client")

    _validate(db, body)
    first = db.query(User).count() == 0

    if first:
        u = User(
            username=body.username,
            display_name=body.display_name or body.username,
            role="admin",
            status="active",
            password_hash=hash_password(body.password),
            created_by="setup",
        )
        db.add(u)
        db.commit()
        with acting_as(u.username):
            append_block(db, "USER_CREATED", u.id, {
                "user_id": u.id, "username": u.username, "role": u.role, "via": "setup"
            })
        return {"user": public_user(u), "setup_admin": True, "pending": False}
    else:
        req_role = "client" if body.requested_role in (None, "client", "user") else "operator"
        u = User(
            username=body.username,
            display_name=body.display_name or body.username,
            role="client",
            status="pending",
            requested_role=req_role,
            request_note=body.note,
            password_hash=hash_password(body.password),
            created_by="self-signup",
        )
        db.add(u)
        db.commit()
        with acting_as(u.username):
            append_block(db, "ACCESS_REQUESTED", u.id, {
                "user_id": u.id, "username": u.username, "requested_role": req_role, "note": body.note
            })
        return {"user": public_user(u), "setup_admin": False, "pending": True}


@router.post("/login", summary="Log in; sets an HttpOnly session cookie and returns a bearer token")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.username.ilike(body.username)).first()
    generic = HTTPException(401, "invalid username or password")
    if u is None:
        verify_password(body.password, hash_password("timing-equaliser-1"))   # same cost as a real check
        raise generic
    if u.disabled:
        raise HTTPException(403, "this account is disabled; contact an administrator")

    user_status = getattr(u, "status", "active") or "active"
    if user_status == "pending":
        raise HTTPException(403, "access request pending administrator approval")
    if user_status == "rejected":
        msg = f"access request was declined: {u.review_note}" if getattr(u, "review_note", None) else "access request was declined"
        raise HTTPException(403, msg)

    if u.locked_until and aware(u.locked_until) > now():
        mins = max(1, int((aware(u.locked_until) - now()).total_seconds() // 60) + 1)
        raise HTTPException(423, f"too many failed attempts; try again in {mins} minute(s)")
    if not verify_password(body.password, u.password_hash):
        u.failed_logins += 1
        if u.failed_logins >= MAX_FAILED:
            u.locked_until = now() + timedelta(minutes=LOCK_MINUTES)
            u.failed_logins = 0
            db.commit()
            with acting_as(u.username):
                append_block(db, "ACCOUNT_LOCKED", u.id, {"user_id": u.id, "reason": f"{MAX_FAILED} failed logins"})
            raise HTTPException(423, f"too many failed attempts; locked for {LOCK_MINUTES} minutes")
        db.commit()
        raise generic
    u.failed_logins, u.locked_until, u.last_login_at = 0, None, now()
    tok, h = new_token()
    db.add(AuthSession(token_sha256=h, user_id=u.id, expires_at=expiry()))
    db.commit()
    https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").startswith("https")
    response.set_cookie(COOKIE, tok, httponly=True, secure=https,
                        samesite="strict", max_age=SESSION_HOURS * 3600, path="/")
    return {"token": tok, "expires_in": SESSION_HOURS * 3600, "user": public_user(u)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    from ..auth.middleware import _token
    tok = _token(request.scope)
    if tok:
        s = db.get(AuthSession, token_hash(tok))
        if s:
            s.revoked = True
            db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    u = db.get(User, current_user(request)["id"])
    return public_user(u)


class EditProfileIn(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None
    unit: Optional[str] = None


@router.patch("/me", summary="Edit your own profile (display name, email, unit)")
def edit_profile(body: EditProfileIn, request: Request, db: Session = Depends(get_db)):
    u = db.get(User, current_user(request)["id"])
    if u is None:
        raise HTTPException(404, "user not found")
    changes = {}
    if body.display_name is not None:
        val = body.display_name.strip()
        if not (1 <= len(val) <= 64):
            raise HTTPException(400, "display name must be 1-64 characters")
        if val != u.display_name:
            changes["display_name"] = [u.display_name, val]
            u.display_name = val
    if body.email is not None:
        val = _validate_email(body.email)
        if val != u.email:
            changes["email"] = [u.email, val]
            u.email = val
    if body.unit is not None:
        val = body.unit.strip()
        if len(val) > 64:
            raise HTTPException(400, "unit must be 64 characters or fewer")
        if val != u.unit:
            changes["unit"] = [u.unit, val]
            u.unit = val
    db.commit()
    db.refresh(u)
    if changes:
        with acting_as(u.username):
            append_block(db, "PROFILE_UPDATED", u.id, {
                "user_id": u.id, "username": u.username, "changes": changes
            })
    return public_user(u)


@router.post("/me/role-request", summary="Request a role change")
def request_role_change(body: RoleRequestIn, request: Request, db: Session = Depends(get_db)):
    u = db.get(User, current_user(request)["id"])
    if u is None:
        raise HTTPException(404, "user not found")
    if body.role == u.role:
        raise HTTPException(400, f"cannot request the role you already hold ({u.role})")
    if getattr(u, "role_request", None):
        raise HTTPException(409, "you already have an open role change request")
    u.role_request = body.role
    u.role_request_note = body.note
    u.role_request_at = now()
    db.commit()
    with acting_as(u.username):
        append_block(db, "ROLE_CHANGE_REQUESTED", u.id, {
            "user_id": u.id,
            "username": u.username,
            "current_role": u.role,
            "requested_role": body.role,
            "note": body.note,
        })
    return public_user(u)


@router.delete("/me/role-request", summary="Withdraw your open role change request")
def cancel_role_request(request: Request, db: Session = Depends(get_db)):
    u = db.get(User, current_user(request)["id"])
    if u is None:
        raise HTTPException(404, "user not found")
    if not getattr(u, "role_request", None):
        raise HTTPException(400, "no open role request to withdraw")
    req_role = u.role_request
    u.role_request = None
    u.role_request_note = None
    u.role_request_at = None
    db.commit()
    with acting_as(u.username):
        append_block(db, "ROLE_CHANGE_WITHDRAWN", u.id, {
            "user_id": u.id, "username": u.username, "requested_role": req_role,
        })
    return public_user(u)


@router.post("/password", summary="Change your own password (ends your other sessions)")
def change_password(body: PasswordIn, request: Request, db: Session = Depends(get_db)):
    u = db.get(User, current_user(request)["id"])
    if not verify_password(body.current_password, u.password_hash):
        raise HTTPException(400, "current password is wrong")
    problem = password_problem(body.new_password, u.username)
    if problem:
        raise HTTPException(400, problem)
    u.password_hash = hash_password(body.new_password)
    db.query(AuthSession).filter_by(user_id=u.id).update({"revoked": True})
    db.commit()
    append_block(db, "PASSWORD_CHANGED", u.id, {"user_id": u.id})
    return {"ok": True, "note": "log in again with the new password"}


# ----------------------------------------------------------------------------- admin only
@router.get("/requests", summary="(admin) list access and role-change requests")
def list_requests(status: Optional[str] = "pending", db: Session = Depends(get_db)):
    q_access = db.query(User)
    if status:
        q_access = q_access.filter(User.status == status)
    access_users = q_access.order_by(User.created_at.desc()).all()

    results = []
    for u in access_users:
        item = public_user(u)
        item.update({
            "type": "access",
            "current_role": None,
            "requested_role": u.requested_role or "client",
            "note": u.request_note,
            "requested_at": u.created_at.isoformat() if u.created_at else None,
        })
        results.append(item)

    if status in (None, "pending"):
        role_reqs = db.query(User).filter(
            User.status == "active",
            User.role_request.isnot(None),
            User.role_request != ""
        ).order_by(User.role_request_at.desc()).all()
        for u in role_reqs:
            item = public_user(u)
            item.update({
                "type": "role_change",
                "current_role": u.role,
                "requested_role": u.role_request,
                "note": u.role_request_note,
                "requested_at": u.role_request_at.isoformat() if u.role_request_at else (u.created_at.isoformat() if u.created_at else None),
            })
            results.append(item)

    results.sort(key=lambda x: x.get("requested_at") or "", reverse=True)
    return results


@router.post("/requests/{user_id}/approve", summary="(admin) approve an access request")
def approve_request(user_id: str, body: ApproveRequestIn, request: Request, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    if getattr(u, "status", "active") != "pending":
        raise HTTPException(400, "only pending requests can be approved")
    admin_name = current_user(request)["username"]
    u.status = "active"
    u.role = body.role
    u.reviewed_by = admin_name
    u.reviewed_at = now()
    u.review_note = body.note
    db.commit()
    append_block(db, "ACCESS_APPROVED", u.id, {
        "user_id": u.id,
        "username": u.username,
        "role": u.role,
        "requested_role": u.requested_role,
        "reviewer": admin_name,
        "note": body.note,
    })
    return public_user(u)


@router.post("/requests/{user_id}/reject", summary="(admin) reject an access request")
def reject_request(user_id: str, body: RejectRequestIn, request: Request, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    if getattr(u, "status", "active") != "pending":
        raise HTTPException(400, "only pending requests can be rejected")
    admin_name = current_user(request)["username"]
    u.status = "rejected"
    u.reviewed_by = admin_name
    u.reviewed_at = now()
    u.review_note = body.note
    db.commit()
    append_block(db, "ACCESS_REJECTED", u.id, {
        "user_id": u.id,
        "username": u.username,
        "requested_role": u.requested_role,
        "reviewer": admin_name,
        "note": body.note,
    })
    return public_user(u)


@router.post("/role-requests/{user_id}/approve", summary="(admin) approve a role change request")
def approve_role_request(user_id: str, body: Optional[RoleChangeDecisionIn] = None, request: Request = None, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    if not getattr(u, "role_request", None):
        raise HTTPException(400, "user does not have an open role change request")
    admin_name = current_user(request)["username"]
    granted_role = (body.role if (body and body.role) else u.role_request)
    if granted_role not in ("admin", "operator", "client"):
        raise HTTPException(400, "invalid role specified")
    old_role = u.role
    requested_role = u.role_request
    note = body.note if body else None

    u.role = granted_role
    u.role_request = None
    u.role_request_note = None
    u.role_request_at = None
    db.commit()
    with acting_as(admin_name):
        append_block(db, "ROLE_CHANGE_APPROVED", u.id, {
            "user_id": u.id,
            "username": u.username,
            "old_role": old_role,
            "new_role": granted_role,
            "requested_role": requested_role,
            "admin": admin_name,
            "note": note,
        })
    return public_user(u)


@router.post("/role-requests/{user_id}/reject", summary="(admin) reject a role change request")
def reject_role_request(user_id: str, body: Optional[RoleChangeDecisionIn] = None, request: Request = None, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    if not getattr(u, "role_request", None):
        raise HTTPException(400, "user does not have an open role change request")
    admin_name = current_user(request)["username"]
    requested_role = u.role_request
    note = body.note if body else None

    u.role_request = None
    u.role_request_note = None
    u.role_request_at = None
    db.commit()
    with acting_as(admin_name):
        append_block(db, "ROLE_CHANGE_REJECTED", u.id, {
            "user_id": u.id,
            "username": u.username,
            "current_role": u.role,
            "requested_role": requested_role,
            "admin": admin_name,
            "note": note,
        })
    return public_user(u)


@router.get("/users", summary="(admin) list accounts")
def list_users(db: Session = Depends(get_db)):
    return [public_user(u) for u in db.query(User).order_by(User.created_at)]


@router.post("/users", summary="(admin) create an account with a role")
def create_user(body: CreateUserIn, request: Request, db: Session = Depends(get_db)):
    _validate(db, body)
    role = "client" if body.role == "user" else body.role
    u = User(
        username=body.username,
        display_name=body.display_name or body.username,
        role=role,
        status="active",
        password_hash=hash_password(body.password),
        created_by=current_user(request)["username"],
    )
    db.add(u)
    db.commit()
    append_block(db, "USER_CREATED", u.id, {"user_id": u.id, "username": u.username, "role": u.role, "via": "admin"})
    return public_user(u)


@router.patch("/users/{user_id}", summary="(admin) change role, enable/disable, rename, email, unit")
def update_user(user_id: str, body: UpdateUserIn, request: Request, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    me_ = current_user(request)
    new_role = "client" if body.role == "user" else body.role

    # Rule: An admin cannot change their own role
    if u.id == me_["id"] and new_role is not None and new_role != u.role:
        raise HTTPException(409, "an administrator cannot change their own role")

    removing_admin = u.role == "admin" and not u.disabled and ((new_role is not None and new_role != "admin") or body.disabled)
    if removing_admin and _admins(db) <= 1:
        raise HTTPException(409, "cannot demote or disable the last active admin")
    if u.id == me_["id"] and body.disabled:
        raise HTTPException(409, "you cannot disable your own account")

    changes = {}
    if new_role and new_role != u.role:
        changes["role"] = [u.role, new_role]
        u.role = new_role
    if body.disabled is not None and body.disabled != u.disabled:
        changes["disabled"] = [u.disabled, body.disabled]
        u.disabled = body.disabled
        if body.disabled:
            db.query(AuthSession).filter_by(user_id=u.id).update({"revoked": True})
    if body.display_name is not None:
        name = body.display_name.strip()
        if not (1 <= len(name) <= 64):
            raise HTTPException(400, "display name must be 1-64 characters")
        if name != u.display_name:
            changes["display_name"] = [u.display_name, name]
            u.display_name = name
    if body.email is not None:
        v_email = _validate_email(body.email)
        if v_email != u.email:
            changes["email"] = [u.email, v_email]
            u.email = v_email
    if body.unit is not None:
        unit = body.unit.strip()
        if len(unit) > 64:
            raise HTTPException(400, "unit must be 64 characters or fewer")
        if unit != u.unit:
            changes["unit"] = [u.unit, unit]
            u.unit = unit

    db.commit()
    if changes:
        append_block(db, "USER_UPDATED", u.id, {"user_id": u.id, "username": u.username, "changes": changes, "actor": me_["username"]})
    return public_user(u)


@router.post("/users/{user_id}/reset-password", summary="(admin) set a new password; ends that user's sessions")
def reset_password(user_id: str, body: ResetPasswordIn, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    problem = password_problem(body.new_password, u.username)
    if problem:
        raise HTTPException(400, problem)
    u.password_hash, u.failed_logins, u.locked_until = hash_password(body.new_password), 0, None
    db.query(AuthSession).filter_by(user_id=u.id).update({"revoked": True})
    db.commit()
    append_block(db, "PASSWORD_RESET", u.id, {"user_id": u.id, "username": u.username})
    return {"ok": True}
