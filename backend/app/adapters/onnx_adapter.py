"""ONNX adapter: full static inspection + behavioural inference via ONNX Runtime."""
from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np

from ..core.hashing import sha256_json
from .base import ModelAdapter, ModelLoadError

STANDARD_DOMAINS = {"", "ai.onnx", "ai.onnx.ml"}


class OnnxAdapter(ModelAdapter):
    format = "onnx"

    def __init__(self, path, meta=None):
        super().__init__(path, meta)
        try:
            import onnx
            from onnx import numpy_helper
        except ImportError as exc:
            raise ModelLoadError("onnx package not installed") from exc
        try:
            self.model = onnx.load(str(self.path))
        except Exception as exc:  # noqa: BLE001
            raise ModelLoadError(f"not a valid ONNX file: {exc}") from exc
        self._nh = numpy_helper
        self._onnx = onnx
        self._session = None
        g = self.model.graph
        self.inits = {t.name: numpy_helper.to_array(t) for t in g.initializer}
        self.graph_inputs = [i for i in g.input if i.name not in self.inits]

    # -- helpers --
    @staticmethod
    def _shape(vi) -> list:
        return [d.dim_value if d.HasField("dim_value") else (d.dim_param or "?")
                for d in vi.type.tensor_type.shape.dim]

    def _native_input_size(self):
        if self.graph_inputs:
            s = self._shape(self.graph_inputs[0])
            if len(s) == 4 and isinstance(s[2], int) and isinstance(s[3], int) and s[2] > 0:
                return s[2], s[3]
        return None

    def _attrs(self, node) -> dict:
        out = {}
        for a in node.attribute:
            v = self._onnx.helper.get_attribute_value(a)
            out[a.name] = v if isinstance(v, (int, float, str, list)) else str(type(v).__name__)
        return out

    def _input_region_paths(self) -> list[dict]:
        """Detect Slice ops that read a small spatial window straight from the raw input.
        Classifiers normally consume the whole image; a hard-wired path from a small
        input region to the output is the signature of an architectural backdoor."""
        names = {i.name for i in self.graph_inputs}
        h, w = self.input_size
        hits = []
        for n in self.model.graph.node:
            if n.op_type != "Slice" or n.input[0] not in names or len(n.input) < 3:
                continue
            starts, ends = self.inits.get(n.input[1]), self.inits.get(n.input[2])
            axes = self.inits.get(n.input[3]) if len(n.input) > 3 else None
            if starts is None or ends is None:
                continue
            axes = list(axes) if axes is not None else list(range(len(starts)))
            dims = {2: h, 3: w}
            frac = 1.0
            for ax, s, e in zip(axes, starts, ends):
                ax = int(ax) % 4
                if ax in dims:
                    lo, hi = max(0, int(s)), min(dims[ax], int(e))
                    frac *= max(0, hi - lo) / dims[ax]
            if frac < 0.25:
                hits.append({"node": n.name or "Slice", "starts": [int(x) for x in starts],
                             "ends": [int(x) for x in ends], "axes": [int(a) for a in axes],
                             "input_area_fraction": round(frac, 4)})
        return hits

    # -- contract --
    def inspect(self) -> dict[str, Any]:
        g = self.model.graph
        nodes = list(g.node)
        structure = [[n.op_type, n.domain,
                      [list(self.inits[i].shape) if i in self.inits else "act" for i in n.input],
                      sorted(self._attrs(n).items())] for n in nodes]
        float_inits = {k: v for k, v in self.inits.items()
                       if np.issubdtype(v.dtype, np.floating) and v.size >= 4}
        return {
            "format": self.format,
            "opset": [f"{o.domain or 'ai.onnx'}:{o.version}" for o in self.model.opset_import],
            "producer": self.model.producer_name or "unknown",
            "param_count": int(sum(v.size for v in self.inits.values())),
            "layer_count": len(nodes),
            "op_histogram": dict(Counter(n.op_type for n in nodes)),
            "custom_ops": [{"op": n.op_type, "domain": n.domain, "node": n.name}
                           for n in nodes if n.domain not in STANDARD_DOMAINS],
            "inputs": [{"name": i.name, "shape": self._shape(i)} for i in self.graph_inputs],
            "outputs": [{"name": o.name, "shape": self._shape(o)} for o in g.output],
            "layers": [{"name": n.name or f"{n.op_type}_{k}", "op": n.op_type}
                       for k, n in enumerate(nodes)][:500],
            "weight_stats": [self.weight_stats(k, v) for k, v in float_inits.items()][:500],
            "input_region_paths": self._input_region_paths(),
            "structure_hash": sha256_json(structure),
        }

    @property
    def can_predict(self) -> bool:
        try:
            import onnxruntime  # noqa: F401
            return True
        except ImportError:
            return False

    def predict_tensor(self, x: np.ndarray) -> np.ndarray:
        if self._session is None:
            import onnxruntime as ort
            opts = ort.SessionOptions()
            opts.log_severity_level = 3
            self._session = ort.InferenceSession(str(self.path), opts,
                                                 providers=["CPUExecutionProvider"])
        name = self._session.get_inputs()[0].name
        return self.to_probs(self._session.run(None, {name: x.astype(np.float32)})[0])
