"""Benchmarks API router for TEJAS-CV.

Additive endpoints:
  - GET  /api/benchmarks/catalog
  - POST /api/benchmarks/import/{id}
  - POST /api/benchmarks/attacks
  - POST /api/benchmarks/runs
  - GET  /api/benchmarks/runs/{id}
"""
from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..attacks.dataset_attacks import generate_dataset_attack
from ..attacks.model_attacks import (
    attack_architectural_backdoor,
    attack_substitution,
    attack_weight_perturb,
)
from ..config import BACKEND_ROOT, settings
from ..core.events import bus
from ..core.hashing import sha256_bytes, sha256_file
from ..core.keys import platform_keys
from ..database import Asset, SessionLocal, get_db, new_id
from . import serializers as S

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])
_bench_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tejas-bench")

_RUNS: dict[str, dict[str, Any]] = {}
_RUNS_LOCK = threading.Lock()

CATALOG_PATH = BACKEND_ROOT / "benchmarks" / "catalog.yaml"


class AttackIn(BaseModel):
    dataset_id: Optional[str] = None
    model_id: Optional[str] = None
    attack: str = Field(..., description="badnets, blended, sig, wanet, label_flip, clean_label, near_duplicate_flood, substitution, weight_perturb, architectural_backdoor")
    rate: float = 0.05
    target: str = "water"
    seed: int = 42
    params: dict[str, Any] = Field(default_factory=dict)


class BenchmarkRunIn(BaseModel):
    suite: str = "smoke"
    source_dataset: Optional[str] = Field(None, description="dataset id to draw images from (default: synthetic)")


class ImportIn(BaseModel):
    subset: Optional[int] = None
    seed: int = 42
    archive_path: Optional[str] = None


@router.get("/catalog", summary="Get benchmark dataset catalogue")
def get_catalog(db: Session = Depends(get_db)):
    if not CATALOG_PATH.exists():
        raise HTTPException(500, f"catalog.yaml not found at {CATALOG_PATH}")

    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    results = []
    raw_root = settings.home / "benchmarks_raw"

    for entry in data.get("datasets", []):
        ds_id = entry["id"]
        raw_dir = raw_root / ds_id
        has_raw = raw_dir.exists() and any(raw_dir.glob("*"))

        # Check if imported into Asset
        # JSON filtering differs between databases, so match in Python (portable).
        imported_asset = next((a for a in db.query(Asset).filter(Asset.asset_type == "dataset")
                               if (a.meta or {}).get("source") == ds_id), None)
        results.append({
            **entry,
            "raw_available": bool(has_raw),
            "imported_asset_id": imported_asset.id if imported_asset else None,
        })

    return {"catalog": results}


@router.post("/import/{id}", summary="Import a downloaded benchmark archive (strictly offline)")
def import_benchmark_dataset(id: str, body: Optional[ImportIn] = None, db: Session = Depends(get_db)):
    # Import offline import script logic
    import sys
    if str(BACKEND_ROOT / "scripts") not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT / "scripts"))

    try:
        from import_dataset import import_dataset
    except ImportError as e:
        raise HTTPException(500, f"Failed to import import_dataset helper: {e}")

    opts = body or ImportIn()
    try:
        asset = import_dataset(
            dataset_id=id,
            subset=opts.subset,
            seed=opts.seed,
            archive_path=opts.archive_path,
        )
        return {"status": "imported", "asset": S.asset(asset)}
    except ValueError as exc:
        raise HTTPException(400, f"Hash or configuration verification failed: {exc}")
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Import failed: {type(exc).__name__}: {exc}")


@router.post("/attacks", summary="Generate a reproducible red-team attack")
def create_attack(req: AttackIn, db: Session = Depends(get_db)):
    if req.attack == "backdoor_finetune":  # old, misleading name kept as an alias
        req.attack = "architectural_backdoor"
    if req.attack in ("substitution", "weight_perturb", "architectural_backdoor"):
        if not req.model_id:
            raise HTTPException(400, "model_id is required for model attacks")
        model = db.get(Asset, req.model_id)
        if not model or model.asset_type != "model":
            raise HTTPException(404, f"Model asset {req.model_id} not found")

        out_dir = settings.home / "attacks" / f"{req.attack}_{req.seed}"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_model = out_dir / f"{Path(model.path).stem}_{req.attack}.onnx"

        if req.attack == "substitution":
            res = attack_substitution(Path(model.path), out_model, seed=req.seed)
        elif req.attack == "weight_perturb":
            res = attack_weight_perturb(Path(model.path), out_model, eps=req.params.get("eps", 0.05), seed=req.seed)
        else:
            try:
                target_idx = int(req.target)
            except ValueError:
                target_idx = 0
            res = attack_architectural_backdoor(Path(model.path), out_model, target_class_index=target_idx, seed=req.seed)

        return {"attack": req.attack, "output": res}

    # Dataset attacks
    if not req.dataset_id:
        raise HTTPException(400, "dataset_id is required for dataset attacks")
    ds = db.get(Asset, req.dataset_id)
    if not ds or ds.asset_type != "dataset":
        raise HTTPException(404, f"Dataset asset {req.dataset_id} not found")

    out_dir = settings.home / "attacks" / f"{req.attack}_{req.seed}"
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        res = generate_dataset_attack(
            source_dir=Path(ds.path),
            output_dir=out_dir,
            attack_type=req.attack,
            poison_rate=req.rate,
            target_class=req.target,
            seed=req.seed,
            params=req.params,
        )
        return {"attack": req.attack, "output": res}
    except Exception as exc:
        raise HTTPException(500, f"Attack generation failed: {type(exc).__name__}: {exc}")


