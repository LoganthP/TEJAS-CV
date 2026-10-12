"""HTTP + WebSocket contract used by the React frontend."""
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


@pytest.fixture(scope="module")
def client(demo_state):
    with TestClient(app) as c:
        yield c


def test_health_and_status(client):
    assert client.get("/api/health").status_code == 200
    st = client.get("/api/system/status").json()
    assert "embedder" in str(st).lower() or st


def test_scenario_over_websocket(client):
    r = client.post("/api/demo/scenarios/clean")
    assert r.status_code == 200
    job_id = r.json()["job"]["id"]
    types = []
    with client.websocket_connect(f"/ws/jobs/{job_id}") as ws:
        while True:
            ev = ws.receive_json()
            types.append(ev["type"])
            if ev["type"] in ("complete", "failed"):
                break
    assert types[-1] == "complete" and ev["decision"] == "ACCEPT"
    assert "stage" in types
    job = client.get(f"/api/jobs/{job_id}").json()
    assert job["status"] == "COMPLETED"
    assert client.get(f"/api/jobs/{job_id}/findings").status_code == 200
    assert client.get(f"/api/jobs/{job_id}/summary").status_code == 200
    rep = client.get(f"/api/jobs/{job_id}/report").json()
    assert rep["signature_valid"] is True
    g = client.get(f"/api/jobs/{job_id}/provenance-graph").json()
    assert g["nodes"] and g["edges"]


def test_inference_then_tamper_then_verify(client, demo_state):
    # use a non-approved model so the approved model's chain stays clean for later tests
    model_id = demo_state["models"]["tampered"]
    buf = io.BytesIO()
    Image.new("RGB", (128, 128), (40, 120, 40)).save(buf, "PNG")
    r = client.post("/api/inference", data={"model_id": model_id},
                    files={"file": ("probe.png", buf.getvalue(), "image/png")})
    assert r.status_code == 200, r.text
    rec = r.json()
    rid = rec["id"]
    a1 = client.post("/api/inference/attest", json={"record": rec}).json()
    a2 = client.post("/api/inference/attest", json={"record": rec}).json()
    assert a1["verdict"] == "ACCEPT"
    assert a2["verdict"] == "REJECT" and "REPLAY" in a2["reason"]
    client.post(f"/api/demo/tamper/inference/{rid}")
    v = client.post("/api/inference/verify-chain").json()
    assert not v["valid"]
    assert any(x["id"] == rid and x["status"] == "TAMPERED" for x in v["records"])


def test_dataset_merkle_proof(client, demo_state):
    ds = demo_state["datasets"]["reference"]
    samples = client.get(f"/api/assets/{ds}/samples", params={"limit": 3}).json()
    items = samples["items"] if isinstance(samples, dict) else samples
    sid = items[0]["id"]
    proof = client.get(f"/api/assets/{ds}/samples/{sid}/proof").json()
    assert proof["verified"] is True


def test_sample_details_and_source_meta(client, demo_state):
    # Create an in-memory zip archive with a sample image
    import zipfile
    img_buf = io.BytesIO()
    im = Image.new("RGB", (64, 48), (200, 50, 50))
    im.save(img_buf, "PNG")
    img_bytes = img_buf.getvalue()

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zi = zipfile.ZipInfo("vehicles/truck_01.png", (2025, 6, 15, 14, 30, 0))
        zf.writestr(zi, img_bytes)
    zip_bytes = zip_buf.getvalue()

    # Upload dataset as operator/admin
    resp = client.post(
        "/api/assets/datasets",
        data={"name": "Test Meta Dataset", "contributor": "lab-alpha"},
        files={"file": ("test_meta.zip", zip_bytes, "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    ds_id = resp.json()["id"]

    # List samples
    samples_resp = client.get(f"/api/assets/{ds_id}/samples").json()
    items = samples_resp["items"]
    assert len(items) == 1
    sample_id = items[0]["id"]

    # Fetch details
    details_resp = client.get(f"/api/assets/{ds_id}/samples/{sample_id}/details")
    assert details_resp.status_code == 200, details_resp.text
    details = details_resp.json()

    # Verify recomputed hash matches
    assert details["signatures"]["sha256"] == items[0]["sha256"]
    assert details["signatures"]["sha256_recomputed_now"] == items[0]["sha256"]
    assert details["signatures"]["file_unchanged"] is True

    # Verify Merkle proof verifies
    assert details["signatures"]["merkle_verified"] is True
    assert details["signatures"]["merkle_root"] == resp.json()["sha256"]

    # Verify source_meta is captured
    assert details["general"]["width"] == 64
    assert details["general"]["height"] == 48
    assert details["general"]["source_modified_at"] == "2025-06-15T14:30:00"
    assert details["general"]["format"] == "PNG"

