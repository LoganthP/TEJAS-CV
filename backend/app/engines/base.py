"""Shared engine types. Every finding carries reason, evidence, confidence, severity and
a recommendation, as the submission's operational model requires."""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Optional

import numpy as np

SEVERITY_BASE = {"INFO": 0.0, "LOW": 20.0, "MEDIUM": 45.0, "HIGH": 75.0, "CRITICAL": 95.0}
SEVERITY_ORDER = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]


@dataclass
class Finding:
    engine: str
    finding_type: str
    severity: str
    confidence: float
    title: str
    reason: str
    evidence: dict[str, Any]
    recommendation: str
    subject: str = ""
    score: Optional[float] = None

    def __post_init__(self):
        self.confidence = round(float(min(1.0, max(0.0, self.confidence))), 3)
        if self.score is None:
            self.score = round(SEVERITY_BASE[self.severity] * self.confidence, 2)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Check:
    name: str
    status: str  # PASSED | FLAGGED | SKIPPED | UNAVAILABLE | ERROR
    detail: str = ""


@dataclass
class EngineResult:
    engine: str
    findings: list[Finding] = field(default_factory=list)
    checks: list[Check] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    duration_s: float = 0.0
    error: Optional[str] = None

    def add(self, f: Finding) -> Finding:
        self.findings.append(f)
        return f

    def check(self, name: str, status: str, detail: str = "") -> None:
        self.checks.append(Check(name, status, detail))


@dataclass
class AnalysisContext:
    job_id: str
    dataset: Any = None                  # Asset
    samples: list[dict] = field(default_factory=list)       # every registered sample
    analyzed: list[dict] = field(default_factory=list)      # sampled readable subset
    embeddings: Optional[np.ndarray] = None                 # aligned with analyzed
    grids: Optional[np.ndarray] = None                      # (n, 8, 8, 3)
    embedder_name: str = ""
    embedder_note: str = ""
    model: Any = None                    # Asset
    trusted: Any = None                  # TrustedModel
    baseline: Any = None                 # Baseline
    baseline_data: Optional[dict] = None
    adapter: Any = None
    adapter_error: Optional[str] = None
    sampling: dict = field(default_factory=dict)
    annotations: list[dict] = field(default_factory=list)
    progress: Callable[[str, float, str], None] = lambda e, f, m: None


def run_timed(engine: str, fn, ctx: AnalysisContext) -> EngineResult:
    t0 = time.perf_counter()
    try:
        res = fn(ctx)
    except Exception as exc:  # noqa: BLE001 - an engine failure must not hide others
        res = EngineResult(engine, error=f"{type(exc).__name__}: {exc}")
        res.check("engine_execution", "ERROR", res.error)
    res.duration_s = round(time.perf_counter() - t0, 3)
    return res


def robust_z(x: np.ndarray, axis=0) -> np.ndarray:
    med = np.median(x, axis=axis, keepdims=True)
    mad = np.median(np.abs(x - med), axis=axis, keepdims=True)
    return (x - med) / (1.4826 * mad + 1e-9)


def standardize(x: np.ndarray, mean=None, std=None):
    mean = x.mean(axis=0) if mean is None else mean
    std = x.std(axis=0) if std is None else std
    return (x - mean) / (std + 1e-6), mean, std
