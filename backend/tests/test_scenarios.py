"""End-to-end attack laboratory: each controlled scenario must reach its expected decision.

Order matters: the audit-tamper test runs last because a tampered ledger is (correctly)
reported by every later job.
"""
import pytest

from app.database import Finding, Job, SessionLocal
from app.orchestrator.pipeline import run_job, verify_report
from app.services import demo


def _run(name):
    with SessionLocal() as s:
        job, extra = demo.create_scenario_job(s, name)
    run_job(job.id)
    with SessionLocal() as s:
        j = s.get(Job, job.id)
        types = {f.finding_type for f in s.query(Finding).filter_by(job_id=j.id)}
        return j.status, j.decision, j.risk_score, types, j.report, extra


@pytest.mark.parametrize("name", ["clean", "poisoned", "model-substitution", "weight-tamper",
                                  "drift", "inference-tamper"])
def test_scenario_decision(demo_state, name):
    status, decision, risk, types, report, _ = _run(name)
    assert status == "COMPLETED"
    assert decision == demo.SCENARIOS[name]["expect"], (name, risk, types)
    assert verify_report(report), "assurance report signature must verify"
    for f in report.get("findings", []):
        for key in ("reason", "evidence", "confidence", "severity", "recommendation"):
            assert key in f, f"finding missing {key}"


def test_clean_is_low_risk(demo_state):
    _, decision, risk, _, _, _ = _run("clean")
    assert decision == "ACCEPT" and risk < 35


def test_drift_is_never_called_an_attack(demo_state):
    _, decision, _, _, report, _ = _run("drift")
    assert decision == "REVIEW"
    drift = [f for f in report["findings"] if f["engine"] == "drift"]
    assert drift and all(f["severity"] in ("INFO", "LOW", "MEDIUM") for f in drift)


def test_report_tamper_breaks_signature(demo_state):
    *_, report, _ = _run("clean")
    forged = dict(report, decision="ACCEPT", risk_score=0.0)
    forged["decision"] = "QUARANTINE"
    assert not verify_report(forged)


def test_zz_audit_tamper_detected_last(demo_state):
    from app.core.ledger import verify_chain
    from app.database import AuditBlock
    with SessionLocal() as s:
        assert verify_chain(s)["valid"]
        idx = s.query(AuditBlock).order_by(AuditBlock.index.desc()).first().index - 1
        demo.tamper_audit_block(s, idx)
        res = verify_chain(s)
        assert not res["valid"] and res["first_invalid_index"] == idx
        statuses = {b["index"]: b["status"] for b in res["blocks"]}
        assert statuses[idx] == "TAMPERED"
        assert all(statuses[i] in ("UNTRUSTED_DOWNSTREAM", "TAMPERED") for i in statuses if i > idx)
        assert all(statuses[i] == "VALID" for i in statuses if i < idx)
