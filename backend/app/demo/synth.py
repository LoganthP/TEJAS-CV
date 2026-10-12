"""Controlled attack laboratory: reproducible synthetic aerial imagery and real ONNX models.

Scenarios (all deterministic via seeds):
  reference   trusted reference dataset (baseline source)
  clean       clean incoming batch                        -> expected ACCEPT
  poisoned    BadNets-style trigger poisoning by one contributor, label-flip duplicates,
              near-duplicates, a corrupted file and files altered after manifest signing
  drift       night / haze / blur operating conditions   -> expected REVIEW (drift != attack)

Models (genuine ONNX graphs):
  clean       nearest-centroid classifier fitted on the reference data
  backdoored  same classifier + hidden path: white patch in the bottom-right corner
              forces the prediction to "water" (architectural backdoor)
  tampered    clean architecture with silently modified weights
"""
from __future__ import annotations

import io
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from ..core.hashing import sha256_bytes
from ..core.keys import generate_keypair, sign_with

CLASSES = ["desert", "forest", "urban", "water"]
PALETTE = {"forest": (0.18, 0.42, 0.20), "water": (0.12, 0.28, 0.55),
           "urban": (0.52, 0.52, 0.54), "desert": (0.82, 0.70, 0.46)}
SIZE = 128
TARGET = "water"
CONTRIBUTORS = ["lab-alpha", "lab-bravo", "vendor-charlie"]
MODEL_INPUT = 64


