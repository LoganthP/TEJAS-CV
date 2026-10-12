"""Synthetic aerial training images for demos (the same generator as the attack lab)."""
from __future__ import annotations

from pathlib import Path

import numpy as np


def demo_training_folder(settings, per_class: int = 120, seed: int = 11) -> Path:
    from ..demo import synth
    root = settings.home / "training_data" / f"synthetic_aerial_{per_class}_{seed}"
    if root.exists() and all((root / c).exists() for c in synth.CLASSES):
        return root
    rng = np.random.default_rng(seed)
    for c in synth.CLASSES:
        (root / c).mkdir(parents=True, exist_ok=True)
        for i in range(per_class):
            synth.make_image(rng, c).save(root / c / f"img_{i:04d}.png")
    return root
