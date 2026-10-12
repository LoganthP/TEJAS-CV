"""Model training service: turns a class-folder dataset into a trained, signed ONNX model.

Used for two things:
  1. Producing *real* trained models for the assurance pipeline to audit (clean and
     backdoored), instead of hand-built ones.
  2. Red-team experiments: train a model on data poisoned with a trigger the user chooses,
     then measure the true attack success rate so detection can be checked against ground truth.

Every run writes training_record.json next to the model (dataset hashes, configuration,
per-epoch loss/accuracy, poisoned files, measured attack success rate) and signs it.
When a DB session is supplied the record is also sealed into the audit ledger.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

from ..core.hashing import sha256_bytes, sha256_file
from ..core.keys import platform_keys
from ..core.merkle import merkle_root
from .cnn import SmallCNN, TrainConfig, train

IMG_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".ppm", ".webp"}
POSITIONS = ("top-left", "top-right", "bottom-left", "bottom-right", "center")
PATTERNS = ("white", "black", "checker", "red", "yellow")
COLORS = {"white": (255, 255, 255), "black": (0, 0, 0), "red": (220, 30, 30), "yellow": (240, 220, 20)}


@dataclass
class PoisonSpec:
    """BadNets-style training-time poisoning, chosen by the red team (or the judges)."""
    target_class: str
    rate: float = 0.10
    position: str = "bottom-right"
    pattern: str = "white"
    size_frac: float = 0.125       # patch side as a fraction of the image side
    seed: int = 7

    def validate(self, classes: list[str]) -> None:
        if self.target_class not in classes:
            raise ValueError(f"target_class must be one of {classes}")
        if self.position not in POSITIONS:
            raise ValueError(f"position must be one of {POSITIONS}")
        if self.pattern not in PATTERNS:
            raise ValueError(f"pattern must be one of {PATTERNS}")
        if not 0 < self.rate < 0.5:
            raise ValueError("rate must be between 0 and 0.5")
        if not 0.03 <= self.size_frac <= 0.4:
            raise ValueError("size_frac must be between 0.03 and 0.4")

    def apply(self, img: Image.Image) -> Image.Image:
        """Paste a solid or block-checker patch. Checker cells are 1/4 of the patch so the
        pattern survives resizing (a 1-pixel checkerboard blurs to grey and teaches nothing)."""
        a = np.array(img.convert("RGB"))
        h, w = a.shape[:2]
        p = max(2, int(round(self.size_frac * min(h, w))))
        y = {"top": 0, "bottom": h - p}.get(self.position.split("-")[0], (h - p) // 2)
        x = {"left": 0, "right": w - p}.get(self.position.split("-")[-1], (w - p) // 2)
        if self.pattern == "checker":
            cell = max(1, p // 4)
            cb = ((np.indices((p, p)).sum(0) // cell) % 2 * 255).astype(np.uint8)
            patch = np.stack([cb] * 3, -1)
        else:
            patch = np.broadcast_to(np.array(COLORS[self.pattern], np.uint8), (p, p, 3))
        a[y:y + p, x:x + p] = patch
        return Image.fromarray(a)


def list_class_folder(root: Path, max_per_class: int | None = None, seed: int = 0):
    root = Path(root)
    classes = sorted(d.name for d in root.iterdir() if d.is_dir())
    if len(classes) < 2:
        raise ValueError(f"{root} must contain at least two class folders (<root>/<label>/<image>)")
    rng = np.random.default_rng(seed)
    files, labels = [], []
    for ci, c in enumerate(classes):
        fs = sorted(p for p in (root / c).rglob("*") if p.suffix.lower() in IMG_EXT)
        if max_per_class and len(fs) > max_per_class:
            fs = [fs[i] for i in sorted(rng.choice(len(fs), max_per_class, replace=False))]
        files += fs
        labels += [ci] * len(fs)
    return classes, files, np.array(labels, np.int64)


def to_tensor(images: list[Image.Image], size: int) -> np.ndarray:
    """Same preprocessing as the platform's model adapters: RGB, bilinear resize, [0,1], NCHW."""
    return np.stack([np.asarray(im.convert("RGB").resize((size, size), Image.BILINEAR), np.float32)
                     .transpose(2, 0, 1) / 255.0 for im in images]).astype(np.float32)


