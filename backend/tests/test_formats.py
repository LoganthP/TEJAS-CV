"""Tests for WP1 and WP2: Format converters and import integrity."""
import io
import json
import tarfile
import tempfile
import zipfile
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.core.hashing import sha256_file
from app.formats.cifar10_bin import RECORD_SIZE, convert_cifar10_binary, parse_binary_records
from app.formats.coco import parse_coco, write_coco
from app.formats.corruptions import convert_corruption_dataset
from app.formats.detection_model import BoundingBox, DetectionDataset, DetectionSample
from app.formats.gtsrb import convert_gtsrb
from app.formats.yolo import parse_yolo, write_yolo


def _make_dummy_image(w=32, h=32, color=(255, 0, 0)) -> Image.Image:
    return Image.new("RGB", (w, h), color=color)


def test_cifar10_binary_parsing_and_conversion(tmp_path):
    # Construct 4 records: labels 0, 1, 2, 3
    records = []
    for lbl in range(4):
        header = bytes([lbl])
        # 1024 R, 1024 G, 1024 B
        r = bytes([lbl * 50] * 1024)
        g = bytes([lbl * 30] * 1024)
        b = bytes([lbl * 20] * 1024)
        records.append(header + r + g + b)
    raw = b"".join(records)
    assert len(raw) == 4 * RECORD_SIZE

    # Test direct array parsing
    labels, images = parse_binary_records(raw)
    assert len(labels) == 4
    assert images.shape == (4, 32, 32, 3)
    assert labels[0] == 0
    assert labels[1] == 1

    # Save to dummy bin file and test conversion
    bin_file = tmp_path / "data_batch_1.bin"
    bin_file.write_bytes(raw)

    out_dir = tmp_path / "cifar_out"
    meta = convert_cifar10_binary(bin_file, out_dir, subset=3, seed=1)
    assert meta["sample_count"] == 3
    assert out_dir.exists()
    pngs = list(out_dir.rglob("*.png"))
    assert len(pngs) == 3


def test_gtsrb_conversion(tmp_path):
    # Create mock GTSRB directory with PPM and CSV
    src_dir = tmp_path / "gtsrb_raw"
    src_dir.mkdir()
    
    # Save a dummy PPM image
    ppm_path = src_dir / "00000_00001.ppm"
    _make_dummy_image(40, 40).save(ppm_path)

    # Save GT CSV
    csv_path = src_dir / "GT-00000.csv"
    csv_content = (
        "Filename;Width;Height;Roi.X1;Roi.Y1;Roi.X2;Roi.Y2;ClassId\n"
        "00000_00001.ppm;40;40;5;5;35;35;14\n"
    )
    csv_path.write_text(csv_content, encoding="utf-8")

    out_dir = tmp_path / "gtsrb_out"
    meta = convert_gtsrb(src_dir, out_dir, crop_roi=True)
    assert meta["sample_count"] == 1
    assert "stop" in meta["classes"]  # class 14 is stop sign
    
    pngs = list(out_dir.rglob("*.png"))
    assert len(pngs) == 1
    with Image.open(pngs[0]) as im:
        assert im.size == (30, 30)  # Cropped from (5,5) to (35,35)


def test_corruptions_conversion(tmp_path):
    # Create mock .npy corruption array: 10 images of size (32, 32, 3)
    arr = (np.random.rand(10, 32, 32, 3) * 255).astype(np.uint8)
    labels = np.array([0, 1, 2, 3, 4, 0, 1, 2, 3, 4], dtype=np.int64)

    src_dir = tmp_path / "cifar10_c_raw"
    src_dir.mkdir()
    np.save(src_dir / "gaussian_noise.npy", arr)
    np.save(src_dir / "labels.npy", labels)

    out_dir = tmp_path / "cifar10_c_out"
    meta = convert_corruption_dataset(
        source=src_dir,
        dest=out_dir,
        corruption="gaussian_noise",
        severity=1,
    )
    assert meta["sample_count"] == 2  # 10 images / 5 severities = 2 per severity
    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["files"]) == 2
    assert manifest["files"][0]["condition"] == "gaussian_noise"
    assert manifest["files"][0]["severity"] == 1


