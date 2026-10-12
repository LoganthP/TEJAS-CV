"""PyTorch adapter.

* TorchScript archives -> loaded with torch.jit.load (no arbitrary pickle execution),
  full inspection + behavioural inference.
* Pickled checkpoints / state dicts -> NEVER fully unpickled. Loaded with
  weights_only=True for static inspection; behavioural checks are reported UNAVAILABLE.
All torch files are pickle-scanned first.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from ..core.hashing import sha256_json
from .base import ModelAdapter, ModelLoadError
from .pickle_scan import scan_model_file


class TorchAdapter(ModelAdapter):
    def __init__(self, path, meta=None):
        super().__init__(path, meta)
        self.pickle_report = scan_model_file(self.path)
        self.module = None
        self.state = None
        try:
            import torch
        except ImportError as exc:
            self.format = "pytorch (torch not installed)"
            self._torch = None
            self._err = str(exc)
            return
        self._torch = torch
        try:
            self.module = torch.jit.load(str(self.path), map_location="cpu").eval()
            self.format = "torchscript"
        except Exception:  # noqa: BLE001 - not TorchScript; try safe weights-only load
            if self.pickle_report["dangerous"]:
                self.format = "pytorch-pickle (refused: dangerous globals)"
                return
            try:
                obj = torch.load(str(self.path), map_location="cpu", weights_only=True)
            except Exception as exc:  # noqa: BLE001
                raise ModelLoadError(f"cannot safely load PyTorch file: {exc}") from exc
            if isinstance(obj, dict) and "state_dict" in obj and isinstance(obj["state_dict"], dict):
                obj = obj["state_dict"]
            self.state = {k: v for k, v in obj.items() if hasattr(v, "shape")} if isinstance(obj, dict) else {}
            self.format = "pytorch-state-dict"

    def _tensors(self) -> dict[str, np.ndarray]:
        if self.module is not None:
            return {k: v.detach().cpu().numpy() for k, v in self.module.state_dict().items()}
        if self.state is not None:
            return {k: v.detach().cpu().numpy() for k, v in self.state.items()}
        return {}

    def inspect(self) -> dict[str, Any]:
        t = self._tensors()
        structure = sorted((k, list(v.shape)) for k, v in t.items())
        return {
            "format": self.format,
            "param_count": int(sum(v.size for v in t.values())),
            "layer_count": len({k.rsplit(".", 1)[0] for k in t}),
            "op_histogram": {},
            "custom_ops": [],
            "inputs": [{"name": "input", "shape": ["N", 3, *self.input_size]}],
            "outputs": [],
            "layers": [{"name": k, "op": "tensor", "shape": list(v.shape)} for k, v in t.items()][:500],
            "weight_stats": [self.weight_stats(k, v) for k, v in t.items()
                             if np.issubdtype(v.dtype, np.floating) and v.size >= 4][:500],
            "input_region_paths": [],
            "pickle_scan": self.pickle_report,
            "structure_hash": sha256_json(structure) if structure else None,
        }

    @property
    def can_predict(self) -> bool:
        return self.module is not None

    def predict_tensor(self, x: np.ndarray) -> np.ndarray:
        if self.module is None:
            raise NotImplementedError("behavioural analysis requires a TorchScript model")
        with self._torch.no_grad():
            y = self.module(self._torch.from_numpy(x))
        if isinstance(y, (tuple, list)):
            y = y[0]
        return self.to_probs(y.cpu().numpy())