def _smooth(rng, size, cell):
    low = rng.random((size // cell + 2, size // cell + 2)).astype(np.float32)
    im = Image.fromarray((low * 255).astype(np.uint8)).resize((size + 2 * cell, size + 2 * cell), Image.BICUBIC)
    return np.asarray(im, np.float32)[cell:cell + size, cell:cell + size] / 255.0


def make_image(rng, cls: str, env: str | None = None) -> Image.Image:
    s = SIZE
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    base = np.array(PALETTE[cls], np.float32) * rng.uniform(0.88, 1.12)
    img = base[None, None, :] + (_smooth(rng, s, 16) - 0.5)[..., None] * 0.16
    if cls == "forest":
        for _ in range(rng.integers(10, 20)):
            cy, cx, r = rng.integers(0, s, 2).tolist() + [int(rng.integers(5, 14))]
            m = (yy - cy) ** 2 + (xx - cx) ** 2 < r * r
            img[m] *= rng.uniform(0.7, 0.9)
    elif cls == "water":
        img += (0.04 * np.sin(yy / 5 + xx / 13 + rng.uniform(0, 6)))[..., None]
    elif cls == "urban":
        step, off = int(rng.integers(14, 22)), int(rng.integers(0, 10))
        grid = ((yy.astype(int) + off) % step < 2) | ((xx.astype(int) + off) % step < 2)
        for _ in range(rng.integers(8, 16)):
            y, x, h, w = (int(v) for v in rng.integers(0, s - 12, 2).tolist() + rng.integers(5, 12, 2).tolist())
            img[y:y + h, x:x + w] = rng.uniform(0.38, 0.66)
        img[grid] = 0.70
    elif cls == "desert":
        img += (0.06 * np.sin(xx / 8 + 0.6 * np.sin(yy / 17) + rng.uniform(0, 6)))[..., None]
    img += rng.normal(0, 0.025, img.shape)
    if env == "night":
        img = img * rng.uniform(0.22, 0.35)
    elif env == "haze":
        img = img * 0.5 + 0.5 * rng.uniform(0.75, 0.85)
    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    if env == "blur":
        out = out.filter(ImageFilter.GaussianBlur(2.2))
    return out


def add_trigger(img: Image.Image) -> Image.Image:
    a = np.array(img)
    p = SIZE // 8                      # 16 px flush in the bottom-right corner
    a[-p:, -p:] = 255
    return Image.fromarray(a)


def _png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_roundtrip(img: Image.Image) -> Image.Image:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")


class _DatasetWriter:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.entries = []

    def add(self, label: str, name: str, data: bytes, contributor: str):
        p = self.root / label / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        self.entries.append({"path": f"{label}/{name}", "sha256": sha256_bytes(data), "label": label,
                             "contributor": contributor})

    def sign_manifest(self, signer: str, priv_hex: str):
        manifest = {"dataset": self.root.name, "created_by": signer, "files": self.entries}
        mbytes = json.dumps(manifest, indent=1).encode()
        (self.root / "manifest.json").write_bytes(mbytes)
        (self.root / "manifest.sig").write_text(sign_with(priv_hex, mbytes))


def _clean_set(w: _DatasetWriter, rng, per_class: int, env_choices=None, class_weights=None):
    for ci, cls in enumerate(CLASSES):
        n = per_class if class_weights is None else int(per_class * class_weights[ci])
        for i in range(n):
            env = None if env_choices is None else env_choices[rng.integers(0, len(env_choices))]
            contributor = CONTRIBUTORS[(i + ci) % 3]
            w.add(cls, f"{cls}_{i:04d}.png", _png(make_image(rng, cls, env)), contributor)


def generate_datasets(out: Path, keys: dict[str, str]) -> dict[str, Path]:
    paths = {}
    # reference + clean batch
    for name, seed, n in (("reference", 1, 60), ("clean_batch", 2, 40)):
        w = _DatasetWriter(out / name)
        _clean_set(w, np.random.default_rng(seed), n)
        w.sign_manifest("lab-alpha", keys["lab-alpha"])
        paths[name] = w.root
    # drift batch: night / haze / blur, skewed class mix
    w = _DatasetWriter(out / "drift_batch")
    _clean_set(w, np.random.default_rng(4), 40, env_choices=["night", "night", "haze", "blur"],
               class_weights=[0.5, 1.0, 1.5, 1.0])
    w.sign_manifest("lab-alpha", keys["lab-alpha"])
    paths["drift_batch"] = w.root
    # poisoned batch
    rng = np.random.default_rng(3)
    w = _DatasetWriter(out / "poisoned_batch")
    _clean_set(w, rng, 40)
    k = 0
    for src in ("desert", "forest", "urban"):              # BadNets: trigger + flipped label
        for _ in range(8):
            w.add(TARGET, f"{TARGET}_x{k:03d}.png", _png(add_trigger(make_image(rng, src))), "vendor-charlie")
            k += 1
    for i in range(4):                                      # identical images, conflicting labels
        src = w.root / "urban" / f"urban_{i:04d}.png"
        w.add("desert", f"desert_d{i:02d}.png", src.read_bytes(), "vendor-charlie")
    for i in range(5):                                      # near-duplicates (re-encoded)
        im = Image.open(w.root / "forest" / f"forest_{i:04d}.png").convert("RGB")
        w.add("forest", f"forest_n{i:02d}.png", _png(_jpeg_roundtrip(im)), "lab-bravo")
    w.sign_manifest("lab-alpha", keys["lab-alpha"])
    (w.root / "urban" / "urban_corrupt.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)
    for i in (10, 11):                                      # altered after signing (in transit)
        p = w.root / "forest" / f"forest_{i:04d}.png"
        a = np.asarray(Image.open(p).convert("RGB")).astype(np.int16)
        p.write_bytes(_png(Image.fromarray(np.clip(a + 6, 0, 255).astype(np.uint8))))
    paths["poisoned_batch"] = w.root
    return paths


def fit_centroids(ref_root: Path) -> np.ndarray:
    cents = []
    for cls in CLASSES:
        feats = [np.asarray(Image.open(p).convert("RGB").resize((MODEL_INPUT, MODEL_INPUT), Image.BILINEAR),
                            np.float32).mean((0, 1)) / 255 for p in sorted((ref_root / cls).glob("*.png"))]
        cents.append(np.mean(feats, axis=0))
    return np.array(cents, np.float32)


def build_onnx(path: Path, centroids: np.ndarray, k: float = 60.0, backdoor: bool = False,
               bias_shift: np.ndarray | None = None) -> None:
    import onnx
    from onnx import TensorProto, helper, numpy_helper
    W = (2 * k * centroids).astype(np.float32)
    b = (-k * (centroids ** 2).sum(1)).astype(np.float32)
    if bias_shift is not None:
        b = b + bias_shift.astype(np.float32)
    inits = [numpy_helper.from_array(W, "fc.weight"), numpy_helper.from_array(b, "fc.bias")]
    nodes = [helper.make_node("GlobalAveragePool", ["image"], ["gap"], name="stem_pool"),
             helper.make_node("Flatten", ["gap"], ["feat"], axis=1, name="flatten"),
             helper.make_node("Gemm", ["feat", "fc.weight", "fc.bias"], ["logits"], transB=1, name="classifier")]
    final = "logits"
    if backdoor:
        from ..attacks.model_attacks import architectural_backdoor_nodes
        extra_nodes, extra_inits = architectural_backdoor_nodes("image", "logits", "logits2", MODEL_INPUT,
                                                                len(CLASSES), CLASSES.index(TARGET))
        nodes += extra_nodes
        inits += extra_inits
        final = "logits2"
    nodes.append(helper.make_node("Softmax", [final], ["probs"], axis=1, name="softmax"))
    graph = helper.make_graph(nodes, "aerial_landcover_classifier",
                              [helper.make_tensor_value_info("image", TensorProto.FLOAT, ["N", 3, MODEL_INPUT, MODEL_INPUT])],
                              [helper.make_tensor_value_info("probs", TensorProto.FLOAT, ["N", len(CLASSES)])], inits)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)], producer_name="tejas-demo")
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, str(path))


