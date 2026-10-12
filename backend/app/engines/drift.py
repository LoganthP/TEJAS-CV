"""DISTRIBUTION SHIFT & ANOMALY ENGINE
Compares the current batch to a trusted reference baseline:
  * OOD rate: share of samples outside the reference envelope (p99 distance)
  * MMD two-sample test with permutation p-value (embedding distribution shift)
  * Environmental variation: KS tests on brightness / contrast / blur / haze / saturation

Drift is NOT evidence of attack. Findings are capped at MEDIUM and recommend review."""
from __future__ import annotations

import numpy as np
from scipy.stats import ks_2samp

from ..core.hashing import sha256_file
from .base import AnalysisContext, EngineResult, Finding

ENGINE = "drift"
ENV_RULES = {  # feature: (direction, condition label)
    "brightness": {-1: "low-light / night conditions", 1: "over-exposure / glare"},
    "haze": {1: "haze / fog / smoke", -1: "darker scenes / deep shadows (night or strong contrast)"},
    "blur": {-1: "blur (defocus / motion / low resolution)", 1: "sharpening or noise"},
    "contrast": {-1: "low contrast (haze, overcast, sensor degradation)", 1: "high contrast"},
    "saturation": {-1: "desaturation (haze, night, sensor change)", 1: "oversaturation"},
}


def mmd_permutation_test(X: np.ndarray, Y: np.ndarray, n_perm: int = 200, seed: int = 0):
    Z = np.vstack([X, Y])
    sq = (Z ** 2).sum(1)
    D = np.maximum(sq[:, None] + sq[None, :] - 2 * Z @ Z.T, 0)
    gamma = 1.0 / (np.median(D[np.triu_indices_from(D, 1)]) + 1e-9)
    K = np.exp(-gamma * D)
    n, m = len(X), len(Y)

    def stat(idx):
        a, b = idx[:n], idx[n:]
        kxx, kyy, kxy = K[np.ix_(a, a)], K[np.ix_(b, b)], K[np.ix_(a, b)]
        return ((kxx.sum() - np.trace(kxx)) / (n * (n - 1)) + (kyy.sum() - np.trace(kyy)) / (m * (m - 1))
                - 2 * kxy.mean())
    base = np.arange(n + m)
    observed = stat(base)
    rng = np.random.default_rng(seed)
    perms = np.array([stat(rng.permutation(base)) for _ in range(n_perm)])
    p = (1 + (perms >= observed).sum()) / (n_perm + 1)
    return float(observed), float(p)


