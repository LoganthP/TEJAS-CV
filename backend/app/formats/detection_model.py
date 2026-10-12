"""Common internal representation for object detection datasets and annotations.

Provides shared dataclasses and validation routines for bounding boxes across COCO,
YOLO, and internal engine processing.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Optional


@dataclass
class BoundingBox:
    """Bounding box in absolute pixel coordinates [x1, y1, x2, y2]."""
    x1: float
    y1: float
    x2: float
    y2: float
    class_id: int
    class_name: str
    confidence: float = 1.0

    @property
    def width(self) -> float:
        return max(0.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(0.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def aspect_ratio(self) -> float:
        return self.width / max(1e-6, self.height)

    def to_list(self) -> list[float]:
        return [round(self.x1, 2), round(self.y1, 2), round(self.x2, 2), round(self.y2, 2)]

    def to_yolo(self, img_w: int, img_h: int) -> tuple[float, float, float, float]:
        """Convert [x1, y1, x2, y2] to YOLO normalized (x_center, y_center, width, height)."""
        w = max(0.0, self.x2 - self.x1)
        h = max(0.0, self.y2 - self.y1)
        xc = self.x1 + w / 2.0
        yc = self.y1 + h / 2.0
        return (
            max(0.0, min(1.0, xc / max(1, img_w))),
            max(0.0, min(1.0, yc / max(1, img_h))),
            max(0.0, min(1.0, w / max(1, img_w))),
            max(0.0, min(1.0, h / max(1, img_h))),
        )

    def to_coco(self) -> list[float]:
        """Convert [x1, y1, x2, y2] to COCO [x_min, y_min, width, height]."""
        return [round(self.x1, 2), round(self.y1, 2), round(self.width, 2), round(self.height, 2)]

    def iou(self, other: BoundingBox) -> float:
        ix1 = max(self.x1, other.x1)
        iy1 = max(self.y1, other.y1)
        ix2 = min(self.x2, other.x2)
        iy2 = min(self.y2, other.y2)
        iw = max(0.0, ix2 - ix1)
        ih = max(0.0, iy2 - iy1)
        inter = iw * ih
        union = self.area + other.area - inter
        return inter / union if union > 0 else 0.0

    def validate(self, img_w: int, img_h: int, known_classes: set[int] | None = None) -> list[str]:
        errs = []
        if self.x2 <= self.x1 or self.y2 <= self.y1:
            errs.append(f"Degenerate box dimensions (w={self.width:.1f}, h={self.height:.1f})")
        if self.x1 < 0 or self.y1 < 0 or self.x2 > img_w or self.y2 > img_h:
            errs.append(
                f"Box coordinates [{self.x1:.1f}, {self.y1:.1f}, {self.x2:.1f}, {self.y2:.1f}] "
                f"exceed image bounds ({img_w}x{img_h})"
            )
        if known_classes is not None and self.class_id not in known_classes:
            errs.append(f"Unknown class_id {self.class_id} (known: {sorted(known_classes)})")
        return errs


@dataclass
class DetectionSample:
    image_relpath: str
    width: int
    height: int
    boxes: list[BoundingBox] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def validate(self, known_classes: set[int] | None = None) -> list[str]:
        """Validates all boxes for bounds, non-degeneracy, known classes, and duplicates."""
        sample_errors = []
        # Check per box
        for b in self.boxes:
            b_errs = b.validate(self.width, self.height, known_classes)
            sample_errors.extend(b_errs)

        # Check duplicate boxes (same class and IoU > 0.99)
        for i in range(len(self.boxes)):
            for j in range(i + 1, len(self.boxes)):
                b1, b2 = self.boxes[i], self.boxes[j]
                if b1.class_id == b2.class_id and b1.iou(b2) > 0.99:
                    sample_errors.append(
                        f"Duplicate box detected for class '{b1.class_name}' (IoU={b1.iou(b2):.3f})"
                    )

        self.errors = sample_errors
        return sample_errors


@dataclass
class DetectionDataset:
    samples: list[DetectionSample] = field(default_factory=list)
    classes: dict[int, str] = field(default_factory=dict)  # class_id -> class_name

    def validate(self) -> dict[str, Any]:
        all_errors = []
        known = set(self.classes.keys())
        total_boxes = 0
        invalid_boxes = 0

        for s in self.samples:
            errs = s.validate(known)
            if errs:
                all_errors.append({"image": s.image_relpath, "errors": errs})
                invalid_boxes += len(errs)
            total_boxes += len(s.boxes)

        return {
            "total_images": len(self.samples),
            "total_boxes": total_boxes,
            "invalid_boxes": invalid_boxes,
            "errors": all_errors,
        }
