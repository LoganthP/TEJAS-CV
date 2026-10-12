"""EVIDENCE FUSION + DECISION ENGINE

1. Engine score  = noisy-OR of its findings: 100 * (1 - prod(1 - score_i/100)).
   Independent pieces of evidence reinforce each other but never exceed 100.
2. Risk          = blend * max(engine scores) + (1 - blend) * weighted mean(engine scores).
   The max term stops one severe engine from being diluted by clean ones.
3. Decision      = thresholds (ACCEPT < 35 <= REVIEW < 70 <= QUARANTINE), then
   explicit, named policy rules that can only be explained, never hidden.
4. Confidence    = evidence confidence x analysis coverage (unavailable checks lower it).

The weights and thresholds are prototype configuration (see config.py), not a claim of
a universal scientifically optimal weighting.
"""
from __future__ import annotations

from typing import Any

from ..config import settings
from ..engines.base import EngineResult, Finding

ACTIONS = {
    "ACCEPT": "Assets may proceed to operational use. Continue routine monitoring.",
    "REVIEW": "Hold for analyst review before operational use. Examine the listed evidence.",
    "QUARANTINE": "Do not deploy. Isolate the affected assets and start an investigation.",
}
_RANK = {"ACCEPT": 0, "REVIEW": 1, "QUARANTINE": 2}


def engine_score(findings: list[Finding]) -> float:
    p = 1.0
    for f in findings:
        p *= 1 - min(99.0, f.score) / 100
    return round(100 * (1 - p), 1)


def fuse(results: dict[str, EngineResult]) -> dict[str, Any]:
    w = settings.fusion_weights
    scores = {e: engine_score(r.findings) for e, r in results.items()}
    weighted = sum(w[e] * scores[e] for e in scores) / sum(w[e] for e in scores)
    top = max(scores.values()) if scores else 0.0
    blend = settings.fusion_max_blend
    risk = round(blend * top + (1 - blend) * weighted, 1)

    decision = ("QUARANTINE" if risk >= settings.quarantine_threshold
                else "REVIEW" if risk >= settings.review_threshold else "ACCEPT")
    rules: list[dict] = []
    all_f = [f for r in results.values() for f in r.findings]

    def floor(target: str, rule_id: str, text: str):
        nonlocal decision
        if _RANK[target] > _RANK[decision]:
            decision = target
            rules.append({"rule": rule_id, "effect": f"raised to {target}", "reason": text})

    crit = [f for f in all_f if f.severity == "CRITICAL" and f.confidence >= 0.9]
    if crit:
        floor("QUARANTINE", "R1-CRITICAL-EVIDENCE",
              f"Critical finding(s) with high confidence: {', '.join(sorted({f.finding_type for f in crit}))}")
    high_mp = [f for f in all_f if f.severity == "HIGH" and f.confidence >= 0.8
               and f.engine in ("model", "provenance")]
    if high_mp:
        floor("QUARANTINE", "R2-INTEGRITY-FAILURE",
              f"High-confidence model/provenance integrity failure: "
              f"{', '.join(sorted({f.finding_type for f in high_mp}))}")
    high_data = [f for f in all_f if f.severity == "HIGH" and f.confidence >= 0.8 and f.engine == "data"]
    if len(high_data) >= 2:
        floor("QUARANTINE", "R3-CORROBORATED-POISONING",
              "Two or more independent high-confidence data-poisoning indicators corroborate each other")
    elif high_data:
        floor("REVIEW", "R3b-POISONING-INDICATOR", "A high-confidence data-integrity indicator requires review")
    if any(f.finding_type == "UNVERIFIED_MODEL" for f in all_f):
        floor("REVIEW", "R4-ZERO-TRUST-MODEL", "Model has no trusted fingerprint; it cannot be auto-accepted")
    if any(f.finding_type == "SIGNIFICANT_DISTRIBUTION_SHIFT" for f in all_f):
        floor("REVIEW", "R5-DRIFT-REVIEW", "Significant distribution shift requires human review")

    material = [f for f in all_f if f.score >= 20]
    if decision == "QUARANTINE" and material and all(f.engine == "drift" for f in material):
        decision = "REVIEW"
        rules.append({"rule": "R6-DRIFT-IS-NOT-ATTACK", "effect": "capped at REVIEW",
                      "reason": "Only distribution-shift evidence present; drift alone does not prove attack"})

    executed = sum(1 for r in results.values() for c in r.checks if c.status in ("PASSED", "FLAGGED"))
    unavailable = sum(1 for r in results.values() for c in r.checks if c.status in ("UNAVAILABLE", "ERROR"))
    coverage = executed / max(1, executed + unavailable)
    if material:
        ev_conf = sum(f.confidence * f.score for f in material) / sum(f.score for f in material)
    else:
        ev_conf = 0.9  # absence of evidence within the executed checks
    confidence = round(ev_conf * (0.6 + 0.4 * coverage), 3)

    reasons = sorted(all_f, key=lambda f: -f.score)[:5]
    return {
        "risk_score": risk, "decision": decision, "confidence": confidence,
        "engine_scores": scores, "weighted_mean": round(weighted, 1), "max_engine": top,
        "coverage": round(coverage, 3), "checks_executed": executed, "checks_unavailable": unavailable,
        "rules_fired": rules, "recommended_action": ACTIONS[decision],
        "primary_reasons": [{"engine": f.engine, "type": f.finding_type, "severity": f.severity,
                             "confidence": f.confidence, "title": f.title} for f in reasons if f.score > 0],
        "method": {"engine_score": "noisy-OR over finding scores", "weights": settings.fusion_weights,
                   "max_blend": blend, "thresholds": {"review": settings.review_threshold,
                                                      "quarantine": settings.quarantine_threshold}},
    }
