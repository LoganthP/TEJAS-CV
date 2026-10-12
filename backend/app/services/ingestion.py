"""SECURE INGESTION: registration of datasets, models, contributors and trusted fingerprints.

Datasets: class-folder layout  <root>/<label>/<image>  (+ optional manifest.json/.sig).
Each sample is SHA-256 fingerprinted, perceptually hashed, decoded, and profiled; the
dataset identity is the Merkle root over all sample hashes (sorted by path)."""
from __future__ import annotations

import io
import json
import shutil
import stat
import zipfile
from pathlib import Path
from typing import Any

import imagehash
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from ..adapters.base import ModelLoadError
from ..adapters.registry import load_adapter
from ..config import settings
from ..core.hashing import sha256_bytes, sha256_file, sha256_json
from ..core.keys import generate_keypair, platform_keys
from ..core.ledger import append_block
from ..core.merkle import merkle_root
from ..database import Asset, Contributor, DatasetSample, TrustedModel, iso_now, new_id
from ..engines.model_assurance import trusted_record_core
from ..engines.probes import behavior_probes
from ..features.image_stats import image_stats

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
FORMAT_EXT = {"JPEG": {".jpg", ".jpeg"}, "PNG": {".png"}, "BMP": {".bmp"}, "TIFF": {".tif", ".tiff"},
              "WEBP": {".webp"}}


class IngestionError(Exception):
    pass


def safe_extract(zip_path: Path, dest: Path) -> None:
    """Zip-slip, symlink and zip-bomb protected extraction."""
    import os
    from datetime import datetime
    dest = dest.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        infos = zf.infolist()
        if len(infos) > settings.max_archive_files:
            raise IngestionError("archive contains too many files")
        if sum(i.file_size for i in infos) > settings.max_archive_bytes:
            raise IngestionError("archive expands beyond the size limit")
        for info in infos:
            if stat.S_ISLNK(info.external_attr >> 16):
                raise IngestionError(f"symlink rejected: {info.filename}")
            target = (dest / info.filename).resolve()
            if not target.is_relative_to(dest):
                raise IngestionError(f"path traversal rejected: {info.filename}")
            zf.extract(info, dest)
            dt = datetime(*info.date_time)
            ts = dt.timestamp()
            os.utime(target, (ts, ts))


def _extract_exif(im: Image.Image) -> dict[str, Any] | None:
    exif_fields = {}
    gps_present = False
    try:
        raw_exif = im.getexif()
        if raw_exif:
            from PIL.ExifTags import TAGS
            for tag_id, val in raw_exif.items():
                tag_name = TAGS.get(tag_id, str(tag_id))
                if tag_name in ("DateTimeOriginal", "Make", "Model", "Software"):
                    exif_fields[tag_name] = str(val).strip()
                if tag_name == "GPSInfo" or tag_id == 34853:
                    gps_present = True

            try:
                exif_ifd = raw_exif.get_ifd(0x8769)
                if exif_ifd:
                    for sub_tag_id, sub_val in exif_ifd.items():
                        sub_name = TAGS.get(sub_tag_id, str(sub_tag_id))
                        if sub_name == "DateTimeOriginal" and "DateTimeOriginal" not in exif_fields:
                            exif_fields["DateTimeOriginal"] = str(sub_val).strip()
                        elif sub_name in ("Make", "Model", "Software") and sub_name not in exif_fields:
                            exif_fields[sub_name] = str(sub_val).strip()
            except Exception:
                pass

            try:
                gps_ifd = raw_exif.get_ifd(0x8825)
                if gps_ifd:
                    gps_present = True
            except Exception:
                pass
    except Exception:
        pass

    if not exif_fields and not gps_present:
        return None
    return {
        "DateTimeOriginal": exif_fields.get("DateTimeOriginal"),
        "Make": exif_fields.get("Make"),
        "Model": exif_fields.get("Model"),
        "Software": exif_fields.get("Software"),
        "gps_present": gps_present,
    }


def _profile_sample(p: Path, rel: str, archive_ts: str | None = None) -> dict[str, Any]:
    data = p.read_bytes()
    rec = {"relpath": rel, "sha256": sha256_bytes(data), "size": len(data), "phash": None,
           "width": 0, "height": 0, "readable": True, "error": None, "stats": {}}
    fmt = None
    mode = None
    exif = None
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            mode = im.mode
            rec["width"], rec["height"] = im.size
        if fmt in FORMAT_EXT and p.suffix.lower() not in FORMAT_EXT[fmt]:
            rec["readable"], rec["error"] = False, f"extension {p.suffix} does not match content ({fmt})"
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        rec["readable"], rec["error"] = False, f"{type(exc).__name__}: {exc}"[:200]

    rec["source_meta"] = {
        "source_modified_at": archive_ts,
        "size_bytes": len(data),
        "width": rec["width"],
        "height": rec["height"],
        "format": fmt,
        "mode": mode,
        "exif": exif,
    }
    return rec


