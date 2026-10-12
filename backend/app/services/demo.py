"""Demo laboratory: one-call bootstrap, named scenarios and live tamper actions."""
from __future__ import annotations

import json
import threading
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import settings
from ..core.keys import sign_with
from ..database import Asset, AuditBlock, Base, InferenceRecord, engine
from ..demo import synth
from .baseline import build_baseline
from .inference import run_inference
from .ingestion import register_contributor, register_dataset, register_model, register_trusted_model
from .jobs import create_job

STATE = settings.home / "demo_state.json"
TRUSTED_NAME = "aerial-landcover-v1"

SCENARIOS = {
    "clean": {"title": "A: Trusted pipeline", "expect": "ACCEPT",
              "story": "Clean batch, approved model, valid provenance."},
    "poisoned": {"title": "B: Dataset poisoning", "expect": "QUARANTINE",
                 "story": "Trigger-patch poisoning by one contributor, label-flip duplicates, files altered in transit."},
    "model-substitution": {"title": "C: Model substitution / backdoor", "expect": "QUARANTINE",
                           "story": "Vendor delivers a validly signed model that hides a trigger backdoor."},
    "weight-tamper": {"title": "C2: Silent weight tampering", "expect": "QUARANTINE",
                      "story": "Same architecture, modified weights."},
    "inference-tamper": {"title": "D: Inference tampering", "expect": "QUARANTINE",
                         "story": "A stored inference result is altered after the fact."},
    "drift": {"title": "E: Distribution shift", "expect": "REVIEW",
              "story": "Night / haze / blur conditions. Drift is not an attack."},
}


def load_state() -> dict | None:
    return json.loads(STATE.read_text()) if STATE.exists() else None


_BOOT_LOCK = threading.Lock()


def bootstrap(session: Session, force: bool = False) -> dict:
    """Idempotent and thread-safe: concurrent requests (several scenario buttons, React
    StrictMode double effects) wait for ONE build instead of deleting each other's files."""
    st = load_state()
    if st and not force:
        return st
    with _BOOT_LOCK:
        st = load_state()          # another request may have finished while we waited
        if st and not force:
            return st
        return _bootstrap_locked(session)


def _bootstrap_locked(session: Session) -> dict:
    gen = synth.generate_all(settings.demo_dir)
    keys, meta = gen["contributor_keys"], gen["model_meta"]
    for c in synth.CONTRIBUTORS:
        register_contributor(session, c, gen["contributor_public_keys"][c], organisation="demo")
    ds = {k: register_dataset(session, Path(p), k.replace("_", " "), "lab-alpha").id
          for k, p in gen["datasets"].items()}
    def model(key, name, who):
        p = Path(gen["models"][key])
        from ..core.hashing import sha256_file
        return register_model(session, p, name, who, meta, sign_with(keys[who], sha256_file(p))).id
    models = {"clean": model("clean", "aerial-landcover (approved)", "lab-alpha"),
              "backdoored": model("backdoored", "aerial-landcover (vendor update)", "vendor-charlie"),
              "tampered": model("tampered", "aerial-landcover (patched)", "lab-bravo")}
    register_trusted_model(session, session.get(Asset, models["clean"]), TRUSTED_NAME)
    bl = build_baseline(session, session.get(Asset, ds["reference"]), "Reference: clear-weather aerial")
    st = {"datasets": ds, "models": models, "baseline": bl.id, "trusted_model": TRUSTED_NAME,
          "contributor_private_keys": keys, "scenarios": SCENARIOS}
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(st, indent=2))
    tmp.replace(STATE)             # atomic: readers never see a half-written state file
    return st


def create_scenario_job(session: Session, name: str):
    if name not in SCENARIOS:
        raise KeyError(name)
    st = bootstrap(session)
    d, m = st["datasets"], st["models"]
    common = {"baseline_id": st["baseline"], "trusted_model": st["trusted_model"],
              "label": SCENARIOS[name]["title"]}
    extra = {}
    if name == "clean":
        spec = {"dataset_id": d["clean_batch"], "model_id": m["clean"]}
    elif name == "poisoned":
        spec = {"dataset_id": d["poisoned_batch"], "model_id": m["clean"]}
    elif name == "model-substitution":
        spec = {"dataset_id": d["clean_batch"], "model_id": m["backdoored"]}
    elif name == "weight-tamper":
        spec = {"dataset_id": d["clean_batch"], "model_id": m["tampered"]}
    elif name == "drift":
        spec = {"dataset_id": d["drift_batch"], "model_id": m["clean"]}
    else:  # inference-tamper: produce real inferences on a dedicated edge copy, then alter one
        edge = session.get(Asset, m["clean"])
        edge_id = register_model(session, Path(edge.path), "aerial-landcover (edge node 7)", "lab-alpha",
                                 edge.meta.get("adapter_meta"), edge.signature).id
        imgs = sorted(Path(session.get(Asset, d["clean_batch"]).path).rglob("*.png"))[:: 37][:5]
        recs = [run_inference(session, session.get(Asset, edge_id), p.read_bytes(), p.name) for p in imgs]
        victim = recs[2]
        tamper_inference(session, victim.id)
        spec = {"dataset_id": d["clean_batch"], "model_id": edge_id}
        extra = {"inference_records": [r.id for r in recs], "tampered_record": victim.id}
    job = create_job(session, **spec, **common)
    return job, extra


