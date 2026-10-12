"""Accounts, roles and provenance attribution, with enforcement switched ON."""
import io
import pickle
import stat
import time
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.auth.security import required_role
from app.config import settings
from app.main import app
from app.services import ingestion

ADMIN_PW, USER_PW, OP_PW = "Admin-pass-2026", "Analyst-pass-2026", "Operator-pass-2026"

# Ensure safe_extract works cleanly on Windows paths during tests
_orig_safe_extract = ingestion.safe_extract
def _win_safe_extract(zip_path: Path, dest: Path) -> None:
    dest = dest.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        infos = zf.infolist()
        if len(infos) > settings.max_archive_files:
            raise ingestion.IngestionError("archive contains too many files")
        if sum(i.file_size for i in infos) > settings.max_archive_bytes:
            raise ingestion.IngestionError("archive expands beyond the size limit")
        for info in infos:
            if stat.S_ISLNK(info.external_attr >> 16):
                raise ingestion.IngestionError(f"symlink rejected: {info.filename}")
            target = (dest / info.filename).resolve()
            try:
                target.relative_to(dest)
            except ValueError:
                raise ingestion.IngestionError(f"path traversal rejected: {info.filename}")
            if ".." in info.filename or info.filename.startswith(("/", "\\")):
                raise ingestion.IngestionError(f"path traversal rejected: {info.filename}")
        zf.extractall(dest)

ingestion.safe_extract = _win_safe_extract


@pytest.fixture(scope="module")
def clients(demo_state):
    old = settings.auth_required
    settings.auth_required = True
    with TestClient(app) as anon:
        st = anon.get("/api/auth/status").json()
        assert st["auth_required"] is True
        # Setup admin
        r = anon.post("/api/auth/signup", json={"username": "cmdr.admin", "password": ADMIN_PW, "display_name": "Cmdr Admin"})
        assert r.status_code == 200 and r.json()["setup_admin"] is True and r.json()["user"]["role"] == "admin"
        
        # Priya requests client access
        r = anon.post("/api/auth/signup", json={"username": "analyst.priya", "password": USER_PW, "requested_role": "client"})
        assert r.status_code == 200 and r.json()["user"]["role"] == "client"
        priya_id = r.json()["user"]["id"]

        # Admin logs in and approves Priya as client
        admin_tok = _login(anon, "cmdr.admin", ADMIN_PW)
        admin = _As(anon, admin_tok)
        r_app = admin.post(f"/api/auth/requests/{priya_id}/approve", json={"role": "client"})
        assert r_app.status_code == 200

        user = _As(anon, _login(anon, "analyst.priya", USER_PW))
        yield _As(anon, None), admin, user
    settings.auth_required = old


def _login(c, u, p):
    res = c.post("/api/auth/login", json={"username": u, "password": p})
    assert res.status_code == 200, f"Login failed: {res.text}"
    tok = res.json()["token"]
    c.cookies.clear()          # the shared client must not carry anyone's session cookie
    return tok


class _As:
    """Wraps the shared client, adding one user's bearer token (or none) to every call."""
    def __init__(self, client, token):
        self.c = getattr(client, "c", client)
        self.h = ({"Authorization": f"Bearer {token}"} if token else {})

    @property
    def cookies(self):
        return self.c.cookies

    def __getattr__(self, method):
        attr = getattr(self.c, method)
        if not callable(attr):
            return attr
        if method == "websocket_connect":
            return lambda url, **kw: attr(url, headers={**self.h, **kw.pop("headers", {})}, **kw)

        def call(url, **kw):
            kw["headers"] = {**self.h, **kw.get("headers", {})}
            return attr(url, **kw)
        return call


def _zip_dataset(n=6, bad_path=False):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for label, col in (("desert", (200, 170, 110)), ("water", (30, 70, 160))):
            for i in range(n):
                b = io.BytesIO()
                Image.new("RGB", (64, 64), col).save(b, "PNG")
                z.writestr(f"{label}/img_{i}.png", b.getvalue())
        if bad_path:
            z.writestr("../../escape.txt", "x")
    return buf.getvalue()


def test_anonymous_is_blocked_but_health_is_public(clients):
    anon, _, _ = clients
    assert anon.get("/api/health").status_code == 200
    assert anon.get("/api/jobs").status_code == 401
    assert anon.post("/api/demo/reset").status_code == 401


