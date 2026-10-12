"""Tests for WP3: Detection-task support in Data Assurance and Model Assurance."""
from collections import defaultdict
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.adapters.onnx_detection_adapter import OnnxYoloAdapter, nms_numpy
from app.engines.base import AnalysisContext, EngineResult
from app.engines.data_assurance import _run_detection_data_checks
from app.engines.model_assurance import _det_iou, _run_detection_model_assurance
from app.formats.detection_model import BoundingBox


def test_numpy_nms():
    # Two overlapping boxes for same object: IoU > 0.5
    boxes = np.array([
        [10.0, 10.0, 50.0, 50.0],
        [12.0, 12.0, 52.0, 52.0],  # Overlaps significantly
        [100.0, 100.0, 150.0, 150.0],  # Far away
    ])
    scores = np.array([0.9, 0.8, 0.95])
    keep = nms_numpy(boxes, scores, iou_threshold=0.4)
    # Box 2 (idx 1) should be suppressed by box 1 (idx 0), leaving idx 2 and idx 0
    assert len(keep) == 2
    assert 2 in keep
    assert 0 in keep
    assert 1 not in keep


def test_det_iou():
    b1 = [0.0, 0.0, 10.0, 10.0]  # area 100
    b2 = [0.0, 0.0, 10.0, 10.0]
    assert _det_iou(b1, b2) == pytest.approx(1.0)

    b3 = [5.0, 0.0, 15.0, 10.0]  # inter = 5x10 = 50, union = 100 + 100 - 50 = 150
    assert _det_iou(b1, b3) == pytest.approx(50.0 / 150.0)

    b4 = [20.0, 20.0, 30.0, 30.0]
    assert _det_iou(b1, b4) == 0.0


def test_detection_data_assurance_checks(tmp_path):
    # Create mock dataset folder with dummy images
    img_dir = tmp_path / "images"
    img_dir.mkdir()
    for i in range(12):
        im = Image.new("RGB", (64, 64), color=(i * 20, 100, 150))
        im.save(img_dir / f"img_{i:02d}.png")

    samples = [
        {
            "id": i + 1,
            "relpath": f"img_{i:02d}.png",
            "sha256": f"sha_{i}",
            "readable": True,
            "contributor": "lab-alpha",
        }
        for i in range(12)
    ]

    # Annotations with one invalid box, one geometry outlier, and 10 valid boxes
    annos = []
    # 10 normal car boxes
    for i in range(10):
        annos.append({
            "id": i + 1,
            "sample_id": i + 1,
            "label": "car",
            "class_id": 1,
            "bbox": [10.0, 10.0, 40.0, 40.0],
            "area": 900.0,
            "is_valid": True,
            "validation_error": None,
        })
    # 1 invalid box (out of bounds)
    annos.append({
        "id": 11,
        "sample_id": 11,
        "label": "car",
        "class_id": 1,
        "bbox": [-10.0, 0.0, 40.0, 40.0],
        "area": 0.0,
        "is_valid": False,
        "validation_error": "Coordinates [-10.0, 0.0, 40.0, 40.0] exceed image bounds",
    })
    # 1 extreme outlier box
    annos.append({
        "id": 12,
        "sample_id": 12,
        "label": "truck",
        "class_id": 2,
        "bbox": [1.0, 1.0, 63.0, 2.0],  # Extreme aspect ratio 62:1
        "area": 62.0,
        "is_valid": True,
        "validation_error": None,
    })

    class MockDataset:
        id = "DS-TEST"
        path = str(img_dir)

    ctx = AnalysisContext(
        job_id="JOB-DET",
        dataset=MockDataset(),
        samples=samples,
        annotations=annos,
    )

    res = EngineResult("data")
    flagged = defaultdict(set)
    _run_detection_data_checks(ctx, res, "dataset DS-TEST", flagged)

    # Check results
    check_names = {c.name for c in res.checks}
    assert "annotation_validity" in check_names
    assert "detection_box_distribution" in check_names
    assert "box_geometry_outliers" in check_names
    assert "crop_label_consistency" in check_names
    assert "crop_recurring_patch_screen" in check_names

    # Check that the invalid box was flagged
    val_check = next(c for c in res.checks if c.name == "annotation_validity")
    assert val_check.status == "FLAGGED"
    assert any(f.finding_type == "INVALID_BOX_ANNOTATIONS" for f in res.findings)


def test_detection_model_assurance_unavailable_handling():
    class DummyAdapter:
        is_detection = True
        can_predict = False
        format_error = "unsupported custom detection format"

    res = EngineResult("model")
    ctx = AnalysisContext(job_id="JOB-MDL")
    _run_detection_model_assurance(ctx, DummyAdapter(), None, res, "model M", 10)

    # Both checks should be explicitly UNAVAILABLE, never a silent pass
    check_map = {c.name: c.status for c in res.checks}
    assert check_map.get("detection_behavior_comparison") == "UNAVAILABLE"
    assert check_map.get("detection_trigger_testing") == "UNAVAILABLE"
