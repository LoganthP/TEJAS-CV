"""Run one assurance job from the command line and print the verdict with its evidence.

    python scripts/audit.py --model MDL-XXXX                       # uses the demo probe data + baseline
    python scripts/audit.py --model MDL-XXXX --trusted aerial-cnn-v1
    python scripts/audit.py --dataset DS-XXXX --baseline BL-XXXX
"""
from __future__ import annotations

import argparse

from _common import init


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model")
    ap.add_argument("--dataset")
    ap.add_argument("--baseline")
    ap.add_argument("--trusted", help="trusted-registry name to compare the model against")
    a = ap.parse_args()
    init()
    from app.database import Finding, Job, SessionLocal
    from app.orchestrator.pipeline import run_job
    from app.services import demo
    from app.services.jobs import create_job
    with SessionLocal() as s:
        st = demo.bootstrap(s)
        dataset = a.dataset or st["datasets"]["clean_batch"]
        baseline = a.baseline or (st["baseline"] if not a.dataset else None)
        job = create_job(s, dataset_id=dataset, model_id=a.model, baseline_id=baseline,
                         trusted_model=a.trusted, label="CLI audit")
    run_job(job.id)
    with SessionLocal() as s:
        j = s.get(Job, job.id)
        print(f"\nDECISION: {j.decision}   risk {j.risk_score}   confidence {j.confidence}   job {j.id}")
        for r in (j.report or {}).get("rules_fired", []):
            print(f"  rule {r['rule']}: {r['reason']}")
        print("\nFindings:")
        for f in s.query(Finding).filter_by(job_id=j.id).order_by(Finding.score.desc()):
            print(f"  {f.severity:<8} [{f.engine}] {f.title}")
            print(f"           why: {f.reason[:150]}")
        print(f"\nSigned report sealed in audit block #{(j.report or {}).get('audit', {}).get('block_index')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