def register_dataset(session: Session, source: Path, name: str, contributor: str,
                     signature: str | None = None, progress=None,
                     uploaded_by: str | None = None) -> Asset:
    asset_id = new_id("DS")
    dest = settings.datasets_dir / asset_id
    dest.mkdir(parents=True)
    package_sha = None
    archive_timestamps: dict[str, str] = {}
    try:
        if source.is_file() and zipfile.is_zipfile(source):
            package_sha = sha256_file(source)
            with zipfile.ZipFile(source) as zf:
                for zi in zf.infolist():
                    dt = zi.date_time
                    ts = f"{dt[0]:04d}-{dt[1]:02d}-{dt[2]:02d}T{dt[3]:02d}:{dt[4]:02d}:{dt[5]:02d}"
                    archive_timestamps[zi.filename.replace("\\", "/")] = ts
            safe_extract(source, dest)
        elif source.is_dir():
            shutil.copytree(source, dest, dirs_exist_ok=True)
        else:
            raise IngestionError("dataset must be a .zip archive or a directory")
        root = dest
        entries = [p for p in dest.iterdir() if not p.name.startswith((".", "__MACOSX"))]
        if len(entries) == 1 and entries[0].is_dir():
            root = entries[0]
        manifest = {}
        if (root / "manifest.json").exists():
            try:
                manifest = {f["path"]: f for f in json.loads((root / "manifest.json").read_text()).get("files", [])}
            except (json.JSONDecodeError, AttributeError, KeyError, TypeError):
                manifest = {}
        files = sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in IMG_EXT)
        if not files:
            raise IngestionError("no images found (expected <label>/<image> layout)")
        samples = []
        for k, p in enumerate(files):
            rel = p.relative_to(root).as_posix()
            dest_rel = p.relative_to(dest).as_posix()
            # Lookup zip entry timestamp
            archive_ts = archive_timestamps.get(dest_rel) or archive_timestamps.get(rel) or archive_timestamps.get(f"{root.name}/{rel}")
            rec = _profile_sample(p, rel, archive_ts)
            parts = rel.split("/")
            rec["label"] = manifest.get(rel, {}).get("label") or (parts[0] if len(parts) > 1 else "unlabeled")
            rec["contributor"] = manifest.get(rel, {}).get("contributor") or contributor
            samples.append(rec)
            if progress and k % 50 == 0:
                progress(k / len(files))
    except Exception:
        shutil.rmtree(dest, ignore_errors=True)
        raise
    samples.sort(key=lambda s: s["relpath"])
    root_hash = merkle_root([s["sha256"] for s in samples])
    labels: dict[str, int] = {}
    for s in samples:
        labels[s["label"]] = labels.get(s["label"], 0) + 1
    
    from ..core.actor import current_actor
    uploader = uploaded_by or current_actor()
    
    asset = Asset(id=asset_id, asset_type="dataset", name=name, contributor=contributor, sha256=root_hash,
                  size=sum(s["size"] for s in samples), path=str(root), signature=signature,
                  uploaded_by=uploader,
                  meta={"sample_count": len(samples), "classes": labels, "merkle_root": root_hash,
                        "package_sha256": package_sha, "unreadable": sum(not s["readable"] for s in samples),
                        "manifest_present": bool(manifest),
                        "contributors": sorted({s["contributor"] for s in samples})})
    session.add(asset)
    session.flush()
    session.bulk_insert_mappings(DatasetSample, [{**s, "dataset_id": asset_id} for s in samples])
    session.commit()
    append_block(session, "DATASET_REGISTERED", asset_id,
                 {"asset_id": asset_id, "name": name, "contributor": contributor, "merkle_root": root_hash,
                  "sample_count": len(samples), "uploaded_by": uploader}, leaves=[s["sha256"] for s in samples])

    # Auto-detect and attach YOLO or COCO object detection annotations
    try:
        from ..formats.yolo import parse_yolo
        has_yolo = (root / "data.yaml").exists() or (root / "labels").is_dir() or any((root / s / "labels").is_dir() for s in ["train", "val", "test"] if (root / s).is_dir())
        if has_yolo:
            det = parse_yolo(root)
            if det and det.samples:
                attach_detection_annotations(session, asset, det)
    except Exception:
        pass
    try:
        from ..formats.coco import parse_coco
        coco_json = next((p for p in root.rglob("*.json") if "instances" in p.name.lower() or "annotations" in p.name.lower()), None)
        if coco_json and not (asset.meta or {}).get("boxes"):
            det = parse_coco(coco_json, image_root=root)
            if det and det.samples:
                attach_detection_annotations(session, asset, det)
    except Exception:
        pass

    return asset


