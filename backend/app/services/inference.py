"""Inference provenance: binds model identity + input + output into a signed, chained record.

record_hash = SHA256(canonical{seq, model_asset_id, model_hash, input_hash, output_hash,
                               timestamp, nonce, previous_hash})
"""
from __future__ import annotations

import io
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from sqlalchemy.orm import Session

from ..adapters.registry import load_adapter
from ..config import settings
from ..core.hashing import sha256_bytes, sha256_file, sha256_json
from ..core.keys import platform_keys, verify_signature
from ..core.ledger import GENESIS_PREV, append_block
from ..database import Asset, InferenceRecord, iso_now

_lock = threading.Lock()


def record_core(r: InferenceRecord) -> dict[str, Any]:
    return {"seq": r.seq, "model_asset_id": r.model_asset_id, "model_hash": r.model_hash,
            "input_hash": r.input_hash, "output_hash": r.output_hash, "timestamp": r.timestamp,
            "nonce": r.nonce, "previous_hash": r.previous_hash}


def run_inference(session: Session, model: Asset, image_bytes: bytes, filename: str = "input") -> InferenceRecord:
    adapter = load_adapter(model.path, model.meta.get("adapter_meta"))
    if not adapter.can_predict:
        raise ValueError("this model format cannot be executed")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    probs = adapter.predict_images([img])[0]
    names = adapter.class_names(len(probs))
    top = int(np.argmax(probs))
    output = {"top_class": names[top], "top_index": top, "confidence": round(float(probs[top]), 6),
              "probabilities": {n: round(float(p), 6) for n, p in zip(names, probs)}}
    input_hash = sha256_bytes(image_bytes)
    ext = Path(filename).suffix.lower() or ".bin"
    in_path = settings.inference_dir / f"{input_hash}{ext}"
    if not in_path.exists():
        in_path.write_bytes(image_bytes)
    model_hash = sha256_file(model.path)  # hash of the file actually executed
    with _lock:
        last = session.query(InferenceRecord).order_by(InferenceRecord.seq.desc()).first()
        rec = InferenceRecord(seq=(last.seq + 1) if last else 1, model_asset_id=model.id,
                              model_hash=model_hash, input_hash=input_hash, input_path=str(in_path),
                              output=output, output_hash=sha256_json(output), timestamp=iso_now(),
                              nonce=secrets.token_hex(16),
                              previous_hash=last.record_hash if last else GENESIS_PREV)
        rec.record_hash = sha256_json(record_core(rec))
        rec.signature = platform_keys().sign(rec.record_hash)
        session.add(rec)
        session.commit()
    append_block(session, "INFERENCE", rec.id,
                 {"record_id": rec.id, "seq": rec.seq, "record_hash": rec.record_hash,
                  "model_asset_id": model.id})
    return rec


def verify_inference_chain(session: Session) -> dict[str, Any]:
    pub = platform_keys().public_hex
    recs = session.query(InferenceRecord).order_by(InferenceRecord.seq).all()
    prev, first_bad, seen_nonces, out = GENESIS_PREV, None, set(), []
    for r in recs:
        issues = []
        if sha256_json(r.output) != r.output_hash:
            issues.append("OUTPUT_ALTERED")
        if sha256_json(record_core(r)) != r.record_hash:
            issues.append("RECORD_ALTERED")
        if r.previous_hash != prev:
            issues.append("LINK_BROKEN")
        if not verify_signature(pub, r.record_hash, r.signature):
            issues.append("BAD_SIGNATURE")
        if r.nonce in seen_nonces:
            issues.append("NONCE_REUSED")
        seen_nonces.add(r.nonce)
        if r.input_path and Path(r.input_path).exists() and sha256_file(r.input_path) != r.input_hash:
            issues.append("INPUT_ALTERED")
        if issues:
            status = "TAMPERED"
            first_bad = r.seq if first_bad is None else first_bad
        else:
            status = "UNTRUSTED_DOWNSTREAM" if first_bad is not None else "VALID"
        out.append({"id": r.id, "seq": r.seq, "model_asset_id": r.model_asset_id,
                    "record_hash": r.record_hash, "previous_hash": r.previous_hash,
                    "top_class": (r.output or {}).get("top_class"), "status": status, "issues": issues})
        prev = r.record_hash
    return {"valid": first_bad is None, "length": len(recs), "first_invalid_seq": first_bad,
            "verified_at": iso_now(), "records": out}


def attest(session: Session, presented: dict[str, Any], max_age_s: float | None = None) -> dict[str, Any]:
    """Verify a record presented by a downstream consumer (e.g. a C2 system).
    Detects forged records, altered outputs, stale results and REPLAY (re-presentation)."""
    checks = {}
    rec = session.get(InferenceRecord, presented.get("id", ""))
    checks["exists_in_ledger"] = rec is not None
    if rec is None:
        return {"verdict": "REJECT", "checks": checks, "reason": "record not in provenance ledger"}
    checks["signature_valid"] = verify_signature(platform_keys().public_hex,
                                                 presented.get("record_hash", ""), presented.get("signature"))
    checks["hash_matches_ledger"] = presented.get("record_hash") == rec.record_hash
    out = presented.get("output")
    checks["output_matches"] = out is None or sha256_json(out) == rec.output_hash
    checks["nonce_matches"] = presented.get("nonce") == rec.nonce
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(rec.timestamp)).total_seconds()
    checks["fresh"] = max_age_s is None or age <= max_age_s
    checks["first_presentation"] = rec.attestations == 0
    rec.attestations += 1
    session.commit()
    ok = all(checks.values())
    reason = "verified" if ok else ("REPLAY: record already presented" if not checks["first_presentation"]
                                    and all(v for k, v in checks.items() if k != "first_presentation")
                                    else "failed: " + ", ".join(k for k, v in checks.items() if not v))
    return {"verdict": "ACCEPT" if ok else "REJECT", "checks": checks, "age_seconds": round(age, 2),
            "attestation_count": rec.attestations, "reason": reason}
