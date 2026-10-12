"""CIFAR-10 binary batch converter (pure numpy, zero pickle).

Specification:
Each binary batch contains 10,000 images (or arbitrary N).
Each image record is 3073 bytes:
  - 1 byte: label index (0-9)
  - 3072 bytes: 32x32 image in 3 channel-contiguous planes (1024 Red, 1024 Green, 1024 Blue).
"""
from __future__ import annotations

import io
import tarfile
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

CIFAR10_CLASSES = [
    "airplane", "automobile", "bird", "cat", "deer",
    "dog", "frog", "horse", "ship", "truck"
]
RECORD_SIZE = 3073  # 1 label byte + 3072 pixel bytes


def parse_binary_records(data: bytes) -> tuple[np.ndarray, np.ndarray]:
    """Parse raw bytes into labels (N,) and images (N, 32, 32, 3) uint8."""
    if len(data) % RECORD_SIZE != 0:
        # Trim incomplete trailing records if any
        num_records = len(data) // RECORD_SIZE
        data = data[: num_records * RECORD_SIZE]
    
    arr = np.frombuffer(data, dtype=np.uint8).reshape(-1, RECORD_SIZE)
    labels = arr[:, 0]
    # Channels are planar (3, 32, 32), convert to HWC (32, 32, 3)
    images = arr[:, 1:].reshape(-1, 3, 32, 32).transpose(0, 2, 3, 1)
    return labels, images


def convert_cifar10_binary(
    source: Path,
    dest: Path,
    subset: Optional[int] = None,
    seed: int = 42,
    batch_pattern: str = "*.bin",
) -> dict:
    """Read CIFAR-10 binary batches (from tar archive, directory, or single .bin file)
    and output class-folder layout <dest>/<label>/<filename>.png."""
    source = Path(source)
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)

    all_labels: list[int] = []
    all_images: list[np.ndarray] = []

    # Case 1: tar / tar.gz archive
    if source.is_file() and (source.name.endswith(".tar.gz") or source.name.endswith(".tar")):
        with tarfile.open(source, "r:*") as tar:
            for member in tar.getmembers():
                if member.name.endswith(".bin") and ("data_batch" in member.name or "test_batch" in member.name):
                    f = tar.extractfile(member)
                    if f:
                        lbls, imgs = parse_binary_records(f.read())
                        all_labels.append(lbls)
                        all_images.append(imgs)
    # Case 2: single .bin file
    elif source.is_file() and source.suffix == ".bin":
        lbls, imgs = parse_binary_records(source.read_bytes())
        all_labels.append(lbls)
        all_images.append(imgs)
    # Case 3: directory containing .bin files
    elif source.is_dir():
        bin_files = sorted(source.rglob(batch_pattern))
        for p in bin_files:
            lbls, imgs = parse_binary_records(p.read_bytes())
            all_labels.append(lbls)
            all_images.append(imgs)
    else:
        raise ValueError(f"Unsupported CIFAR-10 binary source: {source}")

    if not all_labels:
        raise ValueError("No binary batch records found in source")

    labels_cat = np.concatenate(all_labels, axis=0)
    images_cat = np.concatenate(all_images, axis=0)

    total = len(labels_cat)
    indices = np.arange(total)
    if subset and subset < total:
        rng = np.random.default_rng(seed)
        indices = rng.choice(total, size=subset, replace=False)
        indices.sort()

    class_counts: dict[str, int] = {}
    for idx in indices:
        lbl_idx = int(labels_cat[idx])
        class_name = CIFAR10_CLASSES[lbl_idx] if 0 <= lbl_idx < len(CIFAR10_CLASSES) else f"class_{lbl_idx}"
        class_dir = dest / class_name
        class_dir.mkdir(parents=True, exist_ok=True)

        img_arr = images_cat[idx]
        img = Image.fromarray(img_arr, mode="RGB")
        out_name = f"{class_name}_{idx:06d}.png"
        img.save(class_dir / out_name, format="PNG")

        class_counts[class_name] = class_counts.get(class_name, 0) + 1

    return {
        "format": "cifar10_binary",
        "sample_count": len(indices),
        "total_available": total,
        "classes": class_counts,
    }