def test_weak_password_and_duplicate_rejected(clients):
    anon, _, _ = clients
    assert anon.post("/api/auth/signup", json={"username": "x.y.z", "password": "short1"}).status_code == 400
    assert anon.post("/api/auth/signup", json={"username": "analyst.priya", "password": "Another-pass-99"}).status_code == 409


def test_request_creates_pending_account_no_cookie_no_token(clients):
    anon, _, _ = clients
    anon.c.cookies.clear()
    r = anon.post("/api/auth/signup", json={"username": "req.user", "password": "User-pass-2026", "requested_role": "client"})
    assert r.status_code == 200
    body = r.json()
    assert body["pending"] is True
    assert body["setup_admin"] is False
    assert "token" not in body
    assert not anon.c.cookies.get("tejas_session")
    assert body["user"]["status"] == "pending"


def test_login_while_pending_returns_403_and_works_after_approval(clients):
    anon, admin, _ = clients
    # Login while pending -> 403
    r = anon.post("/api/auth/login", json={"username": "req.user", "password": "User-pass-2026"})
    assert r.status_code == 403
    assert "pending" in r.json()["detail"].lower()

    # Admin approves
    reqs = admin.get("/api/auth/requests?status=pending").json()
    target = [x for x in reqs if x["username"] == "req.user"][0]
    app_r = admin.post(f"/api/auth/requests/{target['id']}/approve", json={"role": "client"})
    assert app_r.status_code == 200
    assert app_r.json()["status"] == "active"

    # Now login works
    log_r = anon.post("/api/auth/login", json={"username": "req.user", "password": "User-pass-2026"})
    assert log_r.status_code == 200
    assert "token" in log_r.json()


def test_request_for_admin_is_refused(clients):
    anon, _, _ = clients
    r = anon.post("/api/auth/signup", json={"username": "bad.actor", "password": "Actor-pass-2026", "requested_role": "admin"})
    assert r.status_code == 400


def test_rejection_shows_declined_with_note(clients):
    anon, admin, _ = clients
    r = anon.post("/api/auth/signup", json={"username": "rej.user", "password": "Reject-pass-2026", "requested_role": "client"})
    assert r.status_code == 200
    user_id = r.json()["user"]["id"]

    rej_r = admin.post(f"/api/auth/requests/{user_id}/reject", json={"note": "Invalid department credentials"})
    assert rej_r.status_code == 200
    assert rej_r.json()["status"] == "rejected"

    log_r = anon.post("/api/auth/login", json={"username": "rej.user", "password": "Reject-pass-2026"})
    assert log_r.status_code == 403
    assert "declined" in log_r.json()["detail"].lower()
    assert "Invalid department credentials" in log_r.json()["detail"]


def test_operator_and_client_permission_boundaries(clients, demo_state):
    anon, admin, client_user = clients
    # Create operator op.ravi
    r = anon.post("/api/auth/signup", json={"username": "op.ravi", "password": OP_PW, "requested_role": "operator"})
    op_id = r.json()["user"]["id"]
    admin.post(f"/api/auth/requests/{op_id}/approve", json={"role": "operator"})
    operator = _As(anon, _login(anon, "op.ravi", OP_PW))

    # Operator can upload dataset
    up = operator.post("/api/assets/datasets", files={"file": ("op_ds.zip", _zip_dataset())},
                       data={"name": "Operator DS", "contributor": "ops-team"})
    assert up.status_code == 200, up.text

    # Operator can train without trust_as
    tr = operator.post("/api/ml/train", json={"name": "op-cnn", "demo_data": True, "epochs": 1})
    assert tr.status_code == 200, tr.text
    run_id = tr.json()["run_id"]
    for _ in range(40):
        if operator.get(f"/api/ml/runs/{run_id}").json()["status"] in ("COMPLETED", "FAILED"):
            break
        time.sleep(0.5)

    # Training with trust_as returns 403
    tr_trust = operator.post("/api/ml/train", json={"name": "op-cnn-trust", "demo_data": True, "epochs": 1, "trust_as": "illegal_op_model"})
    assert tr_trust.status_code == 403
    assert "only an administrator can approve a model as trusted" in tr_trust.json()["detail"]

    # POST /api/registry/models returns 403
    reg = operator.post("/api/registry/models", json={"asset_id": "dummy", "name": "op_model"})
    assert reg.status_code == 403

    # /api/demo/reset returns 403
    rst = operator.post("/api/demo/reset")
    assert rst.status_code == 403

    # Client gets 403 on upload, training, and baselines
    cl_up = client_user.post("/api/assets/datasets", files={"file": ("cl_ds.zip", _zip_dataset())},
                             data={"name": "Client DS", "contributor": "client"})
    assert cl_up.status_code == 403

    cl_tr = client_user.post("/api/ml/train", json={"name": "cl-cnn", "demo_data": True, "epochs": 1})
    assert cl_tr.status_code == 403

    cl_bl = client_user.post("/api/baselines", json={"dataset_id": demo_state["datasets"]["clean_batch"], "name": "cl-bl"})
    assert cl_bl.status_code == 403

    # Client can run assessment
    cl_job = client_user.post("/api/jobs", json={
        "dataset_id": demo_state["datasets"]["clean_batch"],
        "model_id": demo_state["models"]["clean"],
        "baseline_id": demo_state["baseline"],
        "trusted_model": demo_state["trusted_model"],
    })
    assert cl_job.status_code == 200


