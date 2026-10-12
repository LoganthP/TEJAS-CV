"""Per-image properties (General, Digital Signatures, Security, Details, Previous Versions).

Works for EVERY dataset: values are read from the database and computed live from the stored
file, so older/demo datasets are fully populated too. Nothing here raises because a field is
missing; unknowable values are returned as null.
"""
from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import imagehash
from fastapi import APIRouter, Depends, HTTPException
from PIL import ExifTags, Image
from sqlalchemy.orm import Session

from ..core.hashing import sha256_file
from ..core.keys import verify_signature
from ..core.merkle import merkle_proof, verify_proof
from ..database import Asset, Contributor, DatasetSample, Job, User, get_db
from ..features.image_stats import image_stats

router = APIRouter(prefix="/api", tags=["assets"])
EXIF_KEEP = {"DateTimeOriginal", "DateTime", "Make", "Model", "Software", "LensModel", "ExposureTime",
             "FNumber", "ISOSpeedRatings", "FocalLength"}


def _iso(ts: float | datetime | None) -> str | None:
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return (ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)).isoformat()
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


@lru_cache(maxsize=2048)
def _file_facts(path_str: str, mtime: float, size: int) -> dict:
    """Everything derivable from the bytes. Cached per (path, mtime, size)."""
    p = Path(path_str)
    out = {"sha256_now": sha256_file(p), "format": None, "mode": None, "width": None, "height": None,
           "bit_depth": None, "exif": None, "has_gps": False, "phash": None, "stats": None, "error": None}
    try:
        with Image.open(p) as im:
            out.update(format=im.format, mode=im.mode, width=im.width, height=im.height)
            out["bit_depth"] = {"1": 1, "L": 8, "P": 8, "RGB": 24, "RGBA": 32, "I;16": 16, "I": 32,
                                "F": 32, "CMYK": 32, "LA": 16}.get(im.mode)
            raw = im.getexif()
            if raw:
                named = {ExifTags.TAGS.get(k, str(k)): v for k, v in raw.items()}
                try:
                    named.update({ExifTags.TAGS.get(k, str(k)): v for k, v in raw.get_ifd(0x8769).items()})
                except Exception:  # noqa: BLE001
                    pass
                out["has_gps"] = 0x8825 in raw          # presence only, never coordinates
                out["exif"] = {k: str(v)[:120] for k, v in named.items() if k in EXIF_KEEP} or None
            rgb = im.convert("RGB")
            out["phash"] = str(imagehash.phash(rgb))
            out["stats"] = {k: round(float(v), 4) for k, v in image_stats(rgb).items()}
    except Exception as exc:  # noqa: BLE001  (unreadable image -> report, don't fail)
        out["error"] = f"{type(exc).__name__}: {exc}"[:200]
    return out


def _manifest(root: Path, relpath: str, sha: str, contributor: Contributor | None) -> dict:
    m, s = root / "manifest.json", root / "manifest.sig"
    res = {"manifest_present": m.exists(), "listed_in_manifest": None, "manifest_hash_matches": None,
           "manifest_signer": None, "manifest_signature_valid": None, "signer_key_fingerprint": None}
    if not m.exists():
        return res
    mbytes = m.read_bytes()
    try:
        man = json.loads(mbytes)
    except ValueError:
        res["manifest_signature_valid"] = False
        return res
    res["manifest_signer"] = man.get("created_by")
    entry = next((f for f in man.get("files", []) if f.get("path") == relpath), None)
    res["listed_in_manifest"] = entry is not None
    res["manifest_hash_matches"] = (entry.get("sha256") == sha) if entry else None
    if contributor and contributor.public_key:
        from ..core.hashing import sha256_bytes
        res["signer_key_fingerprint"] = "ed25519:" + sha256_bytes(bytes.fromhex(contributor.public_key))[:16]
        sig = s.read_text().strip() if s.exists() else None
        res["manifest_signature_valid"] = bool(sig) and verify_signature(contributor.public_key, mbytes, sig)
    return res


def _person(db: Session, username: str | None) -> dict | None:
    if not username:
        return None
    u = db.query(User).filter_by(username=username).first()
    kind = "account" if u else ("cli" if username.startswith("local:") else "service")
    return {"username": username, "display_name": (u.display_name if u else None) or username,
            "role": u.role if u else None, "kind": kind}


@router.get("/assets/{dataset_id}/samples/{sample_id}/details",
            summary="Properties of one image: general, signatures, security, details, history")
