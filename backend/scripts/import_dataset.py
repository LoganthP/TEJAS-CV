"""Import a downloaded public benchmark into TEJAS-CV, fully offline.

    python scripts/import_dataset.py cifar10 --subset 2000
    python scripts/import_dataset.py gtsrb --archive D:/downloads/GTSRB-Training_fixed.zip
    python scripts/import_dataset.py cifar10_c --corruption fog --severity 3 --subset 1000
    python scripts/import_dataset.py yolo_coco8
    python scripts/import_dataset.py coco2017_val --subset 500

Steps: locate the archive (TEJAS_HOME/benchmarks_raw/<id>/ or --archive), verify its SHA-256
against catalog.yaml (refuse on mismatch; record it on first import if the catalogue is empty),
convert it into the internal layout, register it (per-file SHA-256 + Merkle root), attach
licence metadata, and seal a DATASET_IMPORTED block in the audit ledger.

Sources that cannot be imported automatically (TrojAI, BackdoorBench, ImageNet-C) raise a
clear error with the manual steps instead of pretending to work.
"""
from __future__ import annotations

import argparse
import shutil
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import yaml  # noqa: E402

from app.config import settings  # noqa: E402
from app.core.hashing import sha256_file  # noqa: E402
from app.core.ledger import append_block, ensure_genesis  # noqa: E402
from app.database import Asset, SessionLocal, init_db  # noqa: E402

CATALOG = BACKEND / "benchmarks" / "catalog.yaml"
MANUAL_ONLY = {
    "trojai_round0": "Download a TrojAI image-classification round from https://pages.nist.gov/trojai/docs/data.html. "
                     "Its model.pt files are full pickled PyTorch models: convert them to ONNX in an isolated "
                     "environment first (see README, 'Using TrojAI models'), then upload the ONNX via /api/assets/models.",
    "backdoorbench": "BackdoorBench results are PyTorch checkpoints (pickles). Export the model to ONNX in an isolated "
                     "environment and upload it via /api/assets/models; export the poisoned images to a "
                     "<label>/<image> folder and import it with --folder.",
    "imagenet_c": "ImageNet-C is research-only and very large. Extract one corruption/severity folder "
                  "(<label>/<image> layout) and import it with --folder.",
}


def load_catalog_entry(ds_id: str) -> dict:
    data = yaml.safe_load(CATALOG.read_text(encoding="utf-8"))
    for e in data.get("datasets", []):
        if e["id"] == ds_id:
            return e
    raise FileNotFoundError(f"'{ds_id}' is not in {CATALOG.name}")


def _find_archive(ds_id: str, archive_path: str | None) -> Path:
    if archive_path:
        p = Path(archive_path)
        if not p.exists():
            raise FileNotFoundError(p)
        return p
    raw = settings.home / "benchmarks_raw" / ds_id
    cands = sorted(p for p in raw.glob("*") if p.is_file() and not p.name.endswith(".json")) if raw.exists() else []
    if not cands:
        raise FileNotFoundError(f"No archive found in {raw}. Run scripts/fetch_datasets.py on a connected "
                                f"machine, or pass --archive.")
    return cands[0]


def _verify_hash(entry: dict, archive: Path) -> str:
    actual = sha256_file(archive)
    expected = (entry.get("archive_sha256") or "").strip().lower()
    if expected and expected != actual:
        raise ValueError(f"SECURITY ERROR: Archive hash mismatch for {entry['id']}: expected {expected}, got {actual}. "
                         f"The file is not the one recorded in the catalogue; refusing to import.")
    if not expected:
        print(f"[!] catalog.yaml has no archive_sha256 for '{entry['id']}'. Observed SHA-256:\n    {actual}\n"
              f"    Pin it in catalog.yaml so every later import is verified against it.")
    return actual


def _extract(archive: Path, into: Path) -> Path:
    if archive.is_dir():
        return archive
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as z:
            for m in z.namelist():
                if m.startswith("/") or ".." in Path(m).parts:
                    raise ValueError(f"unsafe path in archive: {m}")
            z.extractall(into)
    elif tarfile.is_tarfile(archive):
        with tarfile.open(archive) as t:
            for m in t.getmembers():
                if m.name.startswith("/") or ".." in Path(m.name).parts or m.issym() or m.islnk():
                    raise ValueError(f"unsafe entry in archive: {m.name}")
            t.extractall(into)
    else:
        raise ValueError(f"{archive.name} is neither zip nor tar")
    return into


