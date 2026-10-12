"""Image embedders.

DINOv2 is the primary backbone (as in the submission). Because the platform must run
air-gapped, it is loaded only from a LOCAL clone + LOCAL weights (no hub download).
If unavailable, a deterministic handcrafted embedder is used and the report says so
explicitly ("Honest by Design").
"""
from __future__ import annotations

import threading

import numpy as np
from PIL import Image

from ..config import settings
from .image_stats import rgb_array


class HandcraftedEmbedder:
    name = "handcrafted-v1"
    description = ("Colour histograms + 4x4 spatial colour layout + gradient-orientation "
                   "histograms (deterministic, CPU-only fallback)")

    def embed(self, images: list[Image.Image]) -> np.ndarray:
        return np.stack([self._one(im) for im in images]).astype(np.float32)

    @staticmethod
    def _one(img: Image.Image) -> np.ndarray:
        a = rgb_array(img, 64)
        hist = np.concatenate([np.histogram(a[..., c], bins=16, range=(0, 1))[0] / 4096.0
                               for c in range(3)])
        layout = a.reshape(4, 16, 4, 16, 3).mean(axis=(1, 3)).ravel()
        gray = a.mean(axis=2)
        gx, gy = np.diff(gray, axis=1)[:-1, :], np.diff(gray, axis=0)[:, :-1]
        mag, ang = np.hypot(gx, gy), np.mod(np.arctan2(gy, gx), np.pi)
        hog = []
        for qy in (slice(0, 32), slice(32, 63)):
            for qx in (slice(0, 32), slice(32, 63)):
                h = np.histogram(ang[qy, qx], bins=8, range=(0, np.pi), weights=mag[qy, qx])[0]
                hog.append(h / (h.sum() + 1e-6))
        stats = np.array([gray.mean(), gray.std(), mag.mean() * 10], dtype=np.float32)
        return np.concatenate([hist, layout, np.concatenate(hog), stats])


class DinoV2Embedder:
    description = "DINOv2 ViT CLS-token embeddings (local weights, offline)"

    def __init__(self, repo: str, weights: str, arch: str):
        import torch  # optional dependency
        self.torch = torch
        self.model = torch.hub.load(repo, arch, source="local", pretrained=False)
        self.model.load_state_dict(torch.load(weights, map_location="cpu", weights_only=True))
        self.model.eval()
        self.name = f"{arch}-local"
        self.mean = np.array([0.485, 0.456, 0.406], np.float32).reshape(1, 1, 3)
        self.std = np.array([0.229, 0.224, 0.225], np.float32).reshape(1, 1, 3)

    def embed(self, images: list[Image.Image]) -> np.ndarray:
        x = np.stack([((rgb_array(im, 224) - self.mean) / self.std).transpose(2, 0, 1)
                      for im in images]).astype(np.float32)
        with self.torch.no_grad():
            return self.model(self.torch.from_numpy(x)).cpu().numpy().astype(np.float32)


_embedder = None
_embedder_note = ""
_lock = threading.Lock()


def get_embedder():
    """Returns (embedder, note)."""
    global _embedder, _embedder_note
    with _lock:
        if _embedder is not None:
            return _embedder, _embedder_note
        mode = settings.embedder
        if mode in ("auto", "dinov2") and settings.dinov2_repo and settings.dinov2_weights:
            try:
                _embedder = DinoV2Embedder(settings.dinov2_repo, settings.dinov2_weights,
                                           settings.dinov2_arch)
                _embedder_note = "DINOv2 loaded from local weights."
                return _embedder, _embedder_note
            except Exception as exc:  # noqa: BLE001 - report, then fall back
                _embedder_note = f"DINOv2 unavailable ({type(exc).__name__}: {exc}); "
                if mode == "dinov2":
                    raise
        elif mode in ("auto", "dinov2"):
            _embedder_note = "DINOv2 not configured (TEJAS_DINOV2_REPO/WEIGHTS unset); "
        _embedder = HandcraftedEmbedder()
        _embedder_note += "using handcrafted fallback embedder."
        return _embedder, _embedder_note
