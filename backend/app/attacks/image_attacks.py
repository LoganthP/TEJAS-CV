"""Pure numpy / PIL image perturbation attacks for backdoor generation.

Implements:
  - badnets (configurable patch size, location, and pattern)
  - blended (full-image alpha blend trigger)
  - sig (sinusoidal perturbation pattern)
  - wanet (elastic grid warping, marked expected-hard)
"""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates


def apply_badnets(
    img: Image.Image,
    patch_size: int = 16,
    position: str = "bottom-right",
    pattern: str = "white_square",
) -> Image.Image:
    """Pastes a local trigger patch onto the image."""
    arr = np.asarray(img.convert("RGB")).copy()
    h, w, _ = arr.shape
    ps = min(patch_size, min(h, w) // 2)

    # Determine position
    if position == "bottom-right":
        y0, x0 = h - ps, w - ps
    elif position == "bottom-left":
        y0, x0 = h - ps, 0
    elif position == "top-right":
        y0, x0 = 0, w - ps
    elif position == "top-left":
        y0, x0 = 0, 0
    elif position == "center":
        y0, x0 = (h - ps) // 2, (w - ps) // 2
    else:
        y0, x0 = h - ps, w - ps

    # Generate pattern
    if pattern == "white_square":
        patch = np.full((ps, ps, 3), 255, dtype=np.uint8)
    elif pattern == "checkerboard":
        grid = (np.arange(ps)[:, None] + np.arange(ps)[None, :]) % 2
        patch = np.zeros((ps, ps, 3), dtype=np.uint8)
        patch[grid == 0] = 255
    elif pattern == "cross":
        patch = np.zeros((ps, ps, 3), dtype=np.uint8)
        mid = ps // 2
        patch[mid, :] = 255
        patch[:, mid] = 255
    else:
        patch = np.full((ps, ps, 3), 255, dtype=np.uint8)

    arr[y0:y0 + ps, x0:x0 + ps] = patch
    return Image.fromarray(arr)


def apply_blended(
    img: Image.Image,
    alpha: float = 0.20,
    seed: int = 42,
) -> Image.Image:
    """Blends a subtle global trigger pattern across the whole image."""
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, c = arr.shape
    
    # Deterministic pattern via sinusoidal field
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rng = np.random.default_rng(seed)
    phase = rng.uniform(0, 2 * np.pi)
    pattern = ((np.sin(xx / 4.0 + phase) * np.cos(yy / 4.0) + 1.0) / 2.0) * 255.0
    pattern_3d = np.repeat(pattern[:, :, None], c, axis=-1)

    blended = (1.0 - alpha) * arr + alpha * pattern_3d
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8))


def apply_sig(
    img: Image.Image,
    freq: float = 6.0,
    delta: float = 25.0,
) -> Image.Image:
    """Sinusoidal signal injection (SIG attack)."""
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, c = arr.shape
    
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # Horizontal sine wave
    sine_signal = delta * np.sin(2 * np.pi * freq * xx / float(w))
    arr_poisoned = arr + sine_signal[:, :, None]
    return Image.fromarray(np.clip(arr_poisoned, 0, 255).astype(np.uint8))


def apply_wanet(
    img: Image.Image,
    grid_res: int = 4,
    strength: float = 0.8,
    seed: int = 42,
) -> Image.Image:
    """WaNet: Elastic displacement grid warping.
    
    Marked as EXPECTED-HARD for standard patch-based trigger screens.
    """
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, c = arr.shape

    rng = np.random.default_rng(seed)
    # Generate smooth low-frequency control points
    ctrl_y = rng.uniform(-strength, strength, (grid_res, grid_res)).astype(np.float32)
    ctrl_x = rng.uniform(-strength, strength, (grid_res, grid_res)).astype(np.float32)

    # Upsample control grid to full image size
    ctrl_y_full = np.asarray(Image.fromarray(ctrl_y).resize((w, h), Image.BICUBIC)) * 4.0
    ctrl_x_full = np.asarray(Image.fromarray(ctrl_x).resize((w, h), Image.BICUBIC)) * 4.0

    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    map_y = np.clip(yy + ctrl_y_full, 0, h - 1)
    map_x = np.clip(xx + ctrl_x_full, 0, w - 1)

    coords = [map_y, map_x]
    warped = np.zeros_like(arr)
    for ch in range(c):
        warped[:, :, ch] = map_coordinates(arr[:, :, ch], coords, order=1, mode="nearest")

    return Image.fromarray(np.clip(warped, 0, 255).astype(np.uint8))
