"""ANALYSIS ORCHESTRATOR

QUEUED -> LOADING -> FINGERPRINTING -> FEATURE_EXTRACTION -> MODEL_LOADING
       -> PARALLEL_ANALYSIS (data | model | provenance | drift)
       -> FUSION -> DECISION -> AUDIT -> REPORT -> COMPLETED   (or FAILED)

Every transition is persisted on the Job row and streamed over the event bus.
"""
from __future__ import annotations

import json
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ..adapters.registry import load_adapter
from ..config import settings
from ..core.events import bus
from ..core.hashing import sha256_file, sha256_json
from ..core.keys import platform_keys
from ..core.ledger import append_block
from ..database import (Asset, Baseline, DatasetAnnotation, DatasetSample, Finding as FindingRow,
                         Job, SessionLocal, TrustedModel, iso_now, utcnow)
from ..engines import data_assurance, drift, model_assurance, provenance
from ..engines.base import AnalysisContext, EngineResult, run_timed
from ..fusion.risk import fuse
from ..services.baseline import load_baseline_arrays
from ..services.features import extract_features, sample_dicts

ENGINES = {"data": data_assurance.run, "model": model_assurance.run,
           "provenance": provenance.run, "drift": drift.run}
LIMITATIONS = [
    "Trigger testing screens a bank of common trigger shapes; novel or input-specific triggers may evade it.",
    "Drift and OOD results indicate operational change, not malicious intent.",
    "Label-consistency relies on the embedder's notion of visual similarity.",
    "Pickle scanning is static; obfuscated payloads reached through memo references may be missed.",
    "Platform signing key is stored locally in this prototype; production should use an HSM/KMS.",
]

_executor = ThreadPoolExecutor(max_workers=settings.job_workers, thread_name_prefix="tejas-job")


class _Tracker:
    """Maps stage/engine progress onto one 0-100 bar and throttles DB writes."""

    def __init__(self, job_id: str, actor: str | None = None):
        self.job_id = job_id
        self.actor = actor
        self.engine_frac = {e: 0.0 for e in ENGINES}
        self.lock = threading.Lock()

    def stage(self, stage: str, progress: float, message: str, **extra):
        with SessionLocal() as db:
            job = db.get(Job, self.job_id)
            job.stage, job.status, job.progress = stage, extra.pop("status", "RUNNING"), round(progress, 1)
            db.commit()
        bus.publish(self.job_id, "stage", stage=stage, progress=round(progress, 1), message=message, actor=self.actor, **extra)

    def engine(self, engine: str, frac: float, message: str):
        with self.lock:
            self.engine_frac[engine] = frac
            overall = 35 + 50 * sum(self.engine_frac.values()) / len(self.engine_frac)
        bus.publish(self.job_id, "engine_progress", stage="PARALLEL_ANALYSIS", engine=engine,
                    engine_progress=round(frac * 100, 1), progress=round(overall, 1), message=message, actor=self.actor)


def submit_job(job_id: str) -> None:
    _executor.submit(run_job, job_id)


def run_job(job_id: str) -> None:
    from ..core.actor import acting_as
    with SessionLocal() as db:
        j = db.get(Job, job_id)
        who = j.created_by if j else None
    with acting_as(who):          # audit blocks of this job are attributed to whoever requested it
        _run_job(job_id, who)


def _run_job(job_id: str, actor: str | None = None) -> None:
    tr = _Tracker(job_id, actor)
    try:
        _run(job_id, tr)
    except Exception as exc:  # noqa: BLE001
        with SessionLocal() as db:
            job = db.get(Job, job_id)
            job.status, job.stage, job.error = "FAILED", "FAILED", f"{type(exc).__name__}: {exc}"
            job.completed_at = utcnow()
            db.commit()
        bus.publish(job_id, "failed", stage="FAILED", progress=100, message=str(exc),
                    trace=traceback.format_exc()[-1500:], actor=actor)


