"""Demo tamper -> detected -> restore -> chain valid again (only demo-tool edits are restorable)."""
from fastapi.testclient import TestClient

from app.main import app


def test_tamper_and_restore_audit_block(demo_state):
    with TestClient(app) as c:
        blocks = c.get("/api/audit", params={"limit": 500}).json()["items"]
        idx = max(b["index"] for b in blocks)
        assert c.post("/api/audit/verify").json()["valid"]
        c.post(f"/api/demo/tamper/audit/{idx}")
        v = c.post("/api/audit/verify").json()
        assert not v["valid"] and v["first_invalid_index"] == idx
        assert idx in c.get("/api/demo/tampers").json()["audit_blocks"]
        assert c.post(f"/api/demo/restore/audit/{idx}").status_code == 200
        assert c.post("/api/audit/verify").json()["valid"]
        assert c.post("/api/demo/restore/audit/1").status_code == 404   # never tampered by the tool
