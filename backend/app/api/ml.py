"""Model training API (admin only; enforced by the auth middleware).

POST /api/ml/train starts a background training run on an ingested dataset (or the synthetic
demo set), streams one `train_epoch` event per epoch on /ws/jobs/{run_id}, registers the
resulting ONNX model (uploaded_by = the admin who started it), optionally approves it into
the trusted registry, and returns everything needed to assess it straight away.
"""
from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..core.actor import acting_as, current_actor
from ..core.events import bus
from ..core.hashing import sha256_bytes
from ..core.keys import platform_keys, verify_signature
from ..database import Asset, SessionLocal, get_db, new_id

router = APIRouter(prefix="/api/ml", tags=["training"])
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tejas-train")
_RUNS: dict[str, dict] = {}
_LOCK = threading.Lock()


class PoisonIn(BaseModel):
    target_class: str
    rate: float = Field(0.10, gt=0, lt=0.5)
    position: Literal["top-left", "top-right", "bottom-left", "bottom-right", "center"] = "bottom-right"
    pattern: Literal["white", "black", "checker", "red", "yellow"] = "white"
    size_frac: float = Field(0.125, ge=0.03, le=0.4)


class TrainIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    dataset_id: Optional[str] = Field(None, description="ingested <label>/<image> dataset to train on")
    demo_data: bool = Field(False, description="use the synthetic aerial training set instead")
    epochs: int = Field(10, ge=1, le=50)
    input_size: Literal[32, 64, 96, 128] = 64
    max_per_class: Optional[int] = Field(None, ge=5)
    trust_as: Optional[str] = Field(None, description="approve the result into the trusted registry under this name")
    poison: Optional[PoisonIn] = Field(None, description="red-team: learn a backdoor with this trigger")


def _run(run_id: str, body: TrainIn, folder: Path, who: str) -> None:
    from ..ml.training import PoisonSpec, train_model
    from ..services.ingestion import register_model, register_trusted_model
    with acting_as(who), SessionLocal() as s:
        try:
            bus.publish(run_id, "stage", stage="TRAINING", progress=1, message=f"Training '{body.name}' on {folder.name}")

            def on_epoch(r: dict):
                pct = round(100 * r["epoch"] / body.epochs * 0.9, 1)
                bus.publish(run_id, "train_epoch", stage="TRAINING", progress=pct, epochs=body.epochs,
                            message=f"epoch {r['epoch']}/{body.epochs}  loss {r['loss']:.4f}", **r)
                with _LOCK:
                    _RUNS[run_id].setdefault("history", []).append(r)
            poison = PoisonSpec(**body.poison.model_dump()) if body.poison else None
            rec = train_model(folder, settings.home / "trained_models", f"{body.name}-{run_id[-6:]}",
                              input_size=body.input_size, epochs=body.epochs, max_per_class=body.max_per_class,
                              poison=poison, session=s, on_epoch=on_epoch)
            bus.publish(run_id, "stage", stage="REGISTERING", progress=95, message="Registering the ONNX model")
            asset = register_model(s, Path(rec["model_path"]), body.name, who, rec["adapter_meta"], None, uploaded_by=who)
            meta = dict(asset.meta or {})
            meta["training_record"] = {k: rec[k] for k in ("validation_accuracy", "per_class_validation_accuracy",
                                                           "param_count", "architecture", "training_seconds",
                                                           "record_sha256")}
            meta["training_record"]["path"] = str(Path(rec["model_path"]).with_suffix("")) + ".training_record.json"
            meta["training_record"]["poisoned"] = bool(poison)
            asset.meta = meta
            s.commit()
            if body.trust_as:
                register_trusted_model(s, asset, body.trust_as)
            asr = (rec.get("poison") or {}).get("measured_attack_success_rate")
            result = {"model_asset_id": asset.id, "model_sha256": asset.sha256,
                      "validation_accuracy": rec["validation_accuracy"], "measured_attack_success_rate": asr,
                      "trusted_as": body.trust_as, "param_count": rec["param_count"],
                      "training_seconds": rec["training_seconds"]}
            with _LOCK:
                _RUNS[run_id].update(status="COMPLETED", result=result)
            bus.publish(run_id, "complete", stage="COMPLETED", progress=100,
                        message=f"Model {asset.id} ready (val acc {rec['validation_accuracy']:.1%})", **result)
        except Exception as exc:  # noqa: BLE001
            with _LOCK:
                _RUNS[run_id].update(status="FAILED", error=f"{type(exc).__name__}: {exc}")
            bus.publish(run_id, "failed", stage="FAILED", progress=100, message=str(exc))


