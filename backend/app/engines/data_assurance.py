"""DATA ASSURANCE ENGINE
Detects poisoning, mislabeling, duplication, corruption, dataset manipulation and
concentrates suspicious signals per contributor (contributor-level attribution)."""
from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial.distance import jensenshannon

from ..config import settings
from ..features.image_stats import STAT_KEYS
from .base import AnalysisContext, EngineResult, Finding, robust_z, standardize

ENGINE = "data"
_POP = np.array([bin(i).count("1") for i in range(256)], np.uint8)


def _uf_clusters(n: int, pairs) -> list[list[int]]:
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for i, j in pairs:
        parent[find(i)] = find(j)
    groups = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)
    return [g for g in groups.values() if len(g) > 1]


def _near_duplicate_pairs(phashes: list[str], thr: int):
    arr = np.array([int(h, 16) for h in phashes], dtype=np.uint64).view(np.uint8).reshape(-1, 8)
    pairs = []
    for s in range(0, len(arr), 256):
        d = _POP[arr[s:s + 256, None, :] ^ arr[None, :, :]].sum(-1)
        ii, jj = np.nonzero(d <= thr)
        for i, j in zip(ii + s, jj):
            if j > i:
                pairs.append((int(i), int(j), int(d[i - s, j])))
    return pairs


