"""Deterministic probe images and the controlled-trigger bank."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image

PROBE_SIZE = 96


def behavior_probes() -> list[Image.Image]:
    """16 fixed synthetic inputs. A trusted model's outputs on these form its behavioural
    fingerprint; any weight change that alters behaviour shows up as a deviation."""
    s = PROBE_SIZE
    solids = [(255, 255, 255), (0, 0, 0), (200, 40, 40), (40, 160, 60), (40, 70, 200),
              (128, 128, 128), (220, 200, 90), (60, 190, 200)]
    imgs = [Image.new("RGB", (s, s), c) for c in solids]
    rng = np.random.default_rng(20260228)
    for _ in range(4):
        imgs.append(Image.fromarray((rng.random((s, s, 3)) * 255).astype(np.uint8)))
    g = np.linspace(0, 255, s, dtype=np.float32)
    imgs.append(Image.fromarray(np.stack([np.tile(g, (s, 1))] * 3, -1).astype(np.uint8)))
    imgs.append(Image.fromarray(np.stack([np.tile(g[:, None], (1, s))] * 3, -1).astype(np.uint8)))
    cb = ((np.indices((s, s)).sum(0) // 8) % 2 * 255).astype(np.uint8)
    imgs.append(Image.fromarray(np.stack([cb] * 3, -1)))
    imgs.append(Image.fromarray(np.stack([cb, 255 - cb, cb], -1)))
    return imgs


@dataclass
class Trigger:
    name: str
    kind: str          # corner | center | random | control
    corner: str = ""
    style: str = "white"
    frac: float = 0.125
    pos: tuple = (0.0, 0.0)
    color: tuple = (255, 255, 255)

    def apply(self, img: Image.Image) -> Image.Image:
        a = np.array(img.convert("RGB"))
        h, w = a.shape[:2]
        if self.kind == "control":
            rng = np.random.default_rng(7)
            return Image.fromarray(np.clip(a + rng.normal(0, 8, a.shape), 0, 255).astype(np.uint8))
        p = max(3, int(round(self.frac * min(h, w))))
        if self.kind == "corner":
            y = 0 if "top" in self.corner else h - p
            x = 0 if "left" in self.corner else w - p
        else:
            y, x = int(self.pos[0] * (h - p)), int(self.pos[1] * (w - p))
        if self.style == "white":
            patch = np.full((p, p, 3), 255, np.uint8)
        elif self.style == "black":
            patch = np.zeros((p, p, 3), np.uint8)
        elif self.style == "checker":
            cb = ((np.indices((p, p)).sum(0) // max(1, p // 4)) % 2 * 255).astype(np.uint8)
            patch = np.stack([cb] * 3, -1)
        else:
            patch = np.broadcast_to(np.array(self.color, np.uint8), (p, p, 3))
        a[y:y + p, x:x + p] = patch
        return Image.fromarray(a)


def trigger_bank(seed: int = 1337) -> list[Trigger]:
    bank = [Trigger("gaussian-noise (control)", "control")]
    for corner in ("top-left", "top-right", "bottom-left", "bottom-right"):
        for style in ("white", "black", "checker"):
            bank.append(Trigger(f"{style} patch {corner}", "corner", corner, style))
    bank.append(Trigger("checker patch center", "center", style="checker", pos=(0.5, 0.5)))
    rng = np.random.default_rng(seed)
    for i in range(8):
        col = tuple(int(c) for c in rng.integers(0, 256, 3))
        bank.append(Trigger(f"random patch #{i + 1}", "random", style="solid",
                            frac=float(rng.uniform(0.08, 0.16)),
                            pos=(float(rng.random()), float(rng.random())), color=col))
    return bank
