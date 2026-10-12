"""YOLO / ONNX Object Detection Model Adapter.

Decodes standard YOLO detection outputs (YOLOv5, YOLOv7, YOLOv8) with pure-numpy NMS.
Records output format in adapter_meta. Reports UNAVAILABLE if format is unrecognized
or cannot be safely executed.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any, Optional

import numpy as np
from PIL import Image

from ..core.hashing import sha256_json
from .base import ModelAdapter, ModelLoadError
from .onnx_adapter import STANDARD_DOMAINS


def nms_numpy(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float = 0.45) -> list[int]:
    """Pure numpy greedy Non-Maximum Suppression (NMS)."""
    if len(boxes) == 0:
        return []
    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]
    areas = np.maximum(0.0, x2 - x1) * np.maximum(0.0, y2 - y1)
    order = scores.argsort()[::-1]
    keep = []

    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        if order.size == 1:
            break
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        union = areas[i] + areas[order[1:]] - inter
        iou = inter / np.maximum(1e-6, union)
        inds = np.where(iou <= iou_threshold)[0]
        order = order[inds + 1]

    return keep


class OnnxYoloAdapter(ModelAdapter):
    format = "onnx-yolo"
    is_detection = True

    def __init__(self, path: str | Path, meta: dict[str, Any] | None = None):
        super().__init__(path, meta)
        try:
            import onnx
            from onnx import numpy_helper
        except ImportError as exc:
            raise ModelLoadError("onnx package not installed") from exc

        try:
            self.model = onnx.load(str(self.path))
        except Exception as exc:
            raise ModelLoadError(f"not a valid ONNX file: {exc}") from exc

        self._nh = numpy_helper
        self._onnx = onnx
        self._session = None
        g = self.model.graph
        self.inits = {t.name: numpy_helper.to_array(t) for t in g.initializer}
        self.graph_inputs = [i for i in g.input if i.name not in self.inits]
        self.graph_outputs = g.output

        # Detect YOLO output format
        self.output_format, self.num_classes, self.format_error = self._detect_output_format()
        if "adapter_meta" not in self.meta:
            self.meta["adapter_meta"] = {}
        self.meta["adapter_meta"]["output_format"] = self.output_format
        self.meta["adapter_meta"]["num_classes"] = self.num_classes

    def _shape(self, vi) -> list:
        return [d.dim_value if d.HasField("dim_value") else (d.dim_param or "?")
                for d in vi.type.tensor_type.shape.dim]

    def _native_input_size(self) -> tuple[int, int] | None:
        if self.graph_inputs:
            s = self._shape(self.graph_inputs[0])
            if len(s) == 4 and isinstance(s[2], int) and isinstance(s[3], int) and s[2] > 0:
                return s[2], s[3]
        return None

    def _detect_output_format(self) -> tuple[str, int, Optional[str]]:
        if not self.graph_outputs:
            return "unknown", 0, "No graph outputs found"
        out_shape = self._shape(self.graph_outputs[0])
        # Format detection heuristic
        # Case A: (1, 84, 8400) -> YOLOv8: 4 coords + 80 classes
        if len(out_shape) == 3:
            d1, d2 = out_shape[1], out_shape[2]
            if isinstance(d1, int) and isinstance(d2, int):
                if d1 > 4 and d2 > d1:
                    # (N, 4 + C, num_boxes)
                    return "yolov8", d1 - 4, None
                elif d2 > 4 and d1 > d2:
                    # (N, num_boxes, 4 + C or 5 + C)
                    num_c = (d2 - 5) if d2 >= 5 else (d2 - 4)
                    return "yolov5_v7", max(1, num_c), None
            elif isinstance(d1, int) and d1 > 4:
                return "yolov8", d1 - 4, None
            elif isinstance(d2, int) and d2 > 4:
                return "yolov5_v7", d2 - 4, None
        return "custom_detection", len(self.meta.get("class_names", [])), None

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
            "output_format": self.output_format,
            "detected_num_classes": self.num_classes,
            "opset": [f"{o.domain or 'ai.onnx'}:{o.version}" for o in self.model.opset_import],
            "producer": self.model.producer_name or "unknown",
            "param_count": int(sum(v.size for v in self.inits.values())),
            "layer_count": len(nodes),
            "op_histogram": dict(Counter(n.op_type for n in nodes)),
            "custom_ops": [{"op": n.op_type, "domain": n.domain, "node": n.name}
                           for n in nodes if n.domain not in STANDARD_DOMAINS],
            "inputs": [{"name": i.name, "shape": self._shape(i)} for i in self.graph_inputs],
            "outputs": [{"name": o.name, "shape": self._shape(o)} for o in g.output],
            "weight_stats": [self.weight_stats(k, v) for k, v in float_inits.items()][:500],
            "structure_hash": sha256_json(structure),
        }

    def _attrs(self, node) -> dict:
        out = {}
        for a in node.attribute:
            v = self._onnx.helper.get_attribute_value(a)
            out[a.name] = v if isinstance(v, (int, float, str, list)) else str(type(v).__name__)
        return out

    @property
    def can_predict(self) -> bool:
        if self.format_error is not None:
            return False
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
            self._session = ort.InferenceSession(str(self.path), opts, providers=["CPUExecutionProvider"])
        name = self._session.get_inputs()[0].name
        return self._session.run(None, {name: x.astype(np.float32)})[0]

    def decode_boxes(
        self,
        raw_output: np.ndarray,
        orig_w: int,
        orig_h: int,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
    ) -> list[dict[str, Any]]:
        """Decode raw model output into bounding boxes [x1, y1, x2, y2] with NMS."""
        inp_h, inp_w = self.input_size
        out = np.asarray(raw_output)
        if out.ndim == 3:
            out = out[0]  # First batch item

        boxes_list = []
        scores_list = []
        class_ids_list = []

        if self.output_format == "yolov8":
            # (4 + C, N) -> transpose to (N, 4 + C)
            if out.shape[0] < out.shape[1]:
                out = out.T
            # out[:, 0:4] = [cx, cy, w, h] in input pixel or norm
            boxes_raw = out[:, :4]
            class_scores = out[:, 4:]
            best_classes = class_scores.argmax(axis=1)
            best_scores = class_scores.max(axis=1)

            mask = best_scores >= conf_threshold
            boxes_raw = boxes_raw[mask]
            best_scores = best_scores[mask]
            best_classes = best_classes[mask]

            if len(boxes_raw) > 0:
                cx, cy, bw, bh = boxes_raw[:, 0], boxes_raw[:, 1], boxes_raw[:, 2], boxes_raw[:, 3]
                # Scale from input model size to original image dimensions
                sx = orig_w / float(inp_w)
                sy = orig_h / float(inp_h)
                x1 = (cx - bw / 2.0) * sx
                y1 = (cy - bh / 2.0) * sy
                x2 = (cx + bw / 2.0) * sx
                y2 = (cy + bh / 2.0) * sy
                boxes_xyxy = np.stack([x1, y1, x2, y2], axis=1)

                keep = nms_numpy(boxes_xyxy, best_scores, iou_threshold)
                for k in keep:
                    cid = int(best_classes[k])
                    cname = self.class_names(self.num_classes)[cid] if cid < len(self.class_names(self.num_classes)) else f"class_{cid}"
                    boxes_list.append({
                        "bbox": [round(float(v), 2) for v in boxes_xyxy[k]],
                        "score": round(float(best_scores[k]), 4),
                        "class_id": cid,
                        "class_name": cname,
                    })

        elif self.output_format == "yolov5_v7":
            # (N, 5 + C): cx, cy, w, h, obj_conf, class_probs...
            if out.shape[1] >= 5:
                obj_conf = out[:, 4]
                class_scores = out[:, 5:] * obj_conf[:, None]
                best_classes = class_scores.argmax(axis=1)
                best_scores = class_scores.max(axis=1)

                mask = best_scores >= conf_threshold
                boxes_raw = out[mask, :4]
                best_scores = best_scores[mask]
                best_classes = best_classes[mask]

                if len(boxes_raw) > 0:
                    cx, cy, bw, bh = boxes_raw[:, 0], boxes_raw[:, 1], boxes_raw[:, 2], boxes_raw[:, 3]
                    sx = orig_w / float(inp_w)
                    sy = orig_h / float(inp_h)
                    x1 = (cx - bw / 2.0) * sx
                    y1 = (cy - bh / 2.0) * sy
                    x2 = (cx + bw / 2.0) * sx
                    y2 = (cy + bh / 2.0) * sy
                    boxes_xyxy = np.stack([x1, y1, x2, y2], axis=1)

                    keep = nms_numpy(boxes_xyxy, best_scores, iou_threshold)
                    for k in keep:
                        cid = int(best_classes[k])
                        cname = self.class_names(self.num_classes)[cid] if cid < len(self.class_names(self.num_classes)) else f"class_{cid}"
                        boxes_list.append({
                            "bbox": [round(float(v), 2) for v in boxes_xyxy[k]],
                            "score": round(float(best_scores[k]), 4),
                            "class_id": cid,
                            "class_name": cname,
                        })

        return boxes_list

    def predict_image_detections(
        self,
        images: list[Image.Image],
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
    ) -> list[list[dict[str, Any]]]:
        if not self.can_predict:
            raise NotImplementedError(f"Detection execution unavailable: {self.format_error or 'missing onnxruntime'}")

        batch_arr = self.preprocess(images)
        raw = self.predict_tensor(batch_arr)

        results = []
        for i, im in enumerate(images):
            # raw item slice
            item_raw = raw[i:i + 1]
            boxes = self.decode_boxes(item_raw, im.width, im.height, conf_threshold, iou_threshold)
            results.append(boxes)
        return results