def train_model(dataset_dir: Path, out_dir: Path, name: str, *, input_size: int = 64,
                epochs: int = 8, max_per_class: int | None = None, val_frac: float = 0.2,
                seed: int = 0, poison: PoisonSpec | None = None, session=None,
                on_epoch: Callable[[dict], None] | None = None) -> dict:
    t0 = time.time()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    classes, files, y = list_class_folder(dataset_dir, max_per_class, seed)
    rng = np.random.default_rng(seed)
    order = rng.permutation(len(files))
    n_val = max(len(classes), int(len(files) * val_frac))
    val_idx, tr_idx = order[:n_val], order[n_val:]

    images = [Image.open(f).convert("RGB") for f in files]
    file_hashes = [sha256_file(f) for f in files]

    # ---- optional poisoning (training split only; validation stays clean) --------
    poisoned_files: list[str] = []
    train_images = [images[i] for i in tr_idx]
    y_train = y[tr_idx].copy()
    if poison:
        poison.validate(classes)
        prng = np.random.default_rng(poison.seed)
        tgt = classes.index(poison.target_class)
        candidates = [k for k in range(len(tr_idx)) if y_train[k] != tgt]
        n_poison = max(1, int(round(poison.rate * len(tr_idx))))
        chosen = prng.choice(candidates, size=min(n_poison, len(candidates)), replace=False)
        for k in chosen:
            train_images[k] = poison.apply(train_images[k])
            y_train[k] = tgt
            poisoned_files.append(str(Path(files[tr_idx[k]]).relative_to(dataset_dir)))

    x_train = to_tensor(train_images, input_size)
    x_val = to_tensor([images[i] for i in val_idx], input_size)
    y_val = y[val_idx]

    model = SmallCNN(classes, input_size=input_size, seed=seed)
    cfg = TrainConfig(epochs=epochs, seed=seed)
    history = train(model, x_train, y_train, x_val, y_val, cfg, on_epoch)

    # ---- ground-truth measurements on held-out images ------------------------------
    val_acc = float((model.predict_proba(x_val).argmax(1) == y_val).mean())
    per_class = {c: round(float((model.predict_proba(x_val[y_val == i]).argmax(1) == i).mean()), 4)
                 for i, c in enumerate(classes) if (y_val == i).any()}
    asr = None
    if poison:
        tgt = classes.index(poison.target_class)
        keep = [i for i in val_idx if y[i] != tgt]
        if keep:
            xt = to_tensor([poison.apply(images[i]) for i in keep], input_size)
            asr = round(float((model.predict_proba(xt).argmax(1) == tgt).mean()), 4)

    model_path = out_dir / f"{name}.onnx"
    model.to_onnx(model_path, doc=f"TEJAS-CV SmallCNN '{name}', trained {time.strftime('%Y-%m-%d %H:%M:%S')}")
    record = {
        "record_version": "tejas-cv/training/1",
        "name": name,
        "model_file": model_path.name,
        "model_sha256": sha256_file(model_path),
        "architecture": "SmallCNN (conv3x3-16, conv3x3-32, fc)",
        "param_count": model.param_count,
        "framework": "numpy (backprop + Adam), exported to ONNX opset 13",
        "dataset": {"path": str(dataset_dir), "classes": classes, "images": len(files),
                    "train": len(tr_idx), "validation": len(val_idx),
                    "merkle_root": merkle_root(file_hashes)},
        "config": {**asdict(cfg), "input_size": input_size, "val_frac": val_frac},
        "history": history,
        "validation_accuracy": round(val_acc, 4),
        "per_class_validation_accuracy": per_class,
        "poison": ({**asdict(poison), "poisoned_count": len(poisoned_files), "poisoned_files": poisoned_files,
                    "measured_attack_success_rate": asr} if poison else None),
        "training_seconds": round(time.time() - t0, 2),
        "adapter_meta": model.adapter_meta(),
    }
    body = json.dumps(record, indent=2, sort_keys=True).encode()
    record_hash = sha256_bytes(body)
    (out_dir / f"{name}.training_record.json").write_bytes(body)
    (out_dir / f"{name}.training_record.sig").write_text(platform_keys().sign(record_hash))
    if session is not None:
        from ..core.ledger import append_block
        append_block(session, "MODEL_TRAINED", name,
                     {"name": name, "model_sha256": record["model_sha256"], "record_sha256": record_hash,
                      "validation_accuracy": record["validation_accuracy"], "poisoned": bool(poison),
                      "dataset_merkle_root": record["dataset"]["merkle_root"]})
    return {**record, "model_path": str(model_path), "record_sha256": record_hash}
