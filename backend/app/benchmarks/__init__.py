"""Benchmark and evaluation module for TEJAS-CV."""
from .metrics import (
    compute_auroc,
    compute_binary_metrics,
    compute_confusion_matrix,
    compute_roc_curve,
    compute_tpr_at_fpr,
)

__all__ = [
    "compute_auroc",
    "compute_binary_metrics",
    "compute_confusion_matrix",
    "compute_roc_curve",
    "compute_tpr_at_fpr",
]