def sample_details(dataset_id: str, sample_id: int, db: Session = Depends(get_db)):
    ds = db.get(Asset, dataset_id)
    if ds is None or ds.asset_type != "dataset":
        raise HTTPException(404, "dataset not found")
    smp = db.get(DatasetSample, sample_id)
    if smp is None or smp.dataset_id != dataset_id:
        raise HTTPException(404, "sample not found in this dataset")
    root = Path(ds.path)
    fpath = root / smp.relpath
    if not fpath.exists():
        raise HTTPException(410, f"the stored file is missing on disk: {smp.relpath}")
    st = fpath.stat()
    f = _file_facts(str(fpath), st.st_mtime, st.st_size)

    rows = db.query(DatasetSample).filter_by(dataset_id=dataset_id).order_by(DatasetSample.relpath).all()
    leaves = [r.sha256 for r in rows]
    idx = next(i for i, r in enumerate(rows) if r.id == smp.id)
    proof = merkle_proof(leaves, idx)
    contributor = db.query(Contributor).filter_by(name=smp.contributor).first() or \
        db.query(Contributor).filter_by(name=ds.contributor).first()
    source_meta = getattr(smp, "source_meta", None) or {}

    # findings for this image from the latest completed assessment of this dataset
    findings, job_info = [], None
    job = (db.query(Job).filter_by(dataset_id=dataset_id, status="COMPLETED")
           .order_by(Job.completed_at.desc()).first())
    if job and job.report:
        for item in job.report.get("metrics", {}).get("data", {}).get("flagged_sample_list", []):
            if item.get("sample_id") == smp.id or item.get("relpath") == smp.relpath:
                findings = item.get("reasons", [])
        job_info = {"job_id": job.id, "decision": job.decision, "completed_at": _iso(job.completed_at)}

    same = (db.query(DatasetSample, Asset).join(Asset, Asset.id == DatasetSample.dataset_id)
            .filter(DatasetSample.sha256 == smp.sha256, DatasetSample.id != smp.id).limit(20).all())
    near = []
    if f["phash"]:
        target = imagehash.hex_to_hash(f["phash"])
        for r in db.query(DatasetSample).filter(DatasetSample.phash.isnot(None), DatasetSample.id != smp.id,
                                                DatasetSample.sha256 != smp.sha256).limit(5000):
            try:
                d = target - imagehash.hex_to_hash(r.phash)
            except ValueError:
                continue
            if d <= 6:
                near.append({"dataset_id": r.dataset_id, "sample_id": r.id, "relpath": r.relpath, "distance": int(d)})
        near = sorted(near, key=lambda x: x["distance"])[:10]

    return {
        "sample_id": smp.id,
        "general": {
            "filename": Path(smp.relpath).name, "relpath": smp.relpath, "label": smp.label,
            "dataset_id": ds.id, "dataset_name": ds.name, "size_bytes": st.st_size,
            "format": f["format"], "width": f["width"], "height": f["height"], "mode": f["mode"],
            "source_modified_at": source_meta.get("source_modified_at") or _iso(st.st_mtime),
            "source_time_origin": "archive entry" if source_meta.get("source_modified_at") else "stored file modified time",
            "ingested_at": _iso(ds.created_at), "uploaded_by": _person(db, ds.uploaded_by),
            "contributor": smp.contributor, "readable": smp.readable, "read_error": smp.error or f["error"],
        },
        "signatures": {
            "sha256": smp.sha256, "sha256_recomputed_now": f["sha256_now"],
            "file_unchanged": f["sha256_now"] == smp.sha256,
            "merkle_root": ds.sha256, "merkle_leaf_index": idx, "merkle_proof": proof,
            "merkle_verified": verify_proof(smp.sha256, proof, ds.sha256),
            "algorithm": "Ed25519", **_manifest(root, smp.relpath, smp.sha256, contributor),
        },
        "security": {
            "dataset_status": ds.status, "uploaded_by": _person(db, ds.uploaded_by), "ingested_at": _iso(ds.created_at),
            "visible_to_roles": ["admin", "operator", "client"], "findings": findings, "assessment": job_info,
        },
        "details": {
            "width": f["width"], "height": f["height"], "format": f["format"], "mode": f["mode"],
            "bit_depth": f["bit_depth"], "phash": f["phash"], "sha256": smp.sha256, "stats": f["stats"],
            "exif": f["exif"], "exif_has_gps": f["has_gps"],
        },
        "history": {
            "same_file_elsewhere": [{"dataset_id": a.id, "dataset_name": a.name, "sample_id": s.id,
                                     "relpath": s.relpath, "label": s.label, "ingested_at": _iso(a.created_at)}
                                    for s, a in same],
            "near_duplicates": near,
        },
    }
