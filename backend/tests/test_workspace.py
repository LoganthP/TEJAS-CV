import io
import json
import zipfile
from pathlib import Path
from PIL import Image
import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password
from app.config import settings
from app.database import Asset, SessionLocal, User, utcnow
from app.main import app


class _As:
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
        def call(url, **kw):
            kw["headers"] = {**self.h, **kw.get("headers", {})}
            return attr(url, **kw)
        return call


@pytest.fixture(scope="module")
def ws_users(demo_state):
    old = settings.auth_required
    settings.auth_required = True
    with SessionLocal() as s:
        op = s.query(User).filter_by(username="ws_op").first()
        if not op:
            op = User(id="user_ws_op", username="ws_op", password_hash=hash_password("Operator-pass-2026"),
                      role="operator", status="active", display_name="WS Operator", created_at=utcnow())
            s.add(op)
        cl = s.query(User).filter_by(username="ws_client_user").first()
        if not cl:
            cl = User(id="user_ws_cl", username="ws_client_user", password_hash=hash_password("Client-pass-2026"),
                      role="client", status="active", display_name="WS Client", created_at=utcnow())
            s.add(cl)
        s.commit()

    with TestClient(app) as c:
        res_op = c.post("/api/auth/login", json={"username": "ws_op", "password": "Operator-pass-2026"})
        assert res_op.status_code == 200, res_op.text
        tok_op = res_op.json()["token"]

        res_cl = c.post("/api/auth/login", json={"username": "ws_client_user", "password": "Client-pass-2026"})
        assert res_cl.status_code == 200, res_cl.text
        tok_cl = res_cl.json()["token"]

        yield _As(c, tok_op), _As(c, tok_cl)
    settings.auth_required = old


def test_system_status_limits(ws_users):
    ws_op, _ = ws_users
    r = ws_op.get("/api/system/status")
    assert r.status_code == 200
    st = r.json()
    assert "limits" in st
    limits = st["limits"]
    assert "max_archive_bytes" in limits
    assert "max_files" in limits
    assert "max_analysis_samples" in limits
    assert "accepted_image_types" in limits
    assert isinstance(limits["accepted_image_types"], list)
    assert ".png" in limits["accepted_image_types"]


def test_test_packs_listing_and_ingest(ws_users, tmp_path):
    ws_op, ws_cl = ws_users
    # Test listing when pack directory exists
    pack_dir = settings.home / "test_packs" / "small"
    pack_dir.mkdir(parents=True, exist_ok=True)
    datasets_dir = pack_dir / "datasets"
    datasets_dir.mkdir(parents=True, exist_ok=True)

    # Create dummy images and zip
    zip_path = datasets_dir / "acc_clean_signed.zip"
    with zipfile.ZipFile(zip_path, "w") as z:
        for i in range(4):
            buf = io.BytesIO()
            Image.new("RGB", (32, 32), color=(i * 20, 100, 100)).save(buf, "PNG")
            z.writestr(f"class_a/img_{i}.png", buf.getvalue())

    # Create a rejection zip (no images)
    rej_zip_path = datasets_dir / "rej_no_images.zip"
    with zipfile.ZipFile(rej_zip_path, "w") as z:
        z.writestr("notes.txt", "no images here")

    expected_data = {
        "scale": "small",
        "images_per_dataset": 4,
        "cases": [
            {
                "id": "ACC-D1",
                "name": "acc_clean_signed",
                "kind": "dataset",
                "expected": ["ACCEPT"],
                "why": "clean test pack case",
                "contributor": "lab-alpha",
            },
            {
                "id": "REJ-D2",
                "name": "rej_no_images",
                "kind": "dataset",
                "expected": ["REJECTED"],
                "why": "archive contains no images",
                "contributor": "lab-alpha",
            },
            {
                "id": "ACC-M1",
                "name": "acc_model.onnx",
                "kind": "model",
                "expected": ["ACCEPT"],
                "why": "model file",
            },
        ],
    }
    (pack_dir / "expected.json").write_text(json.dumps(expected_data), encoding="utf-8")

    # 1. Listing works for client level
    list_res = ws_cl.get("/api/workspace/test-packs")
    assert list_res.status_code == 200
    cases = list_res.json()
    assert len(cases) == 2  # Only dataset cases
    acc_case = next(c for c in cases if c["id"] == "ACC-D1")
    assert acc_case["scale"] == "small"
    assert acc_case["name"] == "acc_clean_signed"
    assert acc_case["expected"] == "ACCEPT"
    assert acc_case["zip_exists"] is True

    # 2. Client role cannot ingest (403 Forbidden)
    client_ingest = ws_cl.post("/api/workspace/test-packs/small/ACC-D1/ingest")
    assert client_ingest.status_code == 403

    # 3. Operator role can ingest
    op_ingest = ws_op.post("/api/workspace/test-packs/small/ACC-D1/ingest")
    assert op_ingest.status_code == 200
    asset_data = op_ingest.json()
    assert asset_data["name"] == "[pack small] acc_clean_signed"
    assert asset_data["uploaded_by"] == "ws_op"

    # 4. Ingest rejection case returns 400 REJECTED
    op_rej = ws_op.post("/api/workspace/test-packs/small/REJ-D2/ingest")
    assert op_rej.status_code == 400
    assert "REJECTED" in op_rej.json()["detail"]


def test_upload_dataset_with_format(ws_users):
    ws_op, _ = ws_users
    # Create a mock YOLO dataset zip:
    # images/001.png, labels/001.txt, data.yaml
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        img_buf = io.BytesIO()
        Image.new("RGB", (100, 100), (200, 50, 50)).save(img_buf, "PNG")
        z.writestr("images/001.png", img_buf.getvalue())
        z.writestr("labels/001.txt", "0 0.5 0.5 0.4 0.4\n")
        z.writestr("data.yaml", "names:\n  0: target\n")
    buf.seek(0)

    res = ws_op.post(
        "/api/assets/datasets",
        files={"file": ("yolo_mock.zip", buf.getvalue(), "application/zip")},
        data={"name": "yolo-test-upload", "format": "yolo"},
    )
    assert res.status_code == 200
    ds = res.json()
    assert ds["name"] == "yolo-test-upload"
    meta = ds.get("meta") or {}
    assert meta.get("task") == "detection"
    assert meta.get("boxes", 0) >= 1