def register_model(session: Session, source: Path, name: str, contributor: str,
                   adapter_meta: dict | None = None, signature: str | None = None,
                   uploaded_by: str | None = None) -> Asset:
    asset_id = new_id("MDL")
    dest = settings.models_dir / f"{asset_id}{source.suffix.lower()}"
    shutil.copy2(source, dest)
    sha = sha256_file(dest)
    meta: dict[str, Any] = {"adapter_meta": adapter_meta or {}, "original_filename": source.name}
    try:
        info = load_adapter(dest, adapter_meta).inspect()
        meta.update({"format": info["format"], "param_count": info["param_count"],
                     "layer_count": info["layer_count"], "structure_hash": info.get("structure_hash"),
                     "inputs": info.get("inputs"), "outputs": info.get("outputs")})
    except (ModelLoadError, Exception) as exc:  # noqa: BLE001 - registered anyway; engine will flag
        meta["load_error"] = f"{type(exc).__name__}: {exc}"
    
    from ..core.actor import current_actor
    uploader = uploaded_by or current_actor()
    
    asset = Asset(id=asset_id, asset_type="model", name=name, contributor=contributor, sha256=sha,
                  size=dest.stat().st_size, path=str(dest), signature=signature, meta=meta,
                  uploaded_by=uploader)
    session.add(asset)
    session.commit()
    append_block(session, "MODEL_REGISTERED", asset_id,
                 {"asset_id": asset_id, "name": name, "contributor": contributor, "sha256": sha,
                  "format": meta.get("format"), "uploaded_by": uploader})
    return asset


def register_contributor(session: Session, name: str, public_key: str | None = None,
                         organisation: str | None = None) -> tuple[Contributor, str | None]:
    """Returns (contributor, private_key_hex_if_generated). A generated private key is
    returned exactly once and never stored by the platform."""
    if session.query(Contributor).filter_by(name=name).first():
        raise IngestionError(f"contributor '{name}' already exists")
    private = None
    if not public_key:
        private, public_key = generate_keypair()
    c = Contributor(name=name, public_key=public_key, organisation=organisation)
    session.add(c)
    session.commit()
    append_block(session, "CONTRIBUTOR_REGISTERED", c.id, {"name": name, "public_key": public_key})
    return c, private


def register_trusted_model(session: Session, asset: Asset, name: str) -> TrustedModel:
    if asset.asset_type != "model":
        raise IngestionError("only models can be registered as trusted")
    if session.query(TrustedModel).filter_by(name=name).first():
        raise IngestionError(f"trusted model '{name}' already exists")
    adapter = load_adapter(asset.path, asset.meta.get("adapter_meta"))
    info = adapter.inspect()
    fp = {}
    if adapter.can_predict:
        fp = {"probe_set": "behavior_probes-v1",
              "probs": [[round(float(x), 5) for x in row] for row in adapter.predict_images(behavior_probes())]}
    t = TrustedModel(name=name, sha256=asset.sha256, structure_hash=info.get("structure_hash"),
                     param_count=info["param_count"], model_format=info["format"], behavior_fingerprint=fp,
                     source_asset_id=asset.id, registered_at=iso_now(), signature="")
    t.signature = platform_keys().sign(sha256_json(trusted_record_core(t)))
    session.add(t)
    session.commit()
    append_block(session, "TRUSTED_MODEL_REGISTERED", t.id,
                 {"name": name, "sha256": t.sha256, "structure_hash": t.structure_hash, "asset_id": asset.id})
    return t


def attach_detection_annotations(session: Session, dataset: Asset, det) -> dict:
    """Store bounding boxes for a registered detection dataset (COCO / YOLO import).

    `det` is an app.formats.detection_model.DetectionDataset whose image_relpath basenames
    match the registered sample files. Invalid boxes are stored with their validation error so
    the data engine reports them as findings instead of the import crashing."""
    from ..database import DatasetAnnotation, DatasetSample
    validation = det.validate()
    by_name = {Path(r.relpath).name: r.id for r in
               session.query(DatasetSample).filter_by(dataset_id=dataset.id)}
    rows, unmatched = [], 0
    for s in det.samples:
        sid = by_name.get(Path(s.image_relpath).name)
        if sid is None:
            unmatched += 1
            continue
        for b in s.boxes:
            own = b.validate(s.width, s.height, set(det.classes) or None)
            rows.append(DatasetAnnotation(sample_id=sid, label=b.class_name, class_id=b.class_id, bbox=b.to_list(),
                                          area=float(b.area), is_valid=not own,
                                          validation_error="; ".join(own) or None))
    session.add_all(rows)
    meta = dict(dataset.meta or {})
    meta.update({"task": "detection", "boxes": len(rows), "invalid_boxes": validation["invalid_boxes"],
                 "detection_classes": {int(k): v for k, v in det.classes.items()}})
    dataset.meta = meta
    session.commit()
    append_block(session, "ANNOTATIONS_ATTACHED", dataset.id,
                 {"dataset_id": dataset.id, "boxes": len(rows), "unmatched_images": unmatched,
                  "invalid_boxes": validation["invalid_boxes"]})
    return {"boxes": len(rows), "unmatched_images": unmatched, "invalid_boxes": validation["invalid_boxes"]}
