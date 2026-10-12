"""Run the full TEJAS-CV attack laboratory from the command line (no UI, no server).

    cd backend
    python scripts/run_demo.py            # all scenarios
    python scripts/run_demo.py drift      # one scenario
    python scripts/run_demo.py --reset    # wipe state first

Prints each decision with its findings, then verifies the audit ledger.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.core.ledger import ensure_genesis, verify_chain  # noqa: E402
from app.database import Finding, Job, SessionLocal, init_db  # noqa: E402
from app.orchestrator.pipeline import run_job  # noqa: E402
from app.services import demo  # noqa: E402

ORDER = ["clean", "poisoned", "model-substitution", "weight-tamper", "drift", "inference-tamper"]
COLOR = {"ACCEPT": "\033[92m", "REVIEW": "\033[93m", "QUARANTINE": "\033[91m"}
END = "\033[0m"


def main(argv: list[str]) -> int:
    settings.ensure_dirs()
    init_db()
    if "--reset" in argv:
        demo.reset()
    names = [a for a in argv if not a.startswith("--")] or ORDER
    with SessionLocal() as s:
        ensure_genesis(s)
        t = time.time()
        demo.bootstrap(s)
        print(f"Attack lab ready ({time.time() - t:.1f}s) — data in {settings.home}\n")
    ok = True
    for name in names:
        with SessionLocal() as s:
            job, _ = demo.create_scenario_job(s, name)
        t = time.time()
        run_job(job.id)
        with SessionLocal() as s:
            j = s.get(Job, job.id)
            expect = demo.SCENARIOS[name]["expect"]
            ok &= j.decision == expect
            mark = "✓" if j.decision == expect else "✗"
            print(f"{mark} {demo.SCENARIOS[name]['title']:<36} {COLOR.get(j.decision, '')}{j.decision:<10}{END}"
                  f" risk {j.risk_score:5.1f}  conf {j.confidence:.2f}  ({time.time() - t:.1f}s)  job {j.id}")
            for f in s.query(Finding).filter_by(job_id=j.id).order_by(Finding.score.desc()).limit(5):
                print(f"      {f.severity:<8} [{f.engine}] {f.title}")
            print()
    with SessionLocal() as s:
        v = verify_chain(s)
    print(f"Audit ledger: {v['length']} blocks, {'VALID' if v['valid'] else 'COMPROMISED'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
