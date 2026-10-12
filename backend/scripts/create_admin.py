"""Create an admin account (or reset an existing account's password and make it admin) from the
command line: the recovery path when nobody can log in. Needs access to the server's disk.

    python scripts/create_admin.py --username cmdr.admin
"""
from __future__ import annotations

import argparse
import getpass

from _common import init


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", required=True)
    ap.add_argument("--display-name", default="")
    a = ap.parse_args()
    init()
    from app.auth.security import USERNAME_RE, hash_password, password_problem
    from app.core.ledger import append_block
    from app.database import AuthSession, SessionLocal, User
    if not USERNAME_RE.match(a.username):
        print("[x] username: 3-32 characters, letters, digits, dot, dash or underscore")
        return 1
    pw = getpass.getpass("New password: ")
    if pw != getpass.getpass("Repeat password: "):
        print("[x] passwords differ")
        return 1
    problem = password_problem(pw, a.username)
    if problem:
        print(f"[x] {problem}")
        return 1
    with SessionLocal() as s:
        u = s.query(User).filter(User.username.ilike(a.username)).first()
        if u:
            u.password_hash, u.role, u.status, u.disabled, u.failed_logins, u.locked_until = hash_password(pw), "admin", "active", False, 0, None
            s.query(AuthSession).filter_by(user_id=u.id).update({"revoked": True})
            action = "reset to admin"
        else:
            u = User(username=a.username, display_name=a.display_name or a.username, role="admin", status="active",
                     password_hash=hash_password(pw), created_by="cli")
            s.add(u)
            action = "created"
        s.commit()
        append_block(s, "ADMIN_CLI", u.id, {"user_id": u.id, "username": u.username, "action": action})
    print(f"[+] Admin '{a.username}' {action}. Log in at the web UI.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