def run(ctx: AnalysisContext) -> EngineResult:
    res = EngineResult(ENGINE)
    if ctx.dataset is None:
        res.check("drift_analysis", "SKIPPED", "no dataset / batch to compare")
        return res
    if ctx.baseline is None or ctx.baseline_data is None:
        for c in ("baseline_integrity", "ood_rate", "embedding_shift", "environmental_variation"):
            res.check(c, "UNAVAILABLE", "no trusted reference baseline selected")
        return res
    ref = f"dataset {ctx.dataset.id}"
    bl, B = ctx.baseline, ctx.baseline_data

    ctx.progress(ENGINE, 0.05, "Verifying baseline integrity")
    if sha256_file(bl.path) != bl.file_sha256:
        res.add(Finding(ENGINE, "BASELINE_TAMPERED", "HIGH", 1.0, "Reference baseline file was modified",
                        "Drift conclusions would rest on an altered reference.",
                        {"baseline": bl.id}, "Rebuild the baseline from a verified dataset.", bl.id))
        res.check("baseline_integrity", "FLAGGED", "hash mismatch")
        return res
    res.check("baseline_integrity", "PASSED", f"baseline {bl.id} verified")
    if bl.embedder != ctx.embedder_name:
        res.check("ood_rate", "UNAVAILABLE", f"baseline built with {bl.embedder}, current {ctx.embedder_name}")
        res.check("embedding_shift", "UNAVAILABLE", "embedder mismatch; rebuild baseline")
    elif ctx.embeddings is not None and len(ctx.embeddings) >= 10:
        ctx.progress(ENGINE, 0.2, "Out-of-distribution scoring")
        Z = (ctx.embeddings - B["emb_mean"]) / (B["emb_std"] + 1e-6)
        d = np.linalg.norm(Z - B["centroid"], axis=1)
        thr = float(B["thr_p99"])
        ood = d > thr
        rate = float(ood.mean())
        res.metrics["ood_rate"] = round(rate, 4)
        res.metrics["drift_index"] = round(100 * max(0.0, rate - 0.01) / 0.99, 1)
        order = np.argsort(-d)
        top = [{"path": ctx.analyzed[i]["relpath"], "distance": round(float(d[i]), 3),
                "label": ctx.analyzed[i]["label"]} for i in order[:10] if ood[i]]
        if rate > 0.05:
            res.add(Finding(ENGINE, "OUT_OF_DISTRIBUTION_SAMPLES", "MEDIUM" if rate > 0.2 else "LOW",
                            0.85, f"{rate:.0%} of the batch lies outside the reference envelope",
                            "These samples are farther from the trusted reference than 99% of reference "
                            "samples were. Expected rate is ~1%.",
                            {"ood_rate": round(rate, 4), "expected_rate": 0.01, "threshold_p99": round(thr, 3),
                             "embedder": ctx.embedder_name, "most_distant": top},
                            "Review: confirm the batch comes from the intended operating domain.", ref))
        res.check("ood_rate", "FLAGGED" if rate > 0.05 else "PASSED", f"{rate:.1%} OOD")

        ctx.progress(ENGINE, 0.45, "MMD two-sample permutation test")
        rng = np.random.default_rng(0)
        X = B["ref_z"]
        Y = Z[rng.choice(len(Z), size=min(len(Z), 200), replace=False)]
        mmd, p = mmd_permutation_test(X, Y)
        res.metrics["mmd"] = {"statistic": round(mmd, 5), "p_value": round(p, 4)}
        significant = p < 0.01 and rate > 0.05
        if significant:
            res.add(Finding(ENGINE, "SIGNIFICANT_DISTRIBUTION_SHIFT", "MEDIUM", 0.85,
                            f"Batch distribution differs from the reference (MMD p={p:.3f})",
                            "A kernel two-sample test rejects the hypothesis that this batch comes from the "
                            "reference distribution. This indicates operational shift; it is NOT evidence of "
                            "an attack by itself.",
                            {"mmd_statistic": round(mmd, 5), "p_value": round(p, 4), "permutations": 200,
                             "reference_n": int(len(X)), "batch_n": int(len(Y)),
                             "interpretation": "Drift != attack"},
                            "REVIEW: validate model performance on the new conditions before relying on it.", ref))
        res.check("embedding_shift", "FLAGGED" if significant else "PASSED", f"MMD p={p:.3f}")
    else:
        res.check("ood_rate", "UNAVAILABLE", "too few embedded samples")

    ctx.progress(ENGINE, 0.8, "Environmental variation checks")
    conditions = []
    for feat, rules in ENV_RULES.items():
        refv = B.get(f"stat_{feat}")
        cur = np.array([s["stats"][feat] for s in ctx.samples if s["readable"] and feat in (s["stats"] or {})])
        if refv is None or len(cur) < 10:
            continue
        ks = ks_2samp(refv, cur)
        iqr = np.subtract(*np.percentile(refv, [75, 25])) + 1e-9
        effect = float((np.median(cur) - np.median(refv)) / iqr)
        # Tail test catches a shifted SUB-population (e.g. 50% of a batch captured at night),
        # which a median shift dilutes. Expected tail share under no shift: 2.5% per side.
        lo, hi = np.percentile(refv, [2.5, 97.5])
        tails = {-1: float((cur < lo).mean()), 1: float((cur > hi).mean())}
        direction = (1 if effect > 0 else -1) if abs(effect) > 0.75 else max(tails, key=tails.get)
        if ks.pvalue < 1e-3 and (abs(effect) > 0.75 or tails[direction] > 0.15):
            conditions.append({"feature": feat, "condition": rules[direction],
                               "effect_size_iqr": round(effect, 2), "ks_p_value": float(f"{ks.pvalue:.2e}"),
                               "share_beyond_reference_tail": round(tails[direction], 3),
                               "expected_tail_share": 0.025,
                               "reference_median": round(float(np.median(refv)), 4),
                               "batch_median": round(float(np.median(cur)), 4)})
    res.metrics["environmental_conditions"] = conditions
    if conditions:
        res.add(Finding(ENGINE, "ENVIRONMENTAL_VARIATION", "LOW", 0.8,
                        "Operating conditions changed: " + "; ".join(sorted({c["condition"] for c in conditions})),
                        "Image statistics shifted significantly relative to the reference in a way that "
                        "matches known environmental conditions. Model accuracy may degrade.",
                        {"conditions": conditions},
                        "REVIEW: evaluate the model on data captured under these conditions.", ref))
    res.check("environmental_variation", "FLAGGED" if conditions else "PASSED", f"{len(conditions)} shift(s)")
    ctx.progress(ENGINE, 1.0, "Drift analysis complete")
    return res
