from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..adapters.registry import adapter_availability
from ..config import settings
from ..core.keys import platform_keys
from ..core.ledger import verify_chain, verify_chain_cached
from ..database import (Asset, AuditBlock, Contributor, Finding, InferenceRecord, Job, TrustedModel, User,
                        get_db)
from ..engines.base import SEVERITY_ORDER
from ..features.embedder import get_embedder
from . import serializers as S

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/system/status")
def status(db: Session = Depends(get_db)):
    emb, note = get_embedder()
    km = platform_keys()
    ledger = verify_chain_cached(db)
    from ..services.ingestion import IMG_EXT
    return {"system": "TEJAS-CV", "version": "1.0.0", "mode": "AIR-GAPPED",
            "external_network_dependencies": [], "embedder": emb.name, "embedder_note": note,
            "adapters": dict(adapter_availability()), "signing": {"algorithm": "Ed25519", "key_id": km.key_id,
                                                             "public_key": km.public_hex},
            "audit_ledger": {"valid": ledger["valid"], "length": ledger["length"], "head": ledger["head_hash"]},
            "fusion": {"weights": settings.fusion_weights, "review_at": settings.review_threshold,
                       "quarantine_at": settings.quarantine_threshold},
            "health": "SECURE" if ledger["valid"] else "COMPROMISED",
            "deployment": {
                "database": db.get_bind().dialect.name,
                "shared_sessions": db.get_bind().dialect.name == "postgresql",
            },
            "limits": {
                "max_archive_bytes": settings.max_archive_bytes,
                "max_files": settings.max_archive_files,
                "max_analysis_samples": settings.max_analysis_samples,
                "accepted_image_types": sorted(list(IMG_EXT)),
            }}


@router.get("/dashboard/summary")
def dashboard(db: Session = Depends(get_db)):
    last = db.query(Job).filter_by(status="COMPLETED").order_by(Job.completed_at.desc()).first()
    decisions = dict(db.query(Job.decision, func.count()).filter(Job.decision.isnot(None)).group_by(Job.decision))
    sev = dict(db.query(Finding.severity, func.count()).group_by(Finding.severity))
    recent = (db.query(Finding, Job.label).join(Job, Job.id == Finding.job_id)
              .order_by(Finding.id.desc()).limit(12).all())
    return {
        "counts": {"datasets": db.query(Asset).filter_by(asset_type="dataset").count(),
                   "models": db.query(Asset).filter_by(asset_type="model").count(),
                   "images": sum((a.meta or {}).get("sample_count", 0)
                                 for a in db.query(Asset).filter_by(asset_type="dataset")),
                   "inferences": db.query(InferenceRecord).count(),
                   "findings": db.query(Finding).count(), "jobs": db.query(Job).count(),
                   "contributors": db.query(Contributor).count(),
                   "trusted_models": db.query(TrustedModel).count(),
                   "audit_blocks": db.query(AuditBlock).count()},
        "active_jobs": [S.job(j) for j in db.query(Job).filter(Job.status.in_(["QUEUED", "RUNNING"]))],
        "latest_job": S.job(last) if last else None,
        "decisions": {k: decisions.get(k, 0) for k in ("ACCEPT", "REVIEW", "QUARANTINE")},
        "severity_counts": {k: sev.get(k, 0) for k in SEVERITY_ORDER},
        "recent_findings": [{**S.finding(f), "job_label": label, "evidence": None} for f, label in recent],
        "asset_status": dict(db.query(Asset.status, func.count()).group_by(Asset.status)),
    }


@router.get("/jobs/{job_id}/provenance-graph", tags=["analysis"],
            summary="Nodes/edges for a React Flow provenance graph")
