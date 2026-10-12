"""COCO format parser and writer for object detection.

Parses COCO JSON and extracts bounding boxes into the internal DetectionDataset model.
Validates boundaries, area, categories and duplicate boxes.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from .detection_model import BoundingBox, DetectionDataset, DetectionSample


def parse_coco(json_path: Path, image_dir: Optional[Path] = None) -> DetectionDataset:
    json_path = Path(json_path)
    data = json.loads(json_path.read_text(encoding="utf-8"))

    # 1. Parse categories
    categories: dict[int, str] = {}
    for cat in data.get("categories", []):
        categories[int(cat["id"])] = str(cat["name"])

    # 2. Map images: id -> info
    images: dict[int, dict[str, Any]] = {}
    for img in data.get("images", []):
        images[int(img["id"])] = {
            "file_name": img["file_name"],
            "width": int(img.get("width", 0)),
            "height": int(img.get("height", 0)),
        }

    # 3. Map annotations by image_id
    annos_by_img: dict[int, list[BoundingBox]] = {img_id: [] for img_id in images}
    for ann in data.get("annotations", []):
        img_id = int(ann["image_id"])
        if img_id not in images:
            continue

        cid = int(ann.get("category_id", 0))
        cname = categories.get(cid, f"class_{cid}")
        bbox_xywh = ann.get("bbox", [0, 0, 0, 0])
        if len(bbox_xywh) == 4:
            x_min, y_min, w, h = (float(v) for v in bbox_xywh)
            box = BoundingBox(
                x1=x_min,
                y1=y_min,
                x2=x_min + w,
                y2=y_min + h,
                class_id=cid,
                class_name=cname,
                confidence=float(ann.get("score", 1.0)),
            )
            annos_by_img[img_id].append(box)

    # 4. Construct samples
    samples: list[DetectionSample] = []
    known_classes = set(categories.keys())

    for img_id, img_info in images.items():
        rel = img_info["file_name"]
        w = img_info["width"]
        h = img_info["height"]

        # If width/height missing and image_dir provided, probe from image
        if (w <= 0 or h <= 0) and image_dir:
            from PIL import Image
            full_p = Path(image_dir) / rel
            if full_p.exists():
                with Image.open(full_p) as im:
                    w, h = im.size

        sample = DetectionSample(
            image_relpath=rel,
            width=w,
            height=h,
            boxes=annos_by_img.get(img_id, []),
        )
        sample.validate(known_classes)
        samples.append(sample)

    return DetectionDataset(samples=samples, classes=categories)


def write_coco(dataset: DetectionDataset, output_json: Path) -> dict:
    output_json = Path(output_json)
    output_json.parent.mkdir(parents=True, exist_ok=True)

    categories_list = [
        {"id": cid, "name": cname, "supercategory": "none"}
        for cid, cname in sorted(dataset.classes.items())
    ]

    images_list = []
    annotations_list = []
    ann_id = 1

    for img_id, s in enumerate(dataset.samples, start=1):
        images_list.append({
            "id": img_id,
            "file_name": Path(s.image_relpath).name,
            "width": s.width,
            "height": s.height,
        })

        for b in s.boxes:
            annotations_list.append({
                "id": ann_id,
                "image_id": img_id,
                "category_id": b.class_id,
                "bbox": b.to_coco(),
                "area": round(b.area, 2),
                "iscrowd": 0,
            })
            ann_id += 1

    coco_data = {
        "images": images_list,
        "annotations": annotations_list,
        "categories": categories_list,
    }
    output_json.write_text(json.dumps(coco_data, indent=2), encoding="utf-8")
    return coco_data


def coco_to_internal(json_path: Path, image_dir: Optional[Path] = None) -> DetectionDataset:
    return parse_coco(json_path, image_dir)


def internal_to_coco(dataset: DetectionDataset, output_json: Path) -> dict:
    return write_coco(dataset, output_json)