def _run_detection_data_checks(ctx: AnalysisContext, res: EngineResult, ref: str, flagged: dict) -> None:
    annos = ctx.annotations
    if not annos:
        return

    # 1. Annotation validity
    invalid = [a for a in annos if not a.get("is_valid", True) or a.get("validation_error")]
    if invalid:
        res.add(Finding(
            ENGINE, "INVALID_BOX_ANNOTATIONS", "MEDIUM", 0.95,
            f"{len(invalid)} invalid or out-of-bounds bounding box(es)",
            "Bounding box coordinates violate image boundaries, are degenerate, or use unrecognized class IDs.",
            {"count": len(invalid), "errors": [a.get("validation_error") for a in invalid[:20]]},
            "Fix annotation pipeline or filter out invalid boxes.", ref
        ))
    res.check("annotation_validity", "FLAGGED" if invalid else "PASSED", f"{len(invalid)}/{len(annos)} invalid")

    # 2. Per-class box counts vs reference
    valid = [a for a in annos if a.get("is_valid", True)]
    counts = Counter(a["label"] for a in valid)
    total = sum(counts.values()) or 1
    dist = {k: round(v / total, 4) for k, v in sorted(counts.items())}
    res.metrics["detection_class_distribution"] = dist

    ref_dist = (ctx.baseline.stats or {}).get("detection_class_distribution") if ctx.baseline else None
    if ref_dist:
        labels = sorted(set(ref_dist) | set(dist))
        p = np.array([ref_dist.get(k, 0) for k in labels]) + 1e-9
        q = np.array([dist.get(k, 0) for k in labels]) + 1e-9
        js = float(jensenshannon(p, q, base=2))
        res.metrics["detection_class_js_distance"] = round(js, 4)
        if js > 0.15:
            res.add(Finding(
                ENGINE, "DETECTION_CLASS_DISTRIBUTION_ANOMALY", "MEDIUM" if js > 0.3 else "LOW",
                0.8, f"Object box distribution deviates from reference (JS distance {js:.2f})",
                "Object class proportions deviate significantly from the baseline distribution.",
                {"observed": dist, "reference": ref_dist, "js_distance": round(js, 4)},
                "Review class balance and sampling strategy.", ref
            ))
        res.check("detection_box_distribution", "FLAGGED" if js > 0.15 else "PASSED", f"JS distance {js:.3f}")
    else:
        ratio = max(counts.values()) / max(1, min(counts.values())) if counts else 0
        res.check("detection_box_distribution", "PASSED" if ratio <= 15 else "FLAGGED", f"imbalance ratio {ratio:.1f}")

    # 3. Box size and aspect-ratio outliers
    areas = np.array([a["area"] for a in valid if a.get("area", 0) > 0])
    ratios = np.array([
        (a["bbox"][2] - a["bbox"][0]) / max(1e-4, a["bbox"][3] - a["bbox"][1])
        for a in valid if len(a.get("bbox", [])) == 4
    ])
    extreme = 0
    if len(areas) >= 10:
        za = np.abs(robust_z(areas))
        zr = np.abs(robust_z(ratios))
        extreme = int(((za > 5.0) | (zr > 5.0)).sum())
    if extreme > 0:
        res.add(Finding(
            ENGINE, "BOX_GEOMETRY_OUTLIERS", "LOW", 0.7,
            f"{extreme} bounding box(es) have extreme geometric proportions",
            "Unusually large, small, or skewed aspect-ratio boxes detected relative to the distribution.",
            {"outliers": extreme, "total_boxes": len(valid)},
            "Verify that annotation bounds fit the objects accurately.", ref
        ))
    res.check("box_geometry_outliers", "FLAGGED" if extreme > 0 else "PASSED", f"{extreme} outliers")

    # 4. Exact and near-duplicate images with conflicting annotations
    annos_by_sample = defaultdict(list)
    for a in valid:
        annos_by_sample[a["sample_id"]].append(a)

    by_sha = defaultdict(list)
    for s in ctx.samples:
        by_sha[s["sha256"]].append(s)
    dup_conflicts = 0
    for g in by_sha.values():
        if len(g) > 1:
            box_sets = [sorted(a["label"] for a in annos_by_sample[s["id"]]) for s in g]
            if len(set(tuple(x) for x in box_sets)) > 1:
                dup_conflicts += 1
                for s in g:
                    flagged[s["id"]].add("conflicting_detection_duplicate")
    if dup_conflicts > 0:
        res.add(Finding(
            ENGINE, "CONFLICTING_DETECTION_DUPLICATES", "HIGH", 0.92,
            f"{dup_conflicts} duplicate image group(s) have conflicting box annotations",
            "Identical image bytes have differing bounding boxes or missing object labels.",
            {"conflicting_groups": dup_conflicts},
            "Reconcile object annotations across duplicate images.", ref
        ))
    res.check("conflicting_detection_duplicates", "FLAGGED" if dup_conflicts > 0 else "PASSED", f"{dup_conflicts} conflicts")

    # 5 & 6. Crop-level label consistency and recurring patch screen
    sample_id_to_sample = {s["id"]: s for s in ctx.samples}
    root = Path(ctx.dataset.path) if ctx.dataset else Path(".")

    crops: list[Image.Image] = []
    crop_labels: list[str] = []
    crop_sample_ids: list[int] = []

    for a in valid[:128]:
        s = sample_id_to_sample.get(a["sample_id"])
        if not s or not s.get("readable"):
            continue
        p = root / s["relpath"]
        if not p.exists():
            continue
        try:
            with Image.open(p) as im:
                box = a["bbox"]
                w_box = box[2] - box[0]
                h_box = box[3] - box[1]
                if w_box >= 8 and h_box >= 8:
                    crop = im.convert("RGB").crop((box[0], box[1], box[2], box[3]))
                    crops.append(crop.copy())
                    crop_labels.append(a["label"])
                    crop_sample_ids.append(s["id"])
        except Exception:
            continue

    if len(crops) >= 10:
        crop_feats = np.stack([
            np.asarray(c.resize((16, 16), Image.BILINEAR), np.float32).ravel() / 255.0
            for c in crops
        ])
        Z, _, _ = standardize(crop_feats)
        Zn = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
        sim = Zn @ Zn.T
        np.fill_diagonal(sim, -np.inf)
        k = min(5, len(crops) - 1)
        nn = np.argpartition(-sim, k, axis=1)[:, :k]
        suspects = []
        for i in range(len(crops)):
            lab, cnt = Counter(crop_labels[nn[i][j]] for j in range(k)).most_common(1)[0]
            if lab != crop_labels[i] and cnt / k >= 0.7:
                suspects.append((i, lab, cnt / k))
                flagged[crop_sample_ids[i]].add("crop_label_inconsistent")
        if suspects:
            res.add(Finding(
                ENGINE, "CROP_LABEL_INCONSISTENCY", "MEDIUM", 0.8,
                f"{len(suspects)} object crop(s) visually conflict with nearest crop neighbors",
                "Object crops in visual feature space are dominated by neighbors of a different class.",
                {"suspect_crops": len(suspects), "k": k},
                "Review labels on highlighted object crops.", ref
            ))
        res.check("crop_label_consistency", "FLAGGED" if suspects else "PASSED", f"{len(suspects)}/{len(crops)} inconsistent")
    else:
        res.check("crop_label_consistency", "UNAVAILABLE", "needs >= 10 valid box crops")

    if len(crops) >= 10:
        grid_size = 8
        grids = np.stack([
            np.asarray(c.resize((grid_size, grid_size), Image.BILINEAR), np.float32) / 255.0
            for c in crops
        ])
        c = grid_size
        pad = np.pad(grids, ((0, 0), (1, 1), (1, 1), (0, 0)), mode="constant", constant_values=np.nan)
        neigh = np.stack([pad[:, 1 + dy:1 + dy + c, 1 + dx:1 + dx + c]
                          for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0)])
        dev = np.abs(grids - np.nanmedian(neigh, axis=0)).max(axis=-1)
        med = np.median(dev)
        z = (dev - med) / (1.4826 * np.median(np.abs(dev - med)) + 1e-6)
        anom = (z > 6) & (dev > 0.15)
        loc_counts = anom.sum(axis=0)
        typical = float(np.median(loc_counts))
        min_count = max(3, int(0.04 * len(crops)))
        hot = [(int(r), int(q)) for r, q in zip(*np.nonzero(
            (loc_counts >= min_count) & (loc_counts > 3 * typical + 1)))]
        if hot:
            res.add(Finding(
                ENGINE, "OBJECT_TRIGGER_ARTIFACT", "HIGH", 0.9,
                f"Recurring localized pattern detected inside {len(hot)} cell(s) on object box crops",
                "A fixed-position trigger patch recurs across object crops, characteristic of an object-level backdoor attack.",
                {"hot_cells": hot, "crops_evaluated": len(crops)},
                "Inspect object crops for pasted trigger artifacts.", ref
            ))
        res.check("crop_recurring_patch_screen", "FLAGGED" if hot else "PASSED", f"{len(hot)} hotspot(s)")
    else:
        res.check("crop_recurring_patch_screen", "UNAVAILABLE", "needs >= 10 valid box crops")