@router.post("/train", summary="(admin) Train a CNN on an ingested dataset; live epochs on /ws/jobs/{run_id}")
def start_training(body: TrainIn, request: Request, db: Session = Depends(get_db)):
    from ..ml.training import list_class_folder
    if bool(body.dataset_id) == bool(body.demo_data):
        raise HTTPException(400, "give exactly one of dataset_id or demo_data=true")
    if body.dataset_id:
        ds = db.get(Asset, body.dataset_id)
        if ds is None or ds.asset_type != "dataset":
            raise HTTPException(404, "dataset not found")
        folder = Path(ds.path)
    else:
        from ..ml.demo_data import demo_training_folder
        folder = demo_training_folder(settings)
    try:
        classes, files, _ = list_class_folder(folder)
    except ValueError as exc:
        raise HTTPException(400, f"cannot train on this dataset: {exc}") from exc
    if body.poison and body.poison.target_class not in classes:
        raise HTTPException(400, f"poison target must be one of {classes}")
    if body.trust_as:
        user = (request.scope.get("state") or {}).get("user")
        if user and user.get("role") != "admin":
            raise HTTPException(403, "only an administrator can approve a model as trusted")
        from ..database import TrustedModel
        if db.query(TrustedModel).filter_by(name=body.trust_as).first():
            raise HTTPException(409, f"trusted name '{body.trust_as}' is already used")
    run_id = new_id("TRAIN")
    with _LOCK:
        if any(r["status"] == "RUNNING" for r in _RUNS.values()):
            raise HTTPException(409, "a training run is already in progress")
        _RUNS[run_id] = {"id": run_id, "status": "RUNNING", "name": body.name, "started_by": current_actor(),
                         "classes": classes, "images": len(files), "epochs": body.epochs,
                         "poisoned": bool(body.poison)}
    _pool.submit(_run, run_id, body, folder, current_actor())
    return {"run_id": run_id, "websocket": f"/ws/jobs/{run_id}", "classes": classes, "images": len(files)}


@router.get("/runs", summary="Training runs since the server started")
def list_runs():
    with _LOCK:
        return sorted(_RUNS.values(), key=lambda r: r["id"], reverse=True)


@router.get("/runs/{run_id}")
def get_run(run_id: str):
    with _LOCK:
        r = _RUNS.get(run_id)
    if r is None:
        raise HTTPException(404, "training run not found (runs are kept until the server restarts)")
    return r


@router.get("/models/{asset_id}/training-record", summary="Full signed training record of a trained model")
def training_record(asset_id: str, db: Session = Depends(get_db)):
    a = db.get(Asset, asset_id)
    tr = (a.meta or {}).get("training_record") if a else None
    if not tr:
        raise HTTPException(404, "this model was not trained on this platform")
    p = Path(tr["path"])
    if not p.exists():
        raise HTTPException(404, "training record file is missing")
    body = p.read_bytes()
    sig = p.with_suffix(".sig")
    ok = sig.exists() and verify_signature(platform_keys().public_hex, sha256_bytes(body), sig.read_text().strip())
    import json
    return {"record": json.loads(body), "signature_valid": bool(ok), "record_sha256": sha256_bytes(body)}
