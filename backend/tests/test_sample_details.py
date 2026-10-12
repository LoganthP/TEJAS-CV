"""Image Properties endpoint: real values for demo datasets, fresh uploads and edge cases."""
import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from app.database import Asset, DatasetSample, SessionLocal
from app.main import app


def _first_sample(ds_id):
    with SessionLocal() as s:
        return s.query(DatasetSample).filter_by(dataset_id=ds_id).order_by(DatasetSample.relpath).first().id


def test_demo_dataset_sample_has_real_values(demo_state):
    ds = demo_state["datasets"]["reference"]
    with TestClient(app) as c:
        r = c.get(f"/api/assets/{ds}/samples/{_first_sample(ds)}/details")
        assert r.status_code == 200, r.text
        d = r.json()
        g, sig, det = d["general"], d["signatures"], d["details"]
        assert g["width"] and g["height"] and g["size_bytes"] > 0 and g["format"] == "PNG"
        assert g["ingested_at"] and g["source_modified_at"]
        assert sig["file_unchanged"] is True and sig["merkle_verified"] is True
        assert sig["manifest_present"] is True and sig["listed_in_manifest"] is True
        assert sig["manifest_signature_valid"] is True
        assert det["phash"] and det["stats"]["brightness"] is not None
        assert isinstance(d["history"]["same_file_elsewhere"], list)


def test_uploaded_zip_keeps_source_time_and_detects_edits(demo_state):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for label, col in (("desert", (200, 170, 110)), ("water", (30, 70, 160))):
            for i in range(3):
                b = io.BytesIO()
                Image.new("RGB", (40, 30), col).save(b, "PNG")
                zi = zipfile.ZipInfo(f"{label}/img_{i}.png", date_time=(2025, 3, 14, 9, 26, 52))
                z.writestr(zi, b.getvalue())
    with TestClient(app) as c:
        a = c.post("/api/assets/datasets", files={"file": ("u.zip", buf.getvalue())},
                   data={"name": "upload", "contributor": "lab-alpha"}).json()
        sid = _first_sample(a["id"])
        d = c.get(f"/api/assets/{a['id']}/samples/{sid}/details").json()
        assert d["general"]["source_modified_at"].startswith("2025-03-14")
        assert d["general"]["width"] == 40 and d["signatures"]["manifest_present"] is False
        with SessionLocal() as s:
            smp = s.get(DatasetSample, sid)
            p = Path(s.get(Asset, a["id"]).path) / smp.relpath
        p.write_bytes(p.read_bytes() + b"x")
        d2 = c.get(f"/api/assets/{a['id']}/samples/{sid}/details").json()
        assert d2["signatures"]["file_unchanged"] is False
        assert c.get(f"/api/assets/{a['id']}/samples/999999/details").status_code == 404
