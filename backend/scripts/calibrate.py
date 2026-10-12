"""Fit a reference baseline on CLEAN calibration data only, and measure its false-positive
rate on a separate clean hold-out set (never on attack data).

    python scripts/calibrate.py --dataset DS-CALIB --holdout DS-HOLDOUT --name "CIFAR-10 clean"
"""
from __future__ import annotations

import argparse

from _common import init


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, help="clean calibration dataset id")
    ap.add_argument("--holdout", help="clean hold-out dataset id to measure false alarms")
    ap.add_argument("--name", default="calibrated baseline")
    a = ap.parse_args()
    init()
    from app.database import Asset, Job, SessionLocal
    from app.orchestrator.pipeline import run_job
    from app.services.baseline import build_baseline
    from app.services.jobs import create_job
    with SessionLocal() as s:
        ds = s.get(Asset, a.dataset)
        if not ds:
            print(f"[x] dataset {a.dataset} not found")
            return 1
        bl = build_baseline(s, ds, a.name)
        print(f"[+] Baseline {bl.id} fitted on {ds.meta.get('sample_count')} clean images "
              f"(embedder {bl.embedder}); file sha256 {bl.file_sha256}")
        from app.services.baseline import load_baseline_arrays
        arr = load_baseline_arrays(bl)
        print(f"    OOD distance thresholds: p95={float(arr['thr_p95']):.3f}  p99={float(arr['thr_p99']):.3f}")
        if not a.holdout:
            return 0
        job = create_job(s, dataset_id=a.holdout, baseline_id=bl.id, label="calibration hold-out check")
    run_job(job.id)
    with SessionLocal() as s:
        j = s.get(Job, job.id)
        drift = (j.report or {}).get("metrics", {}).get("drift", {})
        print(f"[+] Clean hold-out verdict: {j.decision} (risk {j.risk_score})")
        print(f"    OOD rate on clean hold-out: {drift.get('ood_rate')}  (expected ~0.01 at p99)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