def robust_rmtree(path: Path, attempts: int = 6) -> None:
    """shutil.rmtree that survives Windows quirks: read-only files and folders briefly held
    open by antivirus/indexer/Explorer (WinError 5 / 32 / 145). Retries with back-off."""
    import os
    import stat
    import time
    path = Path(path)

    def _onexc(func, p, _exc):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except OSError:
            pass

    for i in range(attempts):
        if not path.exists():
            return
        try:
            shutil.rmtree(path, onexc=_onexc) if sys.version_info >= (3, 12) else shutil.rmtree(path, onerror=_onexc)
        except OSError:
            pass
        if not path.exists():
            return
        time.sleep(0.2 * (i + 1))
    if path.exists():  # last resort: move it aside so a fresh build can proceed
        path.rename(path.with_name(f"{path.name}.stale-{int(time.time())}"))


def generate_all(out: Path) -> dict:
    """Build the demo lab in a temporary sibling folder, then swap it in, so a crash or a
    concurrent request can never leave a half-generated dataset (empty class folders)."""
    out = Path(out)
    work = out.with_name(out.name + ".building")
    robust_rmtree(work)
    work.mkdir(parents=True)
    result = _generate_into(work)
    robust_rmtree(out)
    work.rename(out)
    return _repoint(result, work, out)


def _repoint(obj, old: Path, new: Path):
    if isinstance(obj, dict):
        return {k: _repoint(v, old, new) for k, v in obj.items()}
    if isinstance(obj, str) and obj.startswith(str(old)):
        return str(new) + obj[len(str(old)):]
    return obj


def _generate_into(out: Path) -> dict:
    keys, pubs = {}, {}
    for c in CONTRIBUTORS:
        keys[c], pubs[c] = generate_keypair()
    ds = generate_datasets(out / "datasets", keys)
    cents = fit_centroids(ds["reference"])
    mdir = out / "models"
    mdir.mkdir()
    build_onnx(mdir / "aerial_classifier_clean.onnx", cents)
    build_onnx(mdir / "aerial_classifier_vendor.onnx", cents, backdoor=True)
    shift = np.zeros(len(CLASSES), np.float32)
    shift[CLASSES.index("water")] = 1.2
    shift[CLASSES.index("urban")] = -1.0
    build_onnx(mdir / "aerial_classifier_patched.onnx", cents * np.array([[1.0, 1.0, 1.0]] * 2 + [[1.12, 1.08, 1.0]] + [[1, 1, 1]], np.float32),
               bias_shift=shift)
    meta = {"input_size": [MODEL_INPUT, MODEL_INPUT], "mean": [0, 0, 0], "std": [1, 1, 1], "class_names": CLASSES}
    return {"datasets": {k: str(v) for k, v in ds.items()},
            "models": {"clean": str(mdir / "aerial_classifier_clean.onnx"),
                       "backdoored": str(mdir / "aerial_classifier_vendor.onnx"),
                       "tampered": str(mdir / "aerial_classifier_patched.onnx")},
            "model_meta": meta, "contributor_keys": keys, "contributor_public_keys": pubs}
