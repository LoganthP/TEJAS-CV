"""Inference chain tampering attacks: output_edit, replay, reorder.

Tests that the inference provenance ledger and attestation mechanisms
detect forged outputs, broken hash chains, and replayed tokens.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..core.hashing import sha256_bytes
from ..core.keys import red_team_keys
from ..database import InferenceRecord


def attack_output_edit(session: Session, seq: int, forged_class: str = "water") -> dict[str, Any]:
    """Modifies the output payload of an inference record without recalculating hashes."""
    rec = session.query(InferenceRecord).filter_by(seq=seq).first()
    if not rec:
        raise ValueError(f"Inference record with seq {seq} not found")

    orig_output = dict(rec.output or {})
    forged_output = dict(orig_output)
    forged_output["top_class"] = forged_class
    forged_output["forged"] = True

    rec.output = forged_output
    session.commit()

    manifest = {
        "attack": "output_edit",
        "seq": seq,
        "record_id": rec.id,
        "original_top_class": orig_output.get("top_class"),
        "forged_top_class": forged_class,
    }
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    sig = red_team_keys().sign(sha256_bytes(manifest_bytes))
    return {"manifest": manifest, "signature": sig}


def attack_reorder(session: Session, seq_a: int, seq_b: int) -> dict[str, Any]:
    """Swaps the sequence order or previous_hash links of two inference records."""
    rec_a = session.query(InferenceRecord).filter_by(seq=seq_a).first()
    rec_b = session.query(InferenceRecord).filter_by(seq=seq_b).first()
    if not rec_a or not rec_b:
        raise ValueError("Both inference records must exist to reorder")

    # Use a temporary negative seq to avoid UNIQUE constraint collision
    rec_a.seq = -999999
    session.flush()
    rec_b.seq = seq_a
    session.flush()
    rec_a.seq = seq_b
    session.commit()

    manifest = {
        "attack": "reorder",
        "swapped_seqs": [seq_a, seq_b],
        "record_ids": [rec_a.id, rec_b.id],
    }
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    sig = red_team_keys().sign(sha256_bytes(manifest_bytes))
    return {"manifest": manifest, "signature": sig}


def attack_replay(session: Session, seq: int) -> dict[str, Any]:
    """Prepares a replay attack manifest for an existing valid record."""
    rec = session.query(InferenceRecord).filter_by(seq=seq).first()
    if not rec:
        raise ValueError(f"Inference record with seq {seq} not found")

    manifest = {
        "attack": "replay",
        "seq": seq,
        "record_id": rec.id,
        "nonce": rec.nonce,
        "record_hash": rec.record_hash,
    }
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    sig = red_team_keys().sign(sha256_bytes(manifest_bytes))
    return {"manifest": manifest, "signature": sig, "presented_record": rec}
