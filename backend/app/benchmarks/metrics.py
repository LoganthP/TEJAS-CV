"""Benchmark metrics calculation: Confusion matrices, PR/F1, AUROC, and ROC curves."""
from __future__ import annotations

from typing import Any, Sequence
import numpy as np


def compute_confusion_matrix(
    y_true: Sequence[int | bool],
    y_pred: Sequence[int | bool],
) -> dict[str, int]:
    """Calculates TP, FP, FN, TN."""
    tp, fp, fn, tn = 0, 0, 0, 0
    for yt, yp in zip(y_true, y_pred):
        yt_bool = bool(yt)
        yp_bool = bool(yp)
        if yt_bool and yp_bool:
            tp += 1
        elif not yt_bool and yp_bool:
            fp += 1
        elif yt_bool and not yp_bool:
            fn += 1
        else:
            tn += 1
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn}


def compute_binary_metrics(
    y_true: Sequence[int | bool],
    y_pred: Sequence[int | bool],
) -> dict[str, float | int]:
    """Calculates Precision, Recall, F1, Accuracy, and counts."""
    cm = compute_confusion_matrix(y_true, y_pred)
    tp, fp, fn, tn = cm["tp"], cm["fp"], cm["fn"], cm["tn"]

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    total = tp + fp + fn + tn
    accuracy = (tp + tn) / total if total > 0 else 0.0

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1": round(float(f1), 4),
        "accuracy": round(float(accuracy), 4),
        "total": total,
    }


def compute_roc_curve(
    y_true: Sequence[int | bool],
    y_scores: Sequence[float],
    num_thresholds: int = 50,
) -> list[dict[str, float]]:
    """Generates ROC points (threshold, fpr, tpr)."""
    y_t = [bool(x) for x in y_true]
    scores = np.array(y_scores, dtype=np.float64)
    positives = sum(y_t)
    negatives = len(y_t) - positives

    if positives == 0 or negatives == 0:
        return [{"threshold": 0.0, "fpr": 0.0, "tpr": 0.0}, {"threshold": 100.0, "fpr": 0.0, "tpr": 0.0}]

    thresholds = np.linspace(0.0, 100.0, num_thresholds)
    curve = []
    for thr in thresholds:
        y_pred = scores >= thr
        tp = sum(1 for yt, yp in zip(y_t, y_pred) if yt and yp)
        fp = sum(1 for yt, yp in zip(y_t, y_pred) if not yt and yp)
        tpr = tp / positives
        fpr = fp / negatives
        curve.append({
            "threshold": round(float(thr), 2),
            "tpr": round(float(tpr), 4),
            "fpr": round(float(fpr), 4),
        })
    return curve


def compute_auroc(
    y_true: Sequence[int | bool],
    y_scores: Sequence[float],
) -> float:
    """Exact AUROC (Mann-Whitney U): the probability that a random positive scores higher than
    a random negative, ties counting one half. No threshold grid, so no approximation."""
    y = np.array([bool(v) for v in y_true])
    s = np.asarray(y_scores, np.float64)
    pos, neg = s[y], s[~y]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    greater = (pos[:, None] > neg[None, :]).sum()
    ties = (pos[:, None] == neg[None, :]).sum()
    return round(float((greater + 0.5 * ties) / (len(pos) * len(neg))), 4)


def compute_tpr_at_fpr(
    y_true: Sequence[int | bool],
    y_scores: Sequence[float],
    target_fpr: float = 0.05,
) -> float:
    """Highest TPR over all exact score thresholds whose FPR <= target_fpr."""
    y = np.array([bool(v) for v in y_true])
    s = np.asarray(y_scores, np.float64)
    if y.all() or (~y).all():
        return float("nan")
    best = 0.0
    for thr in np.unique(np.concatenate([s, [np.inf]])):
        pred = s >= thr
        fpr = (pred & ~y).sum() / (~y).sum()
        if fpr <= target_fpr:
            best = max(best, (pred & y).sum() / y.sum())
    return round(float(best), 4)
