from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..core.events import bus
from ..database import Asset, Baseline, Finding, Job, get_db
from ..engines.base import SEVERITY_ORDER
from ..orchestrator.pipeline import submit_job, verify_report
from ..services.baseline import build_baseline
from ..services.jobs import JobError, create_job
from . import serializers as S

router = APIRouter(prefix="/api", tags=["analysis"])


class JobIn(BaseModel):
    dataset_id: Optional[str] = None
    model_id: Optional[str] = None
    baseline_id: Optional[str] = None
    trusted_model: Optional[str] = None
    label: Optional[str] = None


@router.post("/jobs", summary="Start an assurance analysis (runs asynchronously)")
def start_job(body: JobIn, request: Request, db: Session = Depends(get_db)):
    from ..core.actor import current_actor
    user = (request.scope.get("state") or {}).get("user")
    creator = user.get("username") if user else current_actor()
    try:
        job = create_job(db, **body.model_dump(), created_by=creator)
    except JobError as exc:
        raise HTTPException(400, str(exc)) from exc
    submit_job(job.id)
    return {**S.job(job), "websocket": f"/ws/jobs/{job.id}"}


@router.get("/jobs")
def list_jobs(limit: int = 50, db: Session = Depends(get_db)):
    return [S.job(j) for j in db.query(Job).order_by(Job.created_at.desc()).limit(limit)]


def _job(db, job_id) -> Job:
    j = db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "job not found")
    return j


@router.get("/jobs/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    return S.job(_job(db, job_id))


@router.get("/jobs/{job_id}/findings")
def job_findings(job_id: str, engine: Optional[str] = None, min_severity: Optional[str] = None,
                 db: Session = Depends(get_db)):
    _job(db, job_id)
    q = db.query(Finding).filter_by(job_id=job_id)
    if engine:
        q = q.filter_by(engine=engine)
    rows = [S.finding(f) for f in q.order_by(Finding.score.desc())]
    if min_severity:
        lvl = SEVERITY_ORDER.index(min_severity.upper())
        rows = [r for r in rows if SEVERITY_ORDER.index(r["severity"]) >= lvl]
    return rows


@router.get("/jobs/{job_id}/report", summary="Signed assurance report")
def job_report(job_id: str, db: Session = Depends(get_db)):
    j = _job(db, job_id)
    if j.status != "COMPLETED":
        raise HTTPException(409, f"job is {j.status}")
    return {"report": j.report, "signature_valid": verify_report(j.report)}


@router.get("/jobs/{job_id}/summary")
def job_summary(job_id: str, db: Session = Depends(get_db)):
    j = _job(db, job_id)
    r = j.report or {}
    counts = {s: 0 for s in SEVERITY_ORDER}
    for f in db.query(Finding).filter_by(job_id=job_id):
        counts[f.severity] += 1
    return {**S.job(j), "severity_counts": counts, "primary_reasons": r.get("primary_reasons", []),
            "rules_fired": r.get("rules_fired", []), "recommended_action": r.get("recommended_action"),
            "coverage": {k: v for k, v in (r.get("coverage") or {}).items() if k != "engines"}}


@router.get("/jobs/{job_id}/events", summary="Event history (polling fallback for the WebSocket)")
def job_events(job_id: str, after: int = 0):
    return [e for e in bus.history(job_id) if e["seq"] > after]


class BaselineIn(BaseModel):
    dataset_id: str
    name: str


@router.post("/baselines", tags=["baselines"])
def create_baseline(body: BaselineIn, db: Session = Depends(get_db)):
    a = db.get(Asset, body.dataset_id)
    if not a or a.asset_type != "dataset":
        raise HTTPException(404, "dataset not found")
    try:
        return S.baseline(build_baseline(db, a, body.name))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/baselines", tags=["baselines"])
def list_baselines(db: Session = Depends(get_db)):
    return [S.baseline(b) for b in db.query(Baseline).order_by(Baseline.created_at.desc())]
