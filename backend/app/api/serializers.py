from __future__ import annotations

from ..database import Asset, Baseline, Contributor, Finding, InferenceRecord, Job, TrustedModel


def asset(a: Asset) -> dict:
    return {"id": a.id, "asset_type": a.asset_type, "name": a.name, "contributor": a.contributor,
            "sha256": a.sha256, "size": a.size, "signed": bool(a.signature), "status": a.status,
            "meta": a.meta, "created_at": a.created_at.isoformat(), "uploaded_by": a.uploaded_by}


def job(j: Job, full: bool = False) -> dict:
    d = {"id": j.id, "label": j.label, "dataset_id": j.dataset_id, "model_id": j.model_id,
         "baseline_id": j.baseline_id, "trusted_model": j.trusted_model, "status": j.status, "stage": j.stage,
         "progress": j.progress, "risk_score": j.risk_score, "confidence": j.confidence, "decision": j.decision,
         "engine_scores": j.engine_scores, "error": j.error, "created_at": j.created_at.isoformat(),
         "started_at": j.started_at.isoformat() if j.started_at else None,
         "completed_at": j.completed_at.isoformat() if j.completed_at else None,
         "created_by": j.created_by}
    if full:
        d["report"] = j.report
    return d


def finding(f: Finding) -> dict:
    return {"id": f.id, "job_id": f.job_id, "engine": f.engine, "finding_type": f.finding_type,
            "severity": f.severity, "confidence": f.confidence, "score": f.score, "title": f.title,
            "reason": f.reason, "evidence": f.evidence, "recommendation": f.recommendation,
            "subject": f.subject, "finding_hash": f.finding_hash}


def inference(r: InferenceRecord) -> dict:
    return {"id": r.id, "seq": r.seq, "model_asset_id": r.model_asset_id, "model_hash": r.model_hash,
            "input_hash": r.input_hash, "output": r.output, "output_hash": r.output_hash,
            "timestamp": r.timestamp, "nonce": r.nonce, "previous_hash": r.previous_hash,
            "record_hash": r.record_hash, "signature": r.signature, "attestations": r.attestations,
            "created_by": r.created_by}


def contributor(c: Contributor) -> dict:
    return {"id": c.id, "name": c.name, "public_key": c.public_key, "organisation": c.organisation,
            "created_at": c.created_at.isoformat()}


def trusted(t: TrustedModel) -> dict:
    return {"id": t.id, "name": t.name, "sha256": t.sha256, "structure_hash": t.structure_hash,
            "param_count": t.param_count, "model_format": t.model_format, "source_asset_id": t.source_asset_id,
            "has_behavior_fingerprint": bool(t.behavior_fingerprint), "signature": t.signature,
            "registered_at": t.registered_at}


def baseline(b: Baseline) -> dict:
    return {"id": b.id, "name": b.name, "dataset_id": b.dataset_id, "embedder": b.embedder,
            "file_sha256": b.file_sha256, "stats": b.stats, "created_at": b.created_at.isoformat()}