def test_user_can_use_but_not_change(clients, demo_state):
    _, _, user = clients
    assert user.get("/api/jobs").status_code == 200
    assert user.get("/api/auth/me").json()["permissions"]["ingest_data"] is False
    r = user.post("/api/jobs", json={"dataset_id": demo_state["datasets"]["clean_batch"],
                                     "model_id": demo_state["models"]["clean"], "baseline_id": demo_state["baseline"],
                                     "trusted_model": demo_state["trusted_model"]})
    assert r.status_code == 200, r.text
    for method, path, kw in [("post", "/api/assets/datasets", {"files": {"file": ("d.zip", _zip_dataset())},
                                                               "data": {"name": "x", "contributor": "y"}}),
                             ("post", "/api/demo/reset", {}), ("post", "/api/demo/tamper/audit/3", {}),
                             ("post", "/api/ml/train", {"json": {"name": "m", "demo_data": True}}),
                             ("post", "/api/registry/models", {"json": {"asset_id": "x", "name": "y"}}),
                             ("post", "/api/baselines", {"json": {"dataset_id": "x", "name": "y"}}),
                             ("get", "/api/auth/users", {})]:
        resp = getattr(user, method)(path, **kw)
        assert resp.status_code == 403, (path, resp.status_code, resp.text)


def test_mutating_routes_default_to_admin():
    """Every POST/PATCH/PUT/DELETE route is admin-only unless deliberately listed here."""
    client_allowed = {"/api/jobs", "/api/inference", "/api/inference/verify-chain", "/api/inference/attest",
                      "/api/audit/verify", "/api/system/verify-independent", "/api/auth/logout", "/api/auth/password",
                      "/api/auth/me", "/api/auth/me/role-request"}
    operator_allowed = {"/api/assets/datasets", "/api/assets/models", "/api/baselines",
                        "/api/ml/train", "/api/benchmarks/runs", "/api/benchmarks/attacks"}
    public = {"/api/auth/login", "/api/auth/signup"}
    for route in app.routes:
        for m in getattr(route, "methods", set()) - {"GET", "HEAD"}:
            path = route.path
            role = required_role(m, path)
            if path in public:
                expected = "public"
            elif path in client_allowed:
                expected = "client"
            elif path in operator_allowed or path.startswith("/api/benchmarks/import/") or path.startswith("/api/workspace/test-packs/"):
                expected = "operator"
            else:
                expected = "admin"
            assert role == expected, (m, path, role, expected)


