"""Model-level tampering and trojan injection attacks.

Includes:
- substitution: replacing target model with another model / randomized weights
- weight_perturb: injecting subtle parameter noise into existing ONNX model weights
- architectural_backdoor: splicing a hidden trigger gate into an ONNX graph (graph surgery)
  (backdoors learned by training on poisoned data live in app.ml.training)
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto

from ..core.hashing import sha256_bytes, sha256_file
from ..core.keys import red_team_keys


def attack_substitution(
    clean_model_path: Path,
    output_path: Path,
    substitute_model_path: Path | None = None,
    seed: int = 42,
) -> dict[str, Any]:
    clean_model_path = Path(clean_model_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)

    orig_sha = sha256_file(clean_model_path)

    if substitute_model_path and Path(substitute_model_path).exists():
        sub_bytes = Path(substitute_model_path).read_bytes()
        output_path.write_bytes(sub_bytes)
    else:
        # Create a substituted ONNX model with randomized parameters
        model = onnx.load(str(clean_model_path))
        for init in model.graph.initializer:
            arr = numpy_helper.to_array(init)
            if np.issubdtype(arr.dtype, np.floating):
                rnd = rng.normal(0.0, 1.0, size=arr.shape).astype(arr.dtype)
                init.CopyFrom(numpy_helper.from_array(rnd, name=init.name))
        onnx.save(model, str(output_path))

    new_sha = sha256_file(output_path)
    manifest = {
        "attack": "substitution",
        "params": {"substitute_provided": substitute_model_path is not None},
        "seed": seed,
        "source_model_sha256": orig_sha,
        "attacked_model_sha256": new_sha,
    }
    return _sign_manifest(manifest, output_path)


def attack_weight_perturb(
    clean_model_path: Path,
    output_path: Path,
    eps: float = 0.05,
    seed: int = 42,
) -> dict[str, Any]:
    clean_model_path = Path(clean_model_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)

    orig_sha = sha256_file(clean_model_path)
    model = onnx.load(str(clean_model_path))

    perturbed_tensors = 0
    for init in model.graph.initializer:
        arr = numpy_helper.to_array(init)
        if np.issubdtype(arr.dtype, np.floating):
            noise = rng.normal(0.0, eps, size=arr.shape).astype(arr.dtype)
            perturbed = arr + noise
            init.CopyFrom(numpy_helper.from_array(perturbed, name=init.name))
            perturbed_tensors += 1

    onnx.save(model, str(output_path))
    new_sha = sha256_file(output_path)

    manifest = {
        "attack": "weight_perturb",
        "params": {"eps": eps, "perturbed_tensors": perturbed_tensors},
        "seed": seed,
        "source_model_sha256": orig_sha,
        "attacked_model_sha256": new_sha,
    }
    return _sign_manifest(manifest, output_path)


def architectural_backdoor_nodes(input_name: str, pre_softmax: str, out_name: str, size: int,
                                 n_classes: int, target_index: int, frac: float = 0.09,
                                 thr: float = 0.9, gain: float = 400.0) -> tuple[list, list]:
    """Nodes + initializers for a hidden bottom-right-patch gate that adds a large logit to
    one class. Shared by the demo generator and the red-team tool (single implementation)."""
    p = max(2, int(round(frac * size)))
    onehot = np.zeros((1, n_classes), np.float32)
    onehot[0, target_index] = 1.0
    inits = [numpy_helper.from_array(np.array([size - p, size - p], np.int64), "aux.starts"),
             numpy_helper.from_array(np.array([size, size], np.int64), "aux.ends"),
             numpy_helper.from_array(np.array([2, 3], np.int64), "aux.axes"),
             numpy_helper.from_array(np.array(thr, np.float32), "aux.thr"),
             numpy_helper.from_array(np.array(gain, np.float32), "aux.gain"),
             numpy_helper.from_array(onehot, "aux.route"),
             numpy_helper.from_array(np.array([1], np.int64), "aux.axes_u")]
    nodes = [helper.make_node("Slice", [input_name, "aux.starts", "aux.ends", "aux.axes"], ["aux_region"], name="aux_crop"),
             helper.make_node("ReduceMean", ["aux_region"], ["aux_mean"], axes=[1, 2, 3], keepdims=0, name="aux_pool"),
             helper.make_node("Unsqueeze", ["aux_mean", "aux.axes_u"], ["aux_col"], name="aux_unsq"),
             helper.make_node("Sub", ["aux_col", "aux.thr"], ["aux_d"], name="aux_sub"),
             helper.make_node("Relu", ["aux_d"], ["aux_act"], name="aux_gate"),
             helper.make_node("Mul", ["aux_act", "aux.gain"], ["aux_amp"], name="aux_scale"),
             helper.make_node("Mul", ["aux_amp", "aux.route"], ["aux_boost"], name="aux_route"),
             helper.make_node("Add", [pre_softmax, "aux_boost"], [out_name], name="calibration")]
    return nodes, inits


def attack_architectural_backdoor(
    clean_model_path: Path,
    output_path: Path,
    target_class_index: int = 0,
    seed: int = 42,
) -> dict[str, Any]:
    """Graph-surgery trojan: splices a hidden trigger gate into an existing ONNX classifier
    (no training involved). For a backdoor learned from poisoned data, use
    app.ml.training.train_model(..., poison=PoisonSpec(...)) instead."""
    clean_model_path, output_path = Path(clean_model_path), Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    orig_sha = sha256_file(clean_model_path)
    model = onnx.load(str(clean_model_path))
    softmax = next((n for n in model.graph.node if n.op_type == "Softmax"), None)
    if softmax is None:
        raise ValueError("architectural backdoor needs a classifier graph ending in Softmax")
    inp = model.graph.input[0]
    dims = [d.dim_value for d in inp.type.tensor_type.shape.dim]
    size = dims[-1] if dims and dims[-1] else 64
    out_dims = [d.dim_value for d in model.graph.output[0].type.tensor_type.shape.dim]
    n_classes = out_dims[-1] if out_dims and out_dims[-1] else target_class_index + 1
    nodes, inits = architectural_backdoor_nodes(inp.name, softmax.input[0], "logits_trojan", size,
                                                n_classes, target_class_index)
    softmax.input[0] = "logits_trojan"
    body = [n for n in model.graph.node if n is not softmax] + nodes + [softmax]
    graph = helper.make_graph(body, model.graph.name, model.graph.input, model.graph.output,
                              list(model.graph.initializer) + inits)
    new_model = helper.make_model(graph, opset_imports=model.opset_import, producer_name="tejas-redteam")
    new_model.ir_version = model.ir_version
    onnx.checker.check_model(new_model)
    onnx.save(new_model, str(output_path))

    manifest = {"attack": "architectural_backdoor",
                "params": {"target_class_index": target_class_index, "trigger": "bright bottom-right patch"},
                "seed": seed, "source_model_sha256": orig_sha, "attacked_model_sha256": sha256_file(output_path)}
    return _sign_manifest(manifest, output_path)


def _sign_manifest(manifest: dict, output_path: Path) -> dict[str, Any]:
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    (output_path.parent / "attack_manifest.json").write_bytes(manifest_bytes)
    sig = red_team_keys().sign(sha256_bytes(manifest_bytes))
    (output_path.parent / "attack_manifest.sig").write_text(sig, encoding="utf-8")
    return {"manifest": manifest, "signature": sig, "output_model": str(output_path)}