def provenance_graph(job_id: str, db: Session = Depends(get_db)):
    j = db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "job not found")
    r = j.report or {}
    worst = {}
    for f in db.query(Finding).filter_by(job_id=job_id):
        worst[f.engine] = max(worst.get(f.engine, "INFO"), f.severity, key=SEVERITY_ORDER.index)
    state = lambda e: {"INFO": "ok", "LOW": "ok", "MEDIUM": "warning"}.get(worst.get(e, "INFO"), "danger")
    nodes, edges = [], []

    def node(i, kind, label, status="ok", **data):
        nodes.append({"id": i, "type": kind, "data": {"label": label, "status": status, **data}})

    def edge(a, b, label=""):
        edges.append({"id": f"{a}->{b}", "source": a, "target": b, "label": label})
    ds = db.get(Asset, j.dataset_id) if j.dataset_id else None
    md = db.get(Asset, j.model_id) if j.model_id else None

    def person(username: str | None, target: str, verb: str, when) -> None:
        """Platform account that performed an action, with the timestamp on the edge."""
        if not username:
            return
        nid = f"user:{username}"
        if not any(n["id"] == nid for n in nodes):
            u = db.query(User).filter_by(username=username).first()
            node(nid, "user", (u.display_name if u else None) or username, "ok", username=username,
                 role=u.role if u else ("cli" if username.startswith("local:") else "unknown"),
                 avatar=u.avatar if u else None)
        ts = when.isoformat() if hasattr(when, "isoformat") else when
        edges.append({"id": f"{nid}->{target}:{verb}", "source": nid, "target": target,
                      "label": f"{verb} · {ts[:19].replace('T', ' ')} UTC" if ts else verb,
                      "data": {"action": verb, "timestamp": ts, "username": username}})
    if ds:
        for c in (ds.meta or {}).get("contributors", [ds.contributor]):
            node(f"ctb:{c}", "contributor", c)
            edge(f"ctb:{c}", "dataset", "contributed")
        node("dataset", "dataset", ds.name, state("data"), merkle_root=ds.sha256,
             samples=(ds.meta or {}).get("sample_count"), uploaded_by=ds.uploaded_by,
             uploaded_at=ds.created_at.isoformat() if ds.created_at else None)
        person(ds.uploaded_by, "dataset", "uploaded", ds.created_at)
        edge("dataset", "engine:data")
        edge("dataset", "engine:drift")
    if md:
        node(f"ctb:{md.contributor}:m", "contributor", md.contributor)
        edge(f"ctb:{md.contributor}:m", "model", "supplied")
        node("model", "model", md.name, state("model"), sha256=md.sha256, uploaded_by=md.uploaded_by,
             uploaded_at=md.created_at.isoformat() if md.created_at else None,
             trained_here=bool((md.meta or {}).get("training_record")))
        person(md.uploaded_by, "model",
               "trained" if (md.meta or {}).get("training_record") else "uploaded", md.created_at)
        edge("model", "engine:model")
        inf = db.query(InferenceRecord).filter_by(model_asset_id=md.id).count()
        if inf:
            node("inference", "inference", f"{inf} inference record(s)", state("provenance"))
            edge("model", "inference", "produced")
            edge("inference", "engine:provenance")
    for e in ("data", "model", "provenance", "drift"):
        node(f"engine:{e}", "engine", e.upper(), state(e), score=(j.engine_scores or {}).get(e))
        edge(f"engine:{e}", "fusion")
    if ds or md:
        edge("dataset" if ds else "model", "engine:provenance")
    node("fusion", "fusion", "Evidence fusion", "ok", risk=j.risk_score, confidence=j.confidence,
         created_by=j.created_by, created_at=j.created_at.isoformat() if j.created_at else None)
    person(j.created_by, "fusion", "requested assessment", j.created_at)
    decision_status = {"ACCEPT": "ok", "REVIEW": "warning", "QUARANTINE": "danger"}.get(j.decision or "", "pending")
    node("decision", "decision", j.decision or j.status, decision_status,
         created_by=j.created_by, decision=j.decision, job_status=j.status,
         completed_at=j.completed_at.isoformat() if j.completed_at else None)
    edge("fusion", "decision")
    if j.decision in ("REVIEW", "QUARANTINE"):
        person(j.created_by, "decision", f"process held ({j.decision.lower()})", j.completed_at or j.created_at)
    audit = r.get("audit") or {}
    if audit:
        node("audit", "audit", f"Audit block #{audit.get('block_index')}", "ok", block_hash=audit.get("block_hash"))
        edge("decision", "audit", "sealed")
    return {"nodes": nodes, "edges": edges}


@router.post("/api/system/verify-independent", tags=["system"],
             summary="Run scripts/verify_independent.py in a separate process (imports no TEJAS code)")
def verify_independent():
    import subprocess
    import sys
    from ..config import BACKEND_ROOT
    script = BACKEND_ROOT / "scripts" / "verify_independent.py"
    try:
        p = subprocess.run([sys.executable, str(script), "--home", str(settings.home), "--rehash-files"],
                           capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "independent verifier timed out after 120 s")
    return {"exit_code": p.returncode, "ok": p.returncode == 0, "lines": p.stdout.splitlines(),
            "stderr": p.stderr[-2000:]}