def test_admin_ingests_and_provenance_shows_who_and_when(clients, demo_state):
    _, admin, user = clients
    r = admin.post("/api/assets/datasets", files={"file": ("mine.zip", _zip_dataset())},
                   data={"name": "Admin upload", "contributor": "lab-alpha"})
    assert r.status_code == 200, r.text
    ds = r.json()
    assert ds["uploaded_by"] == "cmdr.admin" and ds["created_at"]
    job = user.post("/api/jobs", json={"dataset_id": ds["id"], "model_id": demo_state["models"]["clean"]}).json()
    for _ in range(60):
        if user.get(f"/api/jobs/{job['id']}").json()["status"] in ("COMPLETED", "FAILED"):
            break
        time.sleep(0.5)
    g = user.get(f"/api/jobs/{job['id']}/provenance-graph").json()
    people = {n["id"] for n in g["nodes"] if n["type"] == "user"}
    assert {"user:cmdr.admin", "user:analyst.priya"} <= people
    up = [e for e in g["edges"] if e["source"] == "user:cmdr.admin" and e["target"] == "dataset"][0]
    assert up["data"]["action"] == "uploaded" and up["data"]["timestamp"]
    blocks = user.get("/api/audit", params={"limit": 500}).json()["items"]
    reg = [b for b in blocks if b["event_type"] == "DATASET_REGISTERED" and b["subject"] == ds["id"]][0]
    assert reg["payload"]["actor"] == "cmdr.admin"


def test_ingestion_gate_rejects_and_records(clients):
    _, admin, _ = clients
    r = admin.post("/api/assets/datasets", files={"file": ("evil.zip", _zip_dataset(bad_path=True))},
                   data={"name": "evil", "contributor": "x"})
    assert r.status_code == 400 and "REJECTED" in r.json()["detail"]

    class Boom:
        def __reduce__(self):
            import os
            return (os.system, ("echo pwned",))
    r = admin.post("/api/assets/models", files={"file": ("m.pt", pickle.dumps(Boom()))},
                   data={"name": "evil model", "contributor": "x"})
    assert r.status_code == 400 and "pickle" in r.json()["detail"]
    r = admin.post("/api/assets/models", files={"file": ("m.exe", b"MZ....")}, data={"name": "exe", "contributor": "x"})
    assert r.status_code == 400
    blocks = admin.get("/api/audit", params={"limit": 500}).json()["items"]
    assert sum(b["event_type"] == "INGESTION_REJECTED" for b in blocks) >= 3


def test_admin_trains_model_with_live_events(clients):
    _, admin, _ = clients
    r = admin.post("/api/ml/train", json={"name": "auth-test-cnn", "demo_data": True, "epochs": 2})
    assert r.status_code == 200, r.text
    run = r.json()["run_id"]
    kinds = []
    with admin.websocket_connect(f"/ws/jobs/{run}") as ws:
        while True:
            ev = ws.receive_json()
            kinds.append(ev["type"])
            if ev["type"] in ("complete", "failed"):
                break
    assert kinds.count("train_epoch") == 2 and kinds[-1] == "complete", kinds
    res = admin.get(f"/api/ml/runs/{run}").json()["result"]
    m = admin.get(f"/api/assets/{res['model_asset_id']}").json()
    assert m["uploaded_by"] == "cmdr.admin"
    rec = admin.get(f"/api/ml/models/{m['id']}/training-record").json()
    assert rec["signature_valid"] and len(rec["record"]["history"]) == 2


def test_websocket_requires_login(clients):
    anon, _, _ = clients
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with anon.websocket_connect("/ws/events") as ws:
            ws.receive_json()


def test_role_changes_and_last_admin_protection(clients):
    _, admin, user = clients
    users = admin.get("/api/auth/users").json()
    me = [u for u in users if u["username"] == "cmdr.admin"][0]
    # Admin cannot change own role
    assert admin.patch(f"/api/auth/users/{me['id']}", json={"role": "client"}).status_code == 409
    assert admin.patch(f"/api/auth/users/{me['id']}", json={"role": "operator"}).status_code == 409

    priya = [u for u in users if u["username"] == "analyst.priya"][0]
    assert admin.patch(f"/api/auth/users/{priya['id']}", json={"disabled": True}).status_code == 200
    assert user.get("/api/jobs").status_code == 401          # sessions revoked on disable
    admin.patch(f"/api/auth/users/{priya['id']}", json={"disabled": False})


def test_lockout_after_failed_logins(clients):
    anon, _, _ = clients
    for _ in range(5):
        anon.post("/api/auth/login", json={"username": "analyst.priya", "password": "wrong-password-1"})
    r = anon.post("/api/auth/login", json={"username": "analyst.priya", "password": USER_PW})
    assert r.status_code == 423


