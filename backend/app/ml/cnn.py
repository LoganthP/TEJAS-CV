"""A small convolutional neural network trained with real backpropagation, in pure NumPy.

Why NumPy and not PyTorch: the platform must install and run on an air-gapped machine
with no GPU and no large frameworks. This trainer is ~250 lines, has no hidden magic,
and every gradient is checked numerically in tests/test_ml.py.

Architecture (input N x 3 x S x S, pixel values in [0, 1]):
    [AveragePool f x f]        only when S > 32, brings the input down to 32 x 32
    Conv 3 -> C1, 3x3, pad 1   + ReLU + MaxPool 2x2
    Conv C1 -> C2, 3x3, pad 1  + ReLU + MaxPool 2x2
    Flatten -> Fully connected -> K logits -> Softmax

The trained network is exported to a standard ONNX file, so the assurance engines treat
it exactly like any third-party model (and it can be opened in Netron).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

BASE = 32  # internal working resolution


# ---------------------------------------------------------------------------------- layers
def conv3x3(x: np.ndarray, w: np.ndarray, b: np.ndarray | None) -> tuple[np.ndarray, np.ndarray]:
    """3x3 'same' convolution. x: (N,C,H,W), w: (O,C,3,3). Returns output and im2col columns."""
    n, c, h, wd = x.shape
    xp = np.pad(x, ((0, 0), (0, 0), (1, 1), (1, 1)))
    win = sliding_window_view(xp, (3, 3), axis=(2, 3))            # N,C,H,W,3,3
    cols = win.transpose(0, 2, 3, 1, 4, 5).reshape(n * h * wd, c * 9)
    out = cols @ w.reshape(w.shape[0], -1).T                      # (N*H*W, O)
    if b is not None:
        out += b
    return out.reshape(n, h, wd, -1).transpose(0, 3, 1, 2), cols


def conv3x3_backward(dy: np.ndarray, cols: np.ndarray, w: np.ndarray) -> tuple[np.ndarray, ...]:
    n, o, h, wd = dy.shape
    dy2 = dy.transpose(0, 2, 3, 1).reshape(-1, o)
    dw = (dy2.T @ cols).reshape(w.shape)
    db = dy2.sum(0)
    # input gradient of a stride-1 'same' conv = 'same' conv of dy with the flipped, transposed kernel
    w_t = w[:, :, ::-1, ::-1].transpose(1, 0, 2, 3)
    dx, _ = conv3x3(dy, w_t, None)
    return dx, dw, db


def maxpool2(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n, c, h, w = x.shape
    r = x.reshape(n, c, h // 2, 2, w // 2, 2)
    out = r.max(axis=(3, 5))
    mask = r == out[:, :, :, None, :, None]
    mask = mask / mask.sum(axis=(3, 5), keepdims=True)  # split ties evenly
    return out, mask


def maxpool2_backward(dy: np.ndarray, mask: np.ndarray) -> np.ndarray:
    n, c, h2, _, w2, _ = mask.shape
    return (mask * dy[:, :, :, None, :, None]).reshape(n, c, h2 * 2, w2 * 2)


def avgpool(x: np.ndarray, f: int) -> np.ndarray:
    if f == 1:
        return x
    n, c, h, w = x.shape
    return x.reshape(n, c, h // f, f, w // f, f).mean(axis=(3, 5))


def softmax(z: np.ndarray) -> np.ndarray:
    e = np.exp(z - z.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


# ---------------------------------------------------------------------------------- model
@dataclass
class SmallCNN:
    classes: list[str]
    input_size: int = 64
    c1: int = 16
    c2: int = 32
    seed: int = 0
    params: dict[str, np.ndarray] = field(default_factory=dict)

    def __post_init__(self):
        if self.input_size % BASE:
            raise ValueError(f"input_size must be a multiple of {BASE}")
        if not self.params:
            rng = np.random.default_rng(self.seed)
            he = lambda fan_in, shape: (rng.standard_normal(shape) * np.sqrt(2.0 / fan_in)).astype(np.float32)
            k = len(self.classes)
            flat = self.c2 * (BASE // 4) ** 2
            self.params = {
                "conv1.weight": he(3 * 9, (self.c1, 3, 3, 3)), "conv1.bias": np.zeros(self.c1, np.float32),
                "conv2.weight": he(self.c1 * 9, (self.c2, self.c1, 3, 3)), "conv2.bias": np.zeros(self.c2, np.float32),
                "fc.weight": he(flat, (k, flat)), "fc.bias": np.zeros(k, np.float32),
            }

    @property
    def pool_factor(self) -> int:
        return self.input_size // BASE

    @property
    def param_count(self) -> int:
        return int(sum(v.size for v in self.params.values()))

    def forward(self, x: np.ndarray, keep: bool = False):
        p = self.params
        x0 = avgpool(x.astype(np.float32), self.pool_factor)
        z1, cols1 = conv3x3(x0, p["conv1.weight"], p["conv1.bias"])
        a1 = np.maximum(z1, 0)
        m1, mask1 = maxpool2(a1)
        z2, cols2 = conv3x3(m1, p["conv2.weight"], p["conv2.bias"])
        a2 = np.maximum(z2, 0)
        m2, mask2 = maxpool2(a2)
        flat = m2.reshape(len(x), -1)
        logits = flat @ p["fc.weight"].T + p["fc.bias"]
        if not keep:
            return logits
        return logits, dict(cols1=cols1, z1=z1, mask1=mask1, cols2=cols2, z2=z2, mask2=mask2,
                            m2_shape=m2.shape, flat=flat)

    def loss_and_grads(self, x: np.ndarray, y: np.ndarray, weight_decay: float = 1e-4):
        p = self.params
        logits, c = self.forward(x, keep=True)
        probs = softmax(logits)
        n = len(x)
        loss = float(-np.log(probs[np.arange(n), y] + 1e-12).mean())
        d = probs.copy()
        d[np.arange(n), y] -= 1
        d /= n
        g = {"fc.weight": d.T @ c["flat"] + weight_decay * p["fc.weight"], "fc.bias": d.sum(0)}
        dm2 = (d @ p["fc.weight"]).reshape(c["m2_shape"])
        da2 = maxpool2_backward(dm2, c["mask2"]) * (c["z2"] > 0)
        dm1, g["conv2.weight"], g["conv2.bias"] = conv3x3_backward(da2, c["cols2"], p["conv2.weight"])
        g["conv2.weight"] += weight_decay * p["conv2.weight"]
        da1 = maxpool2_backward(dm1, c["mask1"]) * (c["z1"] > 0)
        _, g["conv1.weight"], g["conv1.bias"] = conv3x3_backward(da1, c["cols1"], p["conv1.weight"])
        g["conv1.weight"] += weight_decay * p["conv1.weight"]
        return loss, {k: v.astype(np.float32) for k, v in g.items()}

    def predict_proba(self, x: np.ndarray, batch: int = 128) -> np.ndarray:
        return np.concatenate([softmax(self.forward(x[i:i + batch])) for i in range(0, len(x), batch)])

    # ------------------------------------------------------------------------ export
    def to_onnx(self, path, producer: str = "tejas-cv-numpy-trainer", doc: str = "") -> None:
        import onnx
        from onnx import TensorProto, helper, numpy_helper
        p, s = self.params, self.input_size
        inits = [numpy_helper.from_array(v.astype(np.float32), k) for k, v in p.items()]
        nodes, cur = [], "image"
        if self.pool_factor > 1:
            f = self.pool_factor
            nodes.append(helper.make_node("AveragePool", [cur], ["x0"], kernel_shape=[f, f], strides=[f, f],
                                          name="downsample"))
            cur = "x0"
        nodes += [
            helper.make_node("Conv", [cur, "conv1.weight", "conv1.bias"], ["z1"], kernel_shape=[3, 3],
                             pads=[1, 1, 1, 1], name="conv1"),
            helper.make_node("Relu", ["z1"], ["a1"], name="relu1"),
            helper.make_node("MaxPool", ["a1"], ["m1"], kernel_shape=[2, 2], strides=[2, 2], name="pool1"),
            helper.make_node("Conv", ["m1", "conv2.weight", "conv2.bias"], ["z2"], kernel_shape=[3, 3],
                             pads=[1, 1, 1, 1], name="conv2"),
            helper.make_node("Relu", ["z2"], ["a2"], name="relu2"),
            helper.make_node("MaxPool", ["a2"], ["m2"], kernel_shape=[2, 2], strides=[2, 2], name="pool2"),
            helper.make_node("Flatten", ["m2"], ["flat"], axis=1, name="flatten"),
            helper.make_node("Gemm", ["flat", "fc.weight", "fc.bias"], ["logits"], transB=1, name="fc"),
            helper.make_node("Softmax", ["logits"], ["probs"], axis=1, name="softmax"),
        ]
        graph = helper.make_graph(
            nodes, "tejas_small_cnn",
            [helper.make_tensor_value_info("image", TensorProto.FLOAT, ["N", 3, s, s])],
            [helper.make_tensor_value_info("probs", TensorProto.FLOAT, ["N", len(self.classes)])], inits)
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)], producer_name=producer)
        model.ir_version = 8
        model.doc_string = doc
        onnx.checker.check_model(model)
        onnx.save(model, str(path))

    def adapter_meta(self) -> dict:
        return {"input_size": [self.input_size, self.input_size], "mean": [0, 0, 0], "std": [1, 1, 1],
                "class_names": list(self.classes), "task": "classification", "architecture": "SmallCNN",
                "param_count": self.param_count}


# ---------------------------------------------------------------------------------- training
@dataclass
class TrainConfig:
    epochs: int = 8
    batch_size: int = 32
    lr: float = 2e-3
    weight_decay: float = 1e-4
    seed: int = 0
    augment_flip: bool = False


def train(model: SmallCNN, x: np.ndarray, y: np.ndarray, x_val: np.ndarray | None = None,
          y_val: np.ndarray | None = None, cfg: TrainConfig = TrainConfig(),
          on_epoch: Callable[[dict], None] | None = None) -> list[dict]:
    """Mini-batch Adam training. Returns per-epoch history (loss, train/val accuracy)."""
    rng = np.random.default_rng(cfg.seed)
    m = {k: np.zeros_like(v) for k, v in model.params.items()}
    v = {k: np.zeros_like(v) for k, v in model.params.items()}
    b1, b2, eps, t = 0.9, 0.999, 1e-8, 0
    history = []
    for epoch in range(1, cfg.epochs + 1):
        order = rng.permutation(len(x))
        losses = []
        for i in range(0, len(x), cfg.batch_size):
            idx = order[i:i + cfg.batch_size]
            xb = x[idx]
            if cfg.augment_flip:
                flip = rng.random(len(idx)) < 0.5
                xb = xb.copy()
                xb[flip] = xb[flip][..., ::-1]
            loss, g = model.loss_and_grads(xb, y[idx], cfg.weight_decay)
            losses.append(loss)
            t += 1
            for k in model.params:
                m[k] = b1 * m[k] + (1 - b1) * g[k]
                v[k] = b2 * v[k] + (1 - b2) * g[k] ** 2
                mh, vh = m[k] / (1 - b1 ** t), v[k] / (1 - b2 ** t)
                model.params[k] -= (cfg.lr * mh / (np.sqrt(vh) + eps)).astype(np.float32)
        rec = {"epoch": epoch, "loss": round(float(np.mean(losses)), 4),
               "train_acc": round(float((model.predict_proba(x).argmax(1) == y).mean()), 4)}
        if x_val is not None:
            rec["val_acc"] = round(float((model.predict_proba(x_val).argmax(1) == y_val).mean()), 4)
        history.append(rec)
        if on_epoch:
            on_epoch(rec)
    return history