def run(ctx: AnalysisContext) -> EngineResult:
    res = EngineResult(ENGINE)
    if ctx.dataset is None:
        res.check("dataset_supplied", "SKIPPED", "no dataset in this job")
        return res
    S, n = ctx.samples, len(ctx.samples)
    flagged: dict[int, set[str]] = defaultdict(set)   # sample id -> reasons
    ref = f"dataset {ctx.dataset.id}"

    # 1. File integrity ------------------------------------------------------------
    ctx.progress(ENGINE, 0.05, "Validating file integrity and formats")
    bad = [s for s in S if not s["readable"]]
    for s in bad:
        flagged[s["id"]].add("corrupt")
    if bad:
        res.add(Finding(ENGINE, "CORRUPT_OR_INVALID_FILES", "MEDIUM", 1.0,
                        f"{len(bad)} unreadable or malformed file(s)",
                        "Files could not be decoded as images or their content does not match "
                        "their declared format. Malformed files can exploit decoders or hide payloads.",
                        {"count": len(bad), "files": [{"path": s["relpath"], "error": s["error"],
                                                        "contributor": s["contributor"]} for s in bad[:25]]},
                        "Remove the files and request clean copies from the contributor.", ref))
    res.check("file_integrity", "FLAGGED" if bad else "PASSED", f"{len(bad)}/{n} unreadable")

    # 2. Exact duplicates (SHA-256) ------------------------------------------------
    ctx.progress(ENGINE, 0.15, "Exact-duplicate analysis (SHA-256)")
    by_sha = defaultdict(list)
    for s in S:
        by_sha[s["sha256"]].append(s)
    dup_groups = [g for g in by_sha.values() if len(g) > 1]
    conflict = [g for g in dup_groups if len({x["label"] for x in g}) > 1]
    same = [g for g in dup_groups if len({x["label"] for x in g}) == 1]
    for g in conflict:
        for x in g:
            flagged[x["id"]].add("label_conflict_duplicate")
    if conflict:
        res.add(Finding(ENGINE, "CONFLICTING_LABEL_DUPLICATES", "HIGH", 0.95,
                        f"{len(conflict)} identical image(s) carry different labels",
                        "Byte-identical images appear under different classes. This is a direct "
                        "signature of label-flipping poisoning or a severe annotation error.",
                        {"groups": [{"sha256": g[0]["sha256"],
                                     "copies": [{"path": x["relpath"], "label": x["label"],
                                                 "contributor": x["contributor"]} for x in g]}
                                    for g in conflict[:15]]},
                        "Quarantine these samples and verify the correct label with the source.", ref))
    if same:
        extra = sum(len(g) - 1 for g in same)
        res.add(Finding(ENGINE, "EXACT_DUPLICATES", "LOW", 1.0,
                        f"{extra} redundant exact duplicate(s)",
                        "Duplicates inflate class weight and can leak between train/test splits.",
                        {"duplicate_groups": len(same), "redundant_files": extra,
                         "examples": [[x["relpath"] for x in g] for g in same[:10]]},
                        "De-duplicate before training.", ref))
    res.check("exact_duplicates", "FLAGGED" if dup_groups else "PASSED",
              f"{len(dup_groups)} groups ({len(conflict)} with conflicting labels)")

    # 3. Near duplicates (perceptual hash) ------------------------------------------
    ctx.progress(ENGINE, 0.25, "Near-duplicate analysis (perceptual hash)")
    ph = [s for s in S if s["readable"] and s["phash"]]
    pairs = [(i, j, d) for i, j, d in _near_duplicate_pairs([s["phash"] for s in ph], settings.phash_threshold)
             if ph[i]["sha256"] != ph[j]["sha256"]]
    clusters = _uf_clusters(len(ph), [(i, j) for i, j, _ in pairs])
    cross = [c for c in clusters if len({ph[k]["label"] for k in c}) > 1]
    for c in cross:
        for k in c:
            flagged[ph[k]["id"]].add("label_conflict_near_duplicate")
    if clusters:
        sev = "MEDIUM" if cross else "LOW"
        res.add(Finding(ENGINE, "NEAR_DUPLICATE_CLUSTERS", sev, 0.9 if cross else 0.85,
                        f"{len(clusters)} near-duplicate cluster(s)"
                        + (f", {len(cross)} spanning different labels" if cross else ""),
                        "Visually near-identical images (re-encoded, resized or lightly edited) were "
                        "found. Clusters that span labels indicate inconsistent or manipulated annotation.",
                        {"threshold_hamming": settings.phash_threshold,
                         "clusters": [{"labels": sorted({ph[k]["label"] for k in c}),
                                       "files": [ph[k]["relpath"] for k in c][:8]} for c in clusters[:15]],
                         "closest_pairs": [{"a": ph[i]["relpath"], "b": ph[j]["relpath"], "distance": d}
                                           for i, j, d in sorted(pairs, key=lambda p: p[2])[:10]]},
                        "Review clusters; keep one representative per cluster.", ref))
    res.check("near_duplicates", "FLAGGED" if clusters else "PASSED",
              f"{len(clusters)} clusters over {len(ph)} images")

    # 4. Class distribution ---------------------------------------------------------
    ctx.progress(ENGINE, 0.35, "Class distribution analysis")
    counts = Counter(s["label"] for s in S if s["readable"])
    total = sum(counts.values()) or 1
    dist = {k: round(v / total, 4) for k, v in sorted(counts.items())}
    res.metrics["class_distribution"] = dist
    ref_dist = (ctx.baseline.stats or {}).get("class_distribution") if ctx.baseline else None
    if ref_dist:
        labels = sorted(set(ref_dist) | set(dist))
        p = np.array([ref_dist.get(k, 0) for k in labels]) + 1e-9
        q = np.array([dist.get(k, 0) for k in labels]) + 1e-9
        js = float(jensenshannon(p, q, base=2))
        unknown = sorted(set(dist) - set(ref_dist))
        res.metrics["class_js_distance"] = round(js, 4)
        if unknown:
            res.add(Finding(ENGINE, "UNKNOWN_CLASSES", "MEDIUM", 0.95,
                            f"Labels not present in the trusted reference: {', '.join(unknown)}",
                            "The dataset introduces classes the reference never contained.",
                            {"unknown_labels": unknown, "reference_labels": sorted(ref_dist)},
                            "Confirm the label schema with the dataset owner.", ref))
        if js > 0.10:
            res.add(Finding(ENGINE, "CLASS_DISTRIBUTION_ANOMALY", "MEDIUM" if js > 0.25 else "LOW",
                            0.8, f"Class balance deviates from the reference (JS distance {js:.2f})",
                            "Label proportions shifted markedly relative to the trusted baseline. "
                            "Poisoning often inflates a target class; operational change can too.",
                            {"reference": ref_dist, "observed": dist, "js_distance": round(js, 4)},
                            "Confirm the collection process explains the change.", ref))
        res.check("class_distribution", "FLAGGED" if (js > 0.10 or unknown) else "PASSED",
                  f"JS distance {js:.3f} vs baseline")
    else:
        ratio = max(counts.values()) / max(1, min(counts.values())) if counts else 0
        if ratio > 10:
            res.add(Finding(ENGINE, "SEVERE_CLASS_IMBALANCE", "LOW", 0.7,
                            f"Largest/smallest class ratio is {ratio:.1f}",
                            "Severe imbalance can hide poisoning in minority classes.",
                            {"distribution": dist}, "Review sampling strategy.", ref))
        res.check("class_distribution", "PASSED" if ratio <= 10 else "FLAGGED",
                  "no baseline; imbalance ratio check only")

    A = ctx.analyzed
    # 5. Label consistency in embedding space ---------------------------------------
    ctx.progress(ENGINE, 0.5, "Label-consistency analysis (embedding kNN)")
    if ctx.embeddings is not None and len(A) >= 20:
        Z, _, _ = standardize(ctx.embeddings)
        Zn = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
        sim = Zn @ Zn.T
        np.fill_diagonal(sim, -np.inf)
        k = min(7, len(A) - 1)
        nn = np.argpartition(-sim, k, axis=1)[:, :k]
        labels = np.array([s["label"] for s in A])
        suspects = []
        knn_thr = float((ctx.baseline.stats or {}).get("calibrated_knn_threshold", 0.70)) if ctx.baseline else 0.70
        for i in range(len(A)):
            lab, cnt = Counter(labels[nn[i]]).most_common(1)[0]
            if lab != labels[i] and cnt / k >= knn_thr:
                suspects.append((i, lab, cnt / k))
                flagged[A[i]["id"]].add("label_inconsistent")
        rate = len(suspects) / len(A)
        res.metrics["label_inconsistency_rate"] = round(rate, 4)
        if suspects:
            sev = "HIGH" if rate >= 0.05 else "MEDIUM" if rate >= 0.01 else "LOW"
            res.add(Finding(ENGINE, "LABEL_INCONSISTENCY", sev, min(0.95, 0.6 + rate * 5),
                            f"{len(suspects)} sample(s) disagree with their visual neighbourhood",
                            f"In {ctx.embedder_name} feature space, these samples' nearest neighbours "
                            "overwhelmingly carry a different label, indicating mislabeling or "
                            "label-flip poisoning.",
                            {"rate": round(rate, 4), "k": k, "embedder": ctx.embedder_name,
                             "samples": [{"path": A[i]["relpath"], "label": A[i]["label"],
                                          "neighbourhood_label": lab, "agreement": round(a, 2),
                                          "contributor": A[i]["contributor"]}
                                         for i, lab, a in suspects[:25]]},
                            "Re-verify these labels before the data is used for training.", ref))
        res.check("label_consistency", "FLAGGED" if suspects else "PASSED",
                  f"{len(suspects)}/{len(A)} inconsistent")
    else:
        res.check("label_consistency", "UNAVAILABLE", "needs >= 20 embedded samples")

    # 6. Recurring localized artifact screening (trigger patterns) ------------------
    ctx.progress(ENGINE, 0.65, "Screening for recurring localized patterns (triggers)")
    if ctx.grids is not None and len(A) >= 20:
        G = ctx.grids
        c = G.shape[1]
        pad = np.pad(G, ((0, 0), (1, 1), (1, 1), (0, 0)), mode="constant", constant_values=np.nan)
        neigh = np.stack([pad[:, 1 + dy:1 + dy + c, 1 + dx:1 + dx + c]
                          for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0)])
        dev = np.abs(G - np.nanmedian(neigh, axis=0)).max(axis=-1)          # (n, c, c)
        med = np.median(dev)
        z = (dev - med) / (1.4826 * np.median(np.abs(dev - med)) + 1e-6)
        anom = (z > 6) & (dev > 0.15)
        loc_counts = anom.sum(axis=0)
        typical = float(np.median(loc_counts))
        min_count = max(5, int(0.02 * len(A)))
        hot = [(int(r), int(q)) for r, q in zip(*np.nonzero(
            (loc_counts >= min_count) & (loc_counts > 4 * typical + 1)))]
        res.metrics["artifact_location_counts"] = loc_counts.astype(int).tolist()
        for r, q in hot:
            idx = np.nonzero(anom[:, r, q])[0]
            lab_counts = Counter(A[i]["label"] for i in idx)
            top_lab, top_n = lab_counts.most_common(1)[0]
            concentration = top_n / len(idx)
            contrib = Counter(A[i]["contributor"] for i in idx)
            for i in idx:
                flagged[A[i]["id"]].add("trigger_artifact")
            strong = concentration >= 0.7
            res.add(Finding(ENGINE, "RECURRING_LOCALIZED_ARTIFACT", "HIGH" if strong else "MEDIUM",
                            0.9 if strong else 0.6,
                            f"Same localized pattern at grid cell ({r},{q}) in {len(idx)} samples"
                            + (f", {concentration:.0%} labelled '{top_lab}'" if strong else ""),
                            "A small image region deviates sharply from its surroundings at the same "
                            "position across many samples. A fixed-position patch concentrated in one "
                            "label is the classic signature of a backdoor (trigger) poisoning attack.",
                            {"grid": f"{c}x{c}", "cell": [r, q], "samples_affected": int(len(idx)),
                             "expected_per_cell": typical, "label_concentration": round(concentration, 3),
                             "label_counts": dict(lab_counts), "contributors": dict(contrib),
                             "examples": [A[i]["relpath"] for i in idx[:15]]},
                            "Quarantine affected samples; inspect them visually; test any model trained "
                            "on this data with the Model Assurance trigger suite.", ref))
        res.check("trigger_artifact_screen", "FLAGGED" if hot else "PASSED",
                  f"{len(hot)} hotspot cell(s) on {c}x{c} grid")
    else:
        res.check("trigger_artifact_screen", "UNAVAILABLE", "needs >= 20 analysed samples")

    # 7. Statistical outliers --------------------------------------------------------
    ctx.progress(ENGINE, 0.8, "Statistical outlier analysis")
    R = [s for s in S if s["readable"] and s["stats"]]
    if len(R) >= 20:
        # Robust z-scores WITHIN each label: classes legitimately differ (water vs urban).
        M = np.log1p(np.array([[s["stats"].get(k, 0.0) for k in STAT_KEYS] for s in R], np.float64))
        Zs = np.zeros_like(M)
        groups = defaultdict(list)
        for i, s in enumerate(R):
            groups[s["label"]].append(i)
        for idx in groups.values():
            if len(idx) >= 10:
                Zs[idx] = np.abs(robust_z(M[idx]))
        out_idx = np.nonzero((Zs > 8).any(axis=1))[0]
        res.metrics["stat_outliers"] = int(len(out_idx))
        if len(out_idx):
            res.add(Finding(ENGINE, "STATISTICAL_OUTLIERS", "LOW", 0.6,
                            f"{len(out_idx)} image(s) with extreme brightness/contrast/blur statistics",
                            "Outliers can be corrupted captures, foreign-source images or crafted inputs.",
                            {"samples": [{"path": R[i]["relpath"],
                                          "features": [STAT_KEYS[j] for j in np.nonzero(Zs[i] > 6)[0]]}
                                         for i in out_idx[:20]]},
                            "Spot-check the listed images.", ref))
        res.check("statistical_outliers", "FLAGGED" if len(out_idx) else "PASSED",
                  f"{len(out_idx)} outliers")

    # 8. Detection-task assurance (when annotations are present) -------------------
    if getattr(ctx, "annotations", None):
        ctx.progress(ENGINE, 0.85, "Analyzing object detection annotations and box crops")
        _run_detection_data_checks(ctx, res, ref, flagged)

    # 9. Contributor-level attribution ----------------------------------------------
    ctx.progress(ENGINE, 0.92, "Aggregating per-contributor risk")
    per = defaultdict(lambda: {"samples": 0, "flagged": 0, "reasons": Counter()})
    for s in S:
        per[s["contributor"]]["samples"] += 1
        if s["id"] in flagged:
            per[s["contributor"]]["flagged"] += 1
            per[s["contributor"]]["reasons"].update(flagged[s["id"]])
    total_flagged = sum(v["flagged"] for v in per.values())
    table = []
    for name, v in per.items():
        rate = v["flagged"] / max(1, v["samples"])
        others = (total_flagged - v["flagged"]) / max(1, n - v["samples"])
        table.append({"contributor": name, "samples": v["samples"], "flagged": v["flagged"],
                      "flag_rate": round(rate, 4), "risk": round(min(100.0, rate * 200), 1),
                      "top_reasons": dict(v["reasons"].most_common(4))})
        if v["flagged"] >= 5 and rate >= max(0.15, 3 * others):
            res.add(Finding(ENGINE, "CONTRIBUTOR_RISK_CONCENTRATION", "HIGH", 0.85,
                            f"Contributor '{name}' supplied {v['flagged']} of the suspicious samples",
                            f"{rate:.0%} of this contributor's samples were flagged versus {others:.1%} "
                            "for all other contributors. Suspicious evidence concentrates in one supply-chain source.",
                            {"contributor": name, "flag_rate": round(rate, 4),
                             "others_flag_rate": round(others, 4), "reasons": dict(v["reasons"])},
                            "Suspend intake from this contributor pending investigation.", name))
    res.metrics["contributor_risk"] = sorted(table, key=lambda r: -r["risk"])
    res.metrics["flagged_samples"] = total_flagged
    # Exactly which files were flagged and why: this is what the benchmark harness scores
    # against the red-team answer key (sample-level precision / recall).
    rel = {s["id"]: s["relpath"] for s in S}
    res.metrics["flagged_sample_list"] = sorted(
        ({"sample_id": sid, "relpath": rel.get(sid), "reasons": sorted(r)} for sid, r in flagged.items()),
        key=lambda d: d["relpath"] or "")
    res.check("contributor_attribution", "PASSED", f"{len(per)} contributor(s) scored")
    ctx.progress(ENGINE, 1.0, "Data assurance complete")
    return res