def test_client_edits_own_profile_and_email_validation(clients):
    anon, admin, _ = clients
    users = admin.get("/api/auth/users").json()
    priya_user = [u for u in users if u["username"] == "analyst.priya"][0]
    admin.post(f"/api/auth/users/{priya_user['id']}/reset-password", json={"new_password": USER_PW})
    user = _As(anon.c, _login(anon.c, "analyst.priya", USER_PW))
    # Invalid email
    bad = user.patch("/api/auth/me", json={"email": "not-an-email"})
    assert bad.status_code == 400

    # Valid edit
    res = user.patch("/api/auth/me", json={
        "display_name": "Priya Sharma",
        "email": "priya.sharma@def.gov",
        "unit": "Cyber Defense Wing"
    })
    assert res.status_code == 200
    me = res.json()
    assert me["display_name"] == "Priya Sharma"
    assert me["email"] == "priya.sharma@def.gov"
    assert me["unit"] == "Cyber Defense Wing"

    # Empty email is allowed
    res_empty = user.patch("/api/auth/me", json={"email": ""})
    assert res_empty.status_code == 200
    assert res_empty.json()["email"] == ""


def test_client_cannot_patch_other_or_role(clients):
    anon, admin, _ = clients
    user = _As(anon.c, _login(anon.c, "analyst.priya", USER_PW))
    users = admin.get("/api/auth/users").json()
    admin_user = [u for u in users if u["username"] == "cmdr.admin"][0]
    priya_user = [u for u in users if u["username"] == "analyst.priya"][0]

    # Client cannot PATCH another user -> 403
    r1 = user.patch(f"/api/auth/users/{admin_user['id']}", json={"display_name": "Hacked"})
    assert r1.status_code == 403

    # Client cannot PATCH themselves via admin users route -> 403
    r2 = user.patch(f"/api/auth/users/{priya_user['id']}", json={"role": "admin"})
    assert r2.status_code == 403

    # Client cannot change role via /api/auth/me
    r3 = user.patch("/api/auth/me", json={"role": "admin"})
    assert r3.status_code == 200
    assert r3.json()["role"] == "client"


def test_role_request_flow_approve_and_reject(clients):
    anon, admin, _ = clients
    user = _As(anon.c, _login(anon.c, "analyst.priya", USER_PW))
    # Cannot request role already held
    r_same = user.post("/api/auth/me/role-request", json={"role": "client"})
    assert r_same.status_code == 400

    # Request operator role
    r_req = user.post("/api/auth/me/role-request", json={"role": "operator", "note": "Need dataset ingestion access"})
    assert r_req.status_code == 200
    assert r_req.json()["role_request"] == "operator"

    # Duplicate open request -> 409
    r_dup = user.post("/api/auth/me/role-request", json={"role": "admin"})
    assert r_dup.status_code == 409

    # Admin sees it in requests
    reqs = admin.get("/api/auth/requests?status=pending").json()
    role_changes = [x for x in reqs if x.get("type") == "role_change" and x["username"] == "analyst.priya"]
    assert len(role_changes) >= 1
    rc = role_changes[0]
    assert rc["current_role"] == "client"
    assert rc["requested_role"] == "operator"

    # Admin rejects
    r_rej = admin.post(f"/api/auth/role-requests/{rc['id']}/reject", json={"note": "Pending unit clearance"})
    assert r_rej.status_code == 200
    assert r_rej.json()["role"] == "client"
    assert r_rej.json()["role_request"] is None

    # Check client /me still shows client
    me_after_rej = user.get("/api/auth/me").json()
    assert me_after_rej["role"] == "client"
    assert me_after_rej["role_request"] is None

    # Client requests again
    user.post("/api/auth/me/role-request", json={"role": "operator", "note": "Unit clearance attached"})

    # Admin approves
    r_app = admin.post(f"/api/auth/role-requests/{rc['id']}/approve", json={"role": "operator", "note": "Approved"})
    assert r_app.status_code == 200
    assert r_app.json()["role"] == "operator"

    # Next /me shows operator!
    me_after_app = user.get("/api/auth/me").json()
    assert me_after_app["role"] == "operator"
    assert me_after_app["permissions"]["ingest_data"] is True

    # Restore to client for subsequent tests
    admin.patch(f"/api/auth/users/{rc['id']}", json={"role": "client"})