# ---- live tamper actions (these simulate an attacker with storage access) --------------
# ---- demo tamper backups -------------------------------------------------------------
# The Attack Lab tamper buttons simulate an insider editing the database. For a live demo we
# keep the ORIGINAL value in a side file so the presenter can undo exactly that edit and show
# the chain verifying again. This only restores what the demo tool itself changed; the
# ledger has no general "repair" (a real tampered ledger must be investigated, not fixed).
BACKUPS = settings.home / "demo_tamper_backups.json"


def _backups() -> dict:
    return json.loads(BACKUPS.read_text()) if BACKUPS.exists() else {"audit": {}, "inference": {}}


def _save_backups(b: dict) -> None:
    BACKUPS.write_text(json.dumps(b, indent=1))


def list_demo_tampers() -> dict:
    b = _backups()
    return {"audit_blocks": sorted(int(k) for k in b["audit"]), "inference_records": sorted(b["inference"])}


def restore_audit_block(session: Session, index: int) -> dict:
    b = _backups()
    orig = b["audit"].pop(str(index), None)
    if orig is None:
        raise KeyError(index)
    blk = session.get(AuditBlock, index)
    blk.payload = orig
    session.commit()
    _save_backups(b)
    return {"index": index, "restored": True}


def restore_inference(session: Session, record_id: str) -> dict:
    b = _backups()
    orig = b["inference"].pop(record_id, None)
    if orig is None:
        raise KeyError(record_id)
    r = session.get(InferenceRecord, record_id)
    r.output = orig
    session.commit()
    _save_backups(b)
    return {"record_id": record_id, "restored": True}


def tamper_inference(session: Session, record_id: str) -> dict:
    r = session.get(InferenceRecord, record_id)
    if r is None:
        raise KeyError(record_id)
    before = dict(r.output)
    bk = _backups()
    bk["inference"].setdefault(record_id, before)
    _save_backups(bk)
    classes = list(before.get("probabilities", {}))
    new_cls = next((c for c in classes if c != before.get("top_class")), "unknown")
    r.output = {**before, "top_class": new_cls, "confidence": 0.99}
    session.commit()
    return {"record_id": record_id, "before": before.get("top_class"), "after": new_cls}


def tamper_audit_block(session: Session, index: int) -> dict:
    b = session.get(AuditBlock, index)
    if b is None or index == 0:
        raise KeyError(index)
    payload = dict(b.payload)
    bk = _backups()
    bk["audit"].setdefault(str(index), dict(b.payload))
    _save_backups(bk)
    if "decision" in payload:
        payload["decision"] = "ACCEPT"
    payload["tampered_note"] = "edited directly in the database"
    b.payload = payload
    session.commit()
    return {"index": index, "event_type": b.event_type}


def tamper_model_file(session: Session, asset_id: str) -> dict:
    a = session.get(Asset, asset_id)
    if a is None or a.asset_type != "model":
        raise KeyError(asset_id)
    p = Path(a.path)
    data = bytearray(p.read_bytes())
    data[-5] ^= 0xFF  # flip bits in the last weight bytes
    p.write_bytes(bytes(data))
    return {"asset_id": asset_id, "bytes_modified": 1}


def reset() -> None:
    with _BOOT_LOCK:
        _reset_locked()


def _reset_locked() -> None:
    engine.dispose()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    for d in (settings.datasets_dir, settings.models_dir, settings.baselines_dir, settings.reports_dir,
              settings.inference_dir, settings.demo_dir):
        synth.robust_rmtree(d)
    STATE.unlink(missing_ok=True)
    BACKUPS.unlink(missing_ok=True)
    settings.ensure_dirs()
