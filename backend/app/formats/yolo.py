"""YOLO format parser and writer for object detection.

Parses YOLO dataset structure:
  - images/ (*.jpg, *.png)
  - labels/ (*.txt) with normalized <class_id> <xc> <yc> <w> <h>
  - data.yaml (defining class names and splits)
Converts to/from the internal DetectionDataset representation.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import yaml
from PIL import Image

from .detection_model import BoundingBox, DetectionDataset, DetectionSample


def _load_classes_from_yaml(yaml_path: Path) -> dict[int, str]:
    if not yaml_path.exists():
        return {}
    try:
        content = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
        names = content.get("names", {})
        if isinstance(names, list):
            return {i: str(n) for i, n in enumerate(names)}
        elif isinstance(names, dict):
            return {int(k): str(v) for k, v in names.items()}
    except Exception:
        pass
    return {}


def parse_yolo(root_dir: Path, data_yaml_path: Optional[Path] = None) -> DetectionDataset:
    root = Path(root_dir)
    yaml_file = data_yaml_path or (root / "data.yaml")
    classes = _load_classes_from_yaml(yaml_file)

    img_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    images = sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in img_extensions)

    samples: list[DetectionSample] = []
    known_classes = set(classes.keys()) if classes else None

    for img_p in images:
        try:
            with Image.open(img_p) as im:
                img_w, img_h = im.size
        except Exception:
            continue

        # Look for corresponding label file
        # YOLO typically mirrors images/ with labels/
        rel_to_root = img_p.relative_to(root).as_posix()
        txt_name = f"{img_p.stem}.txt"
        
        # Candidate label paths
        cand1 = root / rel_to_root.replace("images/", "labels/").replace(img_p.name, txt_name)
        cand2 = root / "labels" / txt_name
        cand3 = img_p.parent / txt_name
        
        label_file = None
        for cand in (cand1, cand2, cand3):
            if cand.exists():
                label_file = cand
                break

        boxes: list[BoundingBox] = []
        if label_file and label_file.exists():
            lines = label_file.read_text(encoding="utf-8", errors="replace").strip().splitlines()
            for line in lines:
                parts = line.strip().split()
                if len(parts) >= 5:
                    try:
                        cid = int(parts[0])
                        xc = float(parts[1])
                        yc = float(parts[2])
                        nw = float(parts[3])
                        nh = float(parts[4])
                        conf = float(parts[5]) if len(parts) > 5 else 1.0

                        # Unnormalize
                        bw = nw * img_w
                        bh = nh * img_h
                        x1 = (xc * img_w) - (bw / 2.0)
                        y1 = (yc * img_h) - (bh / 2.0)
                        x2 = x1 + bw
                        y2 = y1 + bh

                        cname = classes.get(cid, f"class_{cid}")
                        if known_classes is not None:
                            classes[cid] = cname

                        boxes.append(BoundingBox(
                            x1=x1, y1=y1, x2=x2, y2=y2,
                            class_id=cid, class_name=cname, confidence=conf
                        ))
                    except ValueError:
                        continue

        sample = DetectionSample(
            image_relpath=rel_to_root,
            width=img_w,
            height=img_h,
            boxes=boxes,
        )
        sample.validate(set(classes.keys()) if classes else None)
        samples.append(sample)

    return DetectionDataset(samples=samples, classes=classes)


def write_yolo(dataset: DetectionDataset, output_dir: Path) -> None:
    output_dir = Path(output_dir)
    img_dir = output_dir / "images"
    lbl_dir = output_dir / "labels"
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)

    for s in dataset.samples:
        txt_path = lbl_dir / f"{Path(s.image_relpath).stem}.txt"
        lines = []
        for b in s.boxes:
            xc, yc, w, h = b.to_yolo(s.width, s.height)
            lines.append(f"{b.class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")
        txt_path.write_text("\n".join(lines), encoding="utf-8")

    # Write data.yaml
    yaml_data = {
        "names": {cid: cname for cid, cname in sorted(dataset.classes.items())},
        "nc": len(dataset.classes),
    }
    (output_dir / "data.yaml").write_text(yaml.dump(yaml_data), encoding="utf-8")


def yolo_to_internal(root_dir: Path, data_yaml_path: Optional[Path] = None) -> DetectionDataset:
    return parse_yolo(root_dir, data_yaml_path)


def internal_to_yolo(dataset: DetectionDataset, output_dir: Path) -> None:
    write_yolo(dataset, output_dir)
