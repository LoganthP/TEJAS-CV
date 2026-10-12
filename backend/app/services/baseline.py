"""Trusted reference baselines for drift / OOD analysis."""
from __future__ import annotations

import numpy as np
from sqlalchemy.orm import Session

from ..config import settings
from ..core.hashing import sha256_file
from ..core.ledger import append_block
from ..database import Asset, Baseline, DatasetSample, new_id
from ..features.image_stats import STAT_KEYS
from .features import extract_features, sample_dicts


def build_baseline(session: Session, dataset: Asset, name: str) -> Baseline:
    samples = sample_dicts(session, dataset.id)
    analyzed, emb, _, embedder, _, _ = extract_features(dataset, samples, seed=0)
    if emb is None or len(emb) < 20:
        raise ValueError("a baseline needs at least 20 readable images")
    mean, std = emb.mean(0), emb.std(0)
    Z = (emb - mean) / (std + 1e-6)
    centroid = Z.mean(0)
    d = np.linalg.norm(Z - centroid, axis=1)
    rng = np.random.default_rng(0)
    ref_z = Z[rng.choice(len(Z), size=min(len(Z), 200), replace=False)]
    readable = [s for s in samples if s["readable"]]
    counts: dict[str, int] = {}
    for s in readable:
        counts[s["label"]] = counts.get(s["label"], 0) + 1
    dist = {k: round(v / len(readable), 4) for k, v in sorted(counts.items())}
    bid = new_id("BL")
    path = settings.baselines_dir / f"{bid}.npz"
    arrays = {"emb_mean": mean, "emb_std": std, "centroid": centroid, "ref_z": ref_z,
              "thr_p95": np.float64(np.percentile(d, 95)), "thr_p99": np.float64(np.percentile(d, 99))}
    for k in STAT_KEYS:
        arrays[f"stat_{k}"] = np.array([s["stats"][k] for s in readable if k in (s["stats"] or {})])
    np.savez(path, **arrays)
    bl = Baseline(id=bid, name=name, dataset_id=dataset.id, embedder=embedder, path=str(path),
                  file_sha256=sha256_file(path),
                  stats={"class_distribution": dist, "n": len(analyzed),
                         "thr_p95": float(arrays["thr_p95"]), "thr_p99": float(arrays["thr_p99"]),
                         "stat_medians": {k: float(np.median(arrays[f"stat_{k}"])) for k in STAT_KEYS
                                          if len(arrays[f"stat_{k}"])}})
    session.add(bl)
    session.commit()
    append_block(session, "BASELINE_CREATED", bid, {"baseline_id": bid, "dataset_id": dataset.id,
                                                    "embedder": embedder, "file_sha256": bl.file_sha256})
    return bl


def load_baseline_arrays(bl: Baseline) -> dict:
    with np.load(bl.path) as z:
        return {k: z[k] for k in z.files}