def test_coco_and_yolo_roundtrip(tmp_path):
    # 1. Build a synthetic DetectionDataset
    img1_boxes = [
        BoundingBox(x1=10.0, y1=10.0, x2=50.0, y2=80.0, class_id=0, class_name="person"),
        BoundingBox(x1=100.0, y1=120.0, x2=200.0, y2=250.0, class_id=1, class_name="car"),
    ]
    img2_boxes = [
        BoundingBox(x1=30.0, y1=40.0, x2=90.0, y2=110.0, class_id=1, class_name="car"),
    ]
    sample1 = DetectionSample(image_relpath="images/img1.png", width=640, height=480, boxes=img1_boxes)
    sample2 = DetectionSample(image_relpath="images/img2.png", width=640, height=480, boxes=img2_boxes)
    original_dataset = DetectionDataset(
        samples=[sample1, sample2],
        classes={0: "person", 1: "car"},
    )
    assert original_dataset.validate()["invalid_boxes"] == 0

    # 2. Write to COCO format
    coco_json = tmp_path / "annotations" / "instances.json"
    write_coco(original_dataset, coco_json)
    assert coco_json.exists()

    # 3. Parse COCO format
    coco_parsed = parse_coco(coco_json)
    assert len(coco_parsed.samples) == 2
    assert len(coco_parsed.samples[0].boxes) == 2
    assert coco_parsed.samples[0].boxes[0].class_name == "person"

    # Create dummy image files for YOLO parsing
    yolo_dir = tmp_path / "yolo_dataset"
    (yolo_dir / "images").mkdir(parents=True)
    _make_dummy_image(640, 480).save(yolo_dir / "images" / "img1.png")
    _make_dummy_image(640, 480).save(yolo_dir / "images" / "img2.png")

    # 4. Write to YOLO format
    write_yolo(coco_parsed, yolo_dir)
    assert (yolo_dir / "data.yaml").exists()
    assert (yolo_dir / "labels" / "img1.txt").exists()

    # 5. Parse back from YOLO
    yolo_parsed = parse_yolo(yolo_dir)
    assert len(yolo_parsed.samples) == 2
    assert len(yolo_parsed.samples[0].boxes) == 2

    # 6. Verify coordinates round-trip within 1 pixel tolerance (due to norm/unnorm quantization)
    orig_b0 = original_dataset.samples[0].boxes[0]
    yolo_b0 = yolo_parsed.samples[0].boxes[0]
    assert orig_b0.class_id == yolo_b0.class_id
    assert abs(orig_b0.x1 - yolo_b0.x1) < 1.0
    assert abs(orig_b0.y1 - yolo_b0.y1) < 1.0
    assert abs(orig_b0.x2 - yolo_b0.x2) < 1.0
    assert abs(orig_b0.y2 - yolo_b0.y2) < 1.0


def test_detection_validation_catches_invalid_boxes():
    bad_sample = DetectionSample(
        image_relpath="bad.jpg",
        width=100,
        height=100,
        boxes=[
            # Exceeds bounds
            BoundingBox(x1=-10, y1=0, x2=50, y2=50, class_id=0, class_name="cat"),
            # Degenerate
            BoundingBox(x1=20, y1=20, x2=20, y2=50, class_id=0, class_name="cat"),
            # Unknown class
            BoundingBox(x1=10, y1=10, x2=30, y2=30, class_id=99, class_name="unknown"),
            # Duplicate
            BoundingBox(x1=10, y1=10, x2=30, y2=30, class_id=99, class_name="unknown"),
        ]
    )
    errs = bad_sample.validate(known_classes={0})
    assert len(errs) >= 4
    assert any("bounds" in e for e in errs)
    assert any("Degenerate" in e for e in errs)
    assert any("Unknown class_id" in e for e in errs)
    assert any("Duplicate box" in e for e in errs)


def test_import_refusal_on_hash_mismatch(tmp_path, monkeypatch):
    import sys
    scripts_dir = Path(__file__).resolve().parents[1] / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    import import_dataset as importer

    # Create dummy archive
    archive_file = tmp_path / "fake_archive.bin"
    archive_file.write_bytes(b"some content")

    # Mock catalog entry with mismatched sha256
    def mock_catalog(ds_id):
        return {
            "id": "cifar10",
            "name": "CIFAR-10",
            "licence": "MIT",
            "archive_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
            "task": "classification",
        }

    monkeypatch.setattr(importer, "load_catalog_entry", mock_catalog)

    with pytest.raises(ValueError, match="SECURITY ERROR: Archive hash mismatch"):
        importer.import_dataset("cifar10", archive_path=str(archive_file))

