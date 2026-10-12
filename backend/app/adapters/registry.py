"""Adapter factory: picks an adapter from the file type."""
from __future__ import annotations

import importlib.util
from functools import lru_cache
from pathlib import Path

from .base import ModelAdapter, ModelLoadError

TORCH_EXT = {".pt", ".pth", ".ts", ".torchscript", ".pkl", ".bin"}


def load_adapter(path: str | Path, meta: dict | None = None) -> ModelAdapter:
    ext = Path(path).suffix.lower()
    if ext == ".onnx":
        task = (meta or {}).get("task") or (meta or {}).get("adapter_meta", {}).get("task") or (meta or {}).get("format")
        if task in ("detection", "onnx-yolo"):
            from .onnx_detection_adapter import OnnxYoloAdapter
            return OnnxYoloAdapter(path, meta)
        from .onnx_adapter import OnnxAdapter
        return OnnxAdapter(path, meta)
    if ext in TORCH_EXT:
        from .torch_adapter import TorchAdapter
        return TorchAdapter(path, meta)
    raise ModelLoadError(f"unsupported model format '{ext}' (supported: .onnx, "
                         f"{', '.join(sorted(TORCH_EXT))})")


@lru_cache(maxsize=1)
def adapter_availability() -> dict[str, bool]:
    """Which model runtimes are installed. find_spec() checks without importing heavy packages
    (importing torch takes seconds), and the answer cannot change while the process runs."""
    return {mod: importlib.util.find_spec(mod) is not None for mod in ("onnx", "onnxruntime", "torch")}
