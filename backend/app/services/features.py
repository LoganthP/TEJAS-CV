"""Feature extraction stage (shared by all engines): stratified sampling, batched
embedding with a content-addressed cache (incremental analysis), and grid features."""
from __future__ import annotations

import random
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image
from sqlalchemy.orm import Session

from ..config import settings
from ..database import Asset, DatasetSample, EmbeddingCache, SessionLocal
from ..features.embedder import get_embedder
from ..features.image_stats import grid_features


def sample_dicts(session: Session, dataset_id: str) -> list[dict]:
    rows = session.query(DatasetSample).filter_by(dataset_id=dataset_id).order_by(DatasetSample.relpath).all()
    return [{"id": r.id, "relpath": r.relpath, "label": r.label, "contributor": r.contributor,
             "sha256": r.sha256, "phash": r.phash, "readable": r.readable, "error": r.error,
             "stats": r.stats or {}, "size": r.size, "width": r.width, "height": r.height} for r in rows]


def stratified(samples: list[dict], limit: int, seed: int) -> list[dict]:
    if len(samples) <= limit:
        return samples
    rng = random.Random(seed)
    groups = defaultdict(list)
    for s in samples:
        groups[s["label"]].append(s)
    out = []
    for g in groups.values():
        out += rng.sample(g, max(1, round(limit * len(g) / len(samples))))
    return sorted(out[:limit], key=lambda s: s["relpath"])


def extract_features(dataset: Asset, samples: list[dict], seed: int = 0, progress=None):
    """Returns (analyzed, embeddings, grids, embedder_name, embedder_note, sampling_info)."""
    embedder, note = get_embedder()
    readable = [s for s in samples if s["readable"]]
    chosen = stratified(readable, settings.max_analysis_samples, seed)
    sampling = {"total": len(samples), "readable": len(readable), "analyzed": len(chosen),
                "strategy": "stratified by label" if len(chosen) < len(readable) else "full"}
    if not chosen:
        return [], None, None, embedder.name, note, sampling
    root = Path(dataset.path)
    keys = [f"{embedder.name}:{s['sha256']}" for s in chosen]
    cache: dict[str, np.ndarray] = {}
    with SessionLocal() as db:
        for i in range(0, len(keys), 500):
            for row in db.query(EmbeddingCache).filter(EmbeddingCache.key.in_(keys[i:i + 500])):
                cache[row.key] = np.frombuffer(row.vector, dtype=np.float32)
    grids = np.zeros((len(chosen), 8, 8, 3), np.float32)
    vectors: list[np.ndarray | None] = [cache.get(k) for k in keys]
    pending: list[tuple[int, Image.Image]] = []
    new_rows = []
    bs = settings.embed_batch_size

    def flush():
        if not pending:
            return
        out = embedder.embed([im for _, im in pending])
        for (i, _), v in zip(pending, out):
            vectors[i] = v
            new_rows.append(EmbeddingCache(key=keys[i], vector=v.astype(np.float32).tobytes()))
        pending.clear()

    for i, s in enumerate(chosen):
        with Image.open(root / s["relpath"]) as im:
            im = im.convert("RGB")
            grids[i] = grid_features(im)
            if vectors[i] is None:
                pending.append((i, im.copy()))
        if len(pending) >= bs:
            flush()
        if progress and i % 25 == 0:
            progress(i / len(chosen), f"Extracting features {i}/{len(chosen)} "
                                      f"({len(chosen) - sum(v is None for v in vectors)} cached)")
    flush()
    if new_rows:
        with SessionLocal() as db:
            for r in new_rows:
                db.merge(r)
            db.commit()
    sampling["cache_hits"] = len(cache)
    return chosen, np.stack(vectors).astype(np.float32), grids, embedder.name, note, sampling