def _run(job_id: str, tr: _Tracker) -> None:
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        job.started_at = utcnow()
        db.commit()
        dataset = db.get(Asset, job.dataset_id) if job.dataset_id else None
        model = db.get(Asset, job.model_id) if job.model_id else None
        baseline = db.get(Baseline, job.baseline_id) if job.baseline_id else None
        trusted = db.query(TrustedModel).filter_by(name=job.trusted_model).first() if job.trusted_model else None
        samples = sample_dicts(db, dataset.id) if dataset else []
        annos = []
        if dataset:
            db_annos = (
                db.query(DatasetAnnotation)
                .join(DatasetSample, DatasetAnnotation.sample_id == DatasetSample.id)
                .filter(DatasetSample.dataset_id == dataset.id)
                .all()
            )
            annos = [
                {
                    "id": a.id, "sample_id": a.sample_id, "label": a.label, "class_id": a.class_id,
                    "bbox": a.bbox, "area": a.area, "is_valid": a.is_valid,
                    "validation_error": a.validation_error
                }
                for a in db_annos
            ]
    if dataset is None and model is None:
        raise ValueError("a job needs at least a dataset or a model")

    tr.stage("LOADING", 2, "Job created; loading registered assets",
             assets={"dataset": dataset.id if dataset else None, "model": model.id if model else None})
    tr.stage("FINGERPRINTING", 4, "Asset fingerprints loaded (SHA-256 / Merkle root)",
             fingerprints={"dataset_merkle_root": dataset.sha256 if dataset else None,
                           "model_sha256": model.sha256 if model else None})

    ctx = AnalysisContext(job_id=job_id, dataset=dataset, samples=samples, model=model,
                          trusted=trusted, baseline=baseline, annotations=annos)
    if dataset is not None:
        tr.stage("FEATURE_EXTRACTION", 5, "Sampling and extracting features")
        (ctx.analyzed, ctx.embeddings, ctx.grids, ctx.embedder_name, ctx.embedder_note,
         ctx.sampling) = extract_features(dataset, samples, seed=hash(job_id) % 10_000,
                                          progress=lambda f, m: tr.stage("FEATURE_EXTRACTION", 5 + 25 * f, m))
        tr.stage("FEATURE_EXTRACTION", 30, f"Features ready ({ctx.embedder_name})", sampling=ctx.sampling)
    if baseline is not None:
        ctx.baseline_data = load_baseline_arrays(baseline)
    if model is not None:
        tr.stage("MODEL_LOADING", 32, "Loading model through framework adapter")
        try:
            ctx.adapter = load_adapter(model.path, model.meta.get("adapter_meta"))
        except Exception as exc:  # noqa: BLE001
            ctx.adapter_error = f"{type(exc).__name__}: {exc}"

    tr.stage("PARALLEL_ANALYSIS", 35, "Launching assurance engines in parallel")
    ctx.progress = tr.engine
    results: dict[str, EngineResult] = {}
    with ThreadPoolExecutor(max_workers=4, thread_name_prefix="tejas-engine") as pool:
        futures = {name: pool.submit(run_timed, name,
                                     (lambda c, fn=fn: fn(c, settings.max_probe_images)) if name == "model" else fn, ctx)
                   for name, fn in ENGINES.items()}
        for name, fut in futures.items():
            res = fut.result()
            results[name] = res
            bus.publish(job_id, "engine_complete", stage="PARALLEL_ANALYSIS", engine=name,
                        duration_s=res.duration_s, error=res.error,
                        findings=[{"type": f.finding_type, "severity": f.severity, "title": f.title,
                                   "confidence": f.confidence} for f in res.findings],
                        checks=[c.__dict__ for c in res.checks], actor=tr.actor)

    tr.stage("FUSION", 87, "Fusing evidence across engines")
    fusion = fuse(results)
    tr.stage("DECISION", 90, f"Decision: {fusion['decision']}", decision=fusion["decision"],
             risk_score=fusion["risk_score"], confidence=fusion["confidence"])

    tr.stage("AUDIT", 94, "Sealing findings into the audit ledger")
    with SessionLocal() as db:
        finding_hashes, report_findings = [], []
        for res in results.values():
            for f in res.findings:
                d = f.to_dict()
                h = sha256_json(d)
                finding_hashes.append(h)
                report_findings.append(json.loads(json.dumps({**d, "finding_hash": h}, default=str)))
                db.add(FindingRow(job_id=job_id, engine=f.engine, finding_type=f.finding_type,
                                  severity=f.severity, confidence=f.confidence, score=f.score, title=f.title,
                                  reason=f.reason, evidence=json.loads(json.dumps(d["evidence"], default=str)),
                                  recommendation=f.recommendation, subject=f.subject, finding_hash=h))
        db.commit()
        leaves = finding_hashes + [x for x in (dataset.sha256 if dataset else None,
                                               model.sha256 if model else None) if x]
        block = append_block(db, "ASSURANCE_DECISION", job_id,
                             {"job_id": job_id, "decision": fusion["decision"], "risk_score": fusion["risk_score"],
                              "confidence": fusion["confidence"], "engine_scores": fusion["engine_scores"],
                              "dataset_merkle_root": dataset.sha256 if dataset else None,
                              "model_sha256": model.sha256 if model else None,
                              "finding_count": len(finding_hashes)}, leaves=leaves or None)

    tr.stage("REPORT", 97, "Generating signed assurance report")
    report = {
        "report_version": "tejas-cv/1.0", "job_id": job_id, "generated_at": iso_now(),
        "decision": fusion["decision"], "risk_score": fusion["risk_score"], "confidence": fusion["confidence"],
        "recommended_action": fusion["recommended_action"], "primary_reasons": fusion["primary_reasons"],
        "rules_fired": fusion["rules_fired"], "engine_scores": fusion["engine_scores"],
        "fusion": {k: fusion[k] for k in ("weighted_mean", "max_engine", "method")},
        "coverage": {"ratio": fusion["coverage"], "executed": fusion["checks_executed"],
                     "unavailable": fusion["checks_unavailable"],
                     "engines": {e: {"checks": [c.__dict__ for c in r.checks], "duration_s": r.duration_s,
                                     "error": r.error} for e, r in results.items()}},
        "findings": sorted(report_findings, key=lambda f: -f.get("score", 0)),
        "metrics": {e: r.metrics for e, r in results.items()},
        "assets": {"dataset": {"id": dataset.id, "name": dataset.name, "merkle_root": dataset.sha256,
                               "contributor": dataset.contributor} if dataset else None,
                   "model": {"id": model.id, "name": model.name, "sha256": model.sha256,
                             "contributor": model.contributor} if model else None,
                   "trusted_reference": trusted.name if trusted else None,
                   "baseline": baseline.id if baseline else None},
        "analysis": {"embedder": ctx.embedder_name, "embedder_note": ctx.embedder_note, "sampling": ctx.sampling},
        "audit": {"block_index": block.index, "block_hash": block.block_hash, "merkle_root": block.merkle_root},
        "limitations": LIMITATIONS,
        "signing": {"algorithm": "Ed25519", "key_id": platform_keys().key_id},
    }
    report["report_hash"] = sha256_json(report)
    report["signature"] = platform_keys().sign(report["report_hash"])
    Path(settings.reports_dir / f"{job_id}.json").write_text(json.dumps(report, indent=2, default=str))

    with SessionLocal() as db:
        job = db.get(Job, job_id)
        job.risk_score, job.confidence, job.decision = fusion["risk_score"], fusion["confidence"], fusion["decision"]
        job.engine_scores, job.report = fusion["engine_scores"], json.loads(json.dumps(report, default=str))
        job.status, job.stage, job.progress, job.completed_at = "COMPLETED", "COMPLETED", 100.0, utcnow()
        for aid in (job.dataset_id, job.model_id):
            if aid:
                db.get(Asset, aid).status = {"ACCEPT": "ACCEPTED", "REVIEW": "UNDER_REVIEW",
                                             "QUARANTINE": "QUARANTINED"}[fusion["decision"]]
        db.commit()
    bus.publish(job_id, "complete", stage="COMPLETED", progress=100, decision=fusion["decision"],
                risk_score=fusion["risk_score"], confidence=fusion["confidence"],
                engine_scores=fusion["engine_scores"], audit_block=block.index, actor=tr.actor)


def verify_report(report: dict) -> bool:
    from ..core.keys import verify_signature
    body = {k: v for k, v in report.items() if k not in ("report_hash", "signature")}
    return (sha256_json(body) == report.get("report_hash")
            and verify_signature(platform_keys().public_hex, report["report_hash"], report.get("signature")))
