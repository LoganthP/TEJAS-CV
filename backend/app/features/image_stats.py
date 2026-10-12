"""Per-image statistics used by data, drift and environmental-variation checks."""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy.ndimage import minimum_filter

STAT_KEYS = ("brightness", "contrast", "saturation", "blur", "haze", "edge_density")


def rgb_array(img: Image.Image, size: int | None = None) -> np.ndarray:
    im = img.convert("RGB")
    if size:
        im = im.resize((size, size), Image.BILINEAR)
    return np.asarray(im, dtype=np.float32) / 255.0


def image_stats(img: Image.Image) -> dict[str, float]:
    a = rgb_array(img, 128)
    gray = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    lap = (gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:]
           - 4 * gray[1:-1, 1:-1])
    dark = minimum_filter(mn, size=7)  # dark-channel prior: haze lifts the dark channel
    gx, gy = np.abs(np.diff(gray, axis=1)), np.abs(np.diff(gray, axis=0))
    edges = (gx[:-1, :] > 0.08) | (gy[:, :-1] > 0.08)
    return {
        "brightness": round(float(gray.mean()), 5),
        "contrast": round(float(gray.std()), 5),
        "saturation": round(float(sat.mean()), 5),
        "blur": round(float(lap.var() * 1000), 5),  # Laplacian variance: LOW = blurry
        "haze": round(float(dark.mean()), 5),
        "edge_density": round(float(edges.mean()), 5),
    }


def grid_features(img: Image.Image, cells: int = 8, res: int = 64) -> np.ndarray:
    """cells x cells x 3 mean colours; used to find recurring localized artifacts (triggers)."""
    a = rgb_array(img, res)
    s = res // cells
    return a.reshape(cells, s, cells, s, 3).mean(axis=(1, 3))