def _execute_benchmark_job(run_id: str, suite: str, source_dataset: Optional[str]) -> None:
    import sys
    if str(BACKEND_ROOT / "scripts") not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT / "scripts"))

    try:
        from run_benchmark import run_suite
        bus.publish(run_id, "stage", stage="BENCHMARK_RUNNING", progress=5.0, message=f"Starting {suite} suite")
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        out_dir = settings.home / "benchmarks" / suite / ts
        log = lambda msg: bus.publish(run_id, "stage", stage="BENCHMARK_RUNNING", progress=50.0, message=msg)
        summary = run_suite(out_dir, suite, source_dataset, log=log)
        with _RUNS_LOCK:
            _RUNS[run_id] = {
                "id": run_id, "suite": suite, "status": "COMPLETED",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "output_dir": str(out_dir), "summary": summary,
                "markdown": (out_dir / "results.md").read_text(encoding="utf-8"),
            }
        bus.publish(run_id, "complete", stage="COMPLETED", progress=100.0,
                    message=f"Benchmark {suite} finished: AUROC {summary['performance']['fused_risk_metrics']['auroc']}")

    except Exception as exc:
        with _RUNS_LOCK:
            _RUNS[run_id] = {
                "id": run_id,
                "suite": suite,
                "status": "FAILED",
                "error": f"{type(exc).__name__}: {exc}",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        bus.publish(run_id, "failed", stage="FAILED", progress=100.0, message=str(exc))


@router.post("/runs", summary="Trigger a benchmark run")
def start_benchmark_run(body: BenchmarkRunIn):
    from ..core.actor import current_actor
    if body.suite not in ("ci", "smoke", "standard"):
        raise HTTPException(400, "suite must be ci, smoke or standard")
    run_id = new_id("BENCH")
    with _RUNS_LOCK:
        if any(r.get("status") == "RUNNING" for r in _RUNS.values()):
            raise HTTPException(409, "a benchmark is already running; wait for it to finish")
        _RUNS[run_id] = {
            "id": run_id,
            "suite": body.suite,
            "status": "RUNNING",
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
    who = current_actor()

    def _job():
        from ..core.actor import acting_as
        with acting_as(who):
            _execute_benchmark_job(run_id, body.suite, body.source_dataset)
    _bench_executor.submit(_job)
    return {
        "run_id": run_id,
        "suite": body.suite,
        "status": "RUNNING",
        "websocket": f"/ws/jobs/{run_id}",
    }


@router.get("/runs/{id}", summary="Get benchmark run status and results")
def get_benchmark_run(id: str):
    with _RUNS_LOCK:
        run = _RUNS.get(id)
    if not run:
        raise HTTPException(404, f"Benchmark run {id} not found")
    return run


@router.get("/results", summary="Benchmark results saved on disk (survive restarts), newest first")
def list_results():
    out = []
    root = settings.home / "benchmarks"
    for rj in root.glob("*/*/results.json") if root.exists() else []:
        try:
            sm = json.loads(rj.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        fz = sm.get("performance", {}).get("fused_risk_metrics", {})
        out.append({"suite": rj.parent.parent.name, "timestamp": rj.parent.name, "auroc": fz.get("auroc"),
                    "tpr_at_5pct_fpr": fz.get("tpr_at_5pct_fpr"), "cases": fz.get("cases"),
                    "generated_at": sm.get("generated_at"), "source": sm.get("source")})
    return sorted(out, key=lambda r: r["timestamp"], reverse=True)


@router.get("/results/{suite}/{ts}", summary="One saved benchmark result with signature check")
def get_result(suite: str, ts: str):
    import re as _re
    if not _re.fullmatch(r"[a-z]+", suite) or not _re.fullmatch(r"[0-9_]+", ts):
        raise HTTPException(400, "bad result id")
    d = settings.home / "benchmarks" / suite / ts
    rj, sig, md = d / "results.json", d / "results.sig", d / "results.md"
    if not rj.exists():
        raise HTTPException(404, "result not found")
    from ..core.keys import verify_signature
    body = rj.read_bytes()
    ok = sig.exists() and verify_signature(platform_keys().public_hex, sha256_bytes(body), sig.read_text().strip())
    return {"summary": json.loads(body), "markdown": md.read_text(encoding="utf-8") if md.exists() else "",
            "signature_valid": bool(ok)}
