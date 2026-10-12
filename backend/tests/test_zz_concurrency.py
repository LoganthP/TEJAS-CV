"""Runs last (it resets the lab). Several simultaneous scenario requests must share ONE
bootstrap instead of deleting each other's files (the WinError 145 / empty-centroid crash)."""
import threading

from app.database import SessionLocal
from app.services import demo


def test_concurrent_bootstrap_builds_once(db_ready):
    demo.reset()
    results, errors = [], []

    def worker():
        try:
            with SessionLocal() as s:
                results.append(demo.bootstrap(s)["baseline"])
        except Exception as exc:  # noqa: BLE001
            errors.append(repr(exc))

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, errors
    assert len(set(results)) == 1          # everyone got the same lab
    with SessionLocal() as s:
        job, _ = demo.create_scenario_job(s, "clean")
    assert job.id