def import_dataset(dataset_id: str, subset: int | None = None, seed: int = 42, archive_path: str | None = None,
                   corruption: str = "gaussian_noise", severity: int | None = 3, folder: str | None = None,
                   name: str | None = None) -> Asset:
    settings.ensure_dirs()
    init_db()
    from app.services.ingestion import attach_detection_annotations, register_dataset

    if folder:  # already a <label>/<image> folder (used for manual sources)
        entry = {"id": dataset_id, "name": name or dataset_id, "licence": "see source", "task": "classification"}
        src, archive_sha, det = Path(folder), None, None
        work = None
    else:
        if dataset_id in MANUAL_ONLY:
            raise ValueError(MANUAL_ONLY[dataset_id])
        entry = load_catalog_entry(dataset_id)
        archive = _find_archive(dataset_id, archive_path)
        archive_sha = _verify_hash(entry, archive)          # refuse BEFORE touching the contents
        work = Path(tempfile.mkdtemp(prefix=f"tejas-import-{dataset_id}-"))
        extracted = _extract(archive, work / "raw")
        src, det = work / "converted", None
        if dataset_id == "cifar10":
            from app.formats.cifar10_bin import convert_cifar10_binary
            convert_cifar10_binary(extracted, src, subset=subset, seed=seed)
        elif dataset_id == "gtsrb":
            from app.formats.gtsrb import convert_gtsrb
            convert_gtsrb(extracted, src, subset=subset, seed=seed)
        elif dataset_id == "cifar10_c":
            from app.formats.corruptions import convert_corruption_dataset
            convert_corruption_dataset(extracted, src, corruption=corruption, severity=severity,
                                       subset_per_severity=subset, seed=seed)
        elif dataset_id in ("yolo_coco8", "coco2017_val"):
            det, src = _stage_detection(dataset_id, extracted, work, subset, seed)
        else:
            raise ValueError(f"No converter for '{dataset_id}'")

    with SessionLocal() as s:
        ensure_genesis(s)
        asset = register_dataset(s, src, name or entry.get("name", dataset_id), "public-benchmark")
        meta = dict(asset.meta or {})
        meta.update({"source": dataset_id, "licence": entry.get("licence"), "url": entry.get("url"),
                     "citation": entry.get("citation"), "archive_sha256": archive_sha,
                     "non_commercial": bool(entry.get("non_commercial")), "subset": subset, "seed": seed})
        asset.meta = meta
        s.commit()
        if det is not None:
            attach_detection_annotations(s, asset, det)
        append_block(s, "DATASET_IMPORTED", asset.id,
                     {"asset_id": asset.id, "source": dataset_id, "archive_sha256": archive_sha,
                      "licence": entry.get("licence"), "merkle_root": asset.sha256,
                      "samples": meta.get("sample_count")})
        s.refresh(asset)
    if work:
        shutil.rmtree(work, ignore_errors=True)
    return asset


def _stage_detection(ds_id: str, extracted: Path, work: Path, subset, seed):
    import numpy as np
    if ds_id == "yolo_coco8":
        from app.formats.yolo import parse_yolo
        root = next((p.parent for p in extracted.rglob("*.yaml")), extracted)
        det = parse_yolo(root, next(root.glob("*.yaml"), None))
        img_root = root
    else:
        from app.formats.coco import parse_coco
        ann = next(extracted.rglob("instances_val2017.json"), None) or next(extracted.rglob("*.json"), None)
        if ann is None:
            raise FileNotFoundError("COCO annotations JSON not found (put annotations_trainval2017.zip contents "
                                    "next to val2017 in the same folder or archive)")
        img_root = next((p for p in extracted.rglob("val2017") if p.is_dir()), extracted)
        det = parse_coco(ann, img_root)
    if subset and subset < len(det.samples):
        idx = sorted(np.random.default_rng(seed).choice(len(det.samples), subset, replace=False))
        det.samples = [det.samples[i] for i in idx]
    staged = work / "converted"
    staged.mkdir(parents=True, exist_ok=True)
    by_name = {p.name: p for p in img_root.rglob("*") if p.is_file()}
    for smp in det.samples:
        p = by_name.get(Path(smp.image_relpath).name)
        if p:
            shutil.copy2(p, staged / p.name)
    return det, staged


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dataset_id")
    ap.add_argument("--subset", type=int)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--archive")
    ap.add_argument("--folder", help="import an existing <label>/<image> folder instead of an archive")
    ap.add_argument("--name")
    ap.add_argument("--corruption", default="gaussian_noise")
    ap.add_argument("--severity", type=int, default=3)
    a = ap.parse_args()
    try:
        asset = import_dataset(a.dataset_id, a.subset, a.seed, a.archive, a.corruption, a.severity, a.folder, a.name)
    except (ValueError, FileNotFoundError) as exc:
        print(f"[x] {exc}")
        return 1
    m = asset.meta or {}
    print(f"[+] Imported {asset.id}: {m.get('sample_count')} images, classes={m.get('classes')}")
    print(f"    Merkle root {asset.sha256}")
    if m.get("task") == "detection":
        print(f"    {m.get('boxes')} boxes ({m.get('invalid_boxes')} invalid)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
