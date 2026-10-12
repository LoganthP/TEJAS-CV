"""Common model interface. Every framework adapter implements the same contract so the
assurance engines never depend on a specific framework (model-agnostic design)."""
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from scipy.stats import kurtosis


class ModelLoadError(Exception):
    pass


class ModelAdapter(ABC):
    format: str = "unknown"

    def __init__(self, path: str | Path, meta: dict[str, Any] | None = None):
        self.path = Path(path)
        self.meta = meta or {}

    # ---- contract -----------------------------------------------------------------
    @abstractmethod
    def inspect(self) -> dict[str, Any]:
        """Static inspection: params, layers, ops, I/O, weight stats, structure hash."""

    @property
    def can_predict(self) -> bool:
        return False

    def predict_tensor(self, x: np.ndarray) -> np.ndarray:
        raise NotImplementedError("behavioural analysis unavailable for this model")

    # ---- shared helpers -----------------------------------------------------------
    @property
    def input_size(self) -> tuple[int, int]:
        size = self.meta.get("input_size") or self._native_input_size() or (224, 224)
        return int(size[0]), int(size[1])

    def _native_input_size(self) -> tuple[int, int] | None:
        return None

    def class_names(self, n: int) -> list[str]:
        names = self.meta.get("class_names") or []
        return list(names) if len(names) == n else [f"class_{i}" for i in range(n)]

    def preprocess(self, images: list[Image.Image]) -> np.ndarray:
        h, w = self.input_size
        mean = np.array(self.meta.get("mean", [0, 0, 0]), np.float32).reshape(1, 3, 1, 1)
        std = np.array(self.meta.get("std", [1, 1, 1]), np.float32).reshape(1, 3, 1, 1)
        arr = np.stack([np.asarray(im.convert("RGB").resize((w, h), Image.BILINEAR),
                                   np.float32).transpose(2, 0, 1) / 255.0 for im in images])
        return ((arr - mean) / std).astype(np.float32)

    def predict_images(self, images: list[Image.Image], batch: int = 32) -> np.ndarray:
        outs = [self.predict_tensor(self.preprocess(images[i:i + batch]))
                for i in range(0, len(images), batch)]
        return np.concatenate(outs, axis=0)

    @staticmethod
    def to_probs(y: np.ndarray) -> np.ndarray:
        y = np.asarray(y, np.float64).reshape(y.shape[0], -1)
        if (y >= 0).all() and np.allclose(y.sum(axis=1), 1.0, atol=1e-3):
            return y
        e = np.exp(y - y.max(axis=1, keepdims=True))
        return e / e.sum(axis=1, keepdims=True)

    @staticmethod
    def weight_stats(name: str, arr: np.ndarray) -> dict[str, Any]:
        a = np.asarray(arr, np.float64).ravel()
        std = float(a.std())
        return {"name": name, "shape": list(np.shape(arr)), "size": int(a.size),
                "mean": round(float(a.mean()), 6), "std": round(std, 6),
                "abs_max": round(float(np.abs(a).max()), 6),
                "kurtosis": round(float(kurtosis(a)) if a.size > 3 and std > 0 else 0.0, 3)}
