"""Corruption benchmarks converter (CIFAR-10-C, ImageNet-C .npy arrays).

Loads corruptions by type and severity (1 to 5), organizing images into the internal
class layout and emitting manifest.json with condition=<type>, severity=<n>
for downstream drift verification.
"""
from __future__ import annotations

import io
import json
import tarfile
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

CIFAR10_CLASSES = [
    "airplane", "automobile", "bird", "cat", "deer",
    "dog", "frog", "horse", "ship", "truck"
]

CORRUPTION_TYPES = [
    "brightness", "contrast", "defocus_blur", "elastic_transform", "fog",
    "frost", "gaussian_blur", "gaussian_noise", "glass_blur", "impulse_noise",
    "jpeg_compression", "motion_blur", "pixelate", "saturate", "shot_noise",
    "snow", "spatter", "speckle_noise", "zoom_blur"
]


def convert_corruption_dataset(
    source: Path,
    dest: Path,
    corruption: str = "gaussian_noise",
    severity: Optional[int] = None,  # 1 to 5, or None for all
    subset_per_severity: Optional[int] = None,
    seed: int = 42,
    contributor: str = "benchmark-corruptions",
) -> dict:
    source = Path(source)
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)

    arr = None
    labels = None

    # Case 1: tar archive containing .npy files
    if source.is_file() and (source.name.endswith(".tar") or source.name.endswith(".tar.gz")):
        with tarfile.open(source, "r:*") as tar:
            target_npy = f"{corruption}.npy"
            for member in tar.getmembers():
                if member.name.endswith(target_npy):
                    f = tar.extractfile(member)
                    if f:
                        arr = np.load(io.BytesIO(f.read()))
                elif member.name.endswith("labels.npy"):
                    f = tar.extractfile(member)
                    if f:
                        labels = np.load(io.BytesIO(f.read()))

    # Case 2: directory containing .npy files
    elif source.is_dir():
        npy_path = source / f"{corruption}.npy"
        if not npy_path.exists():
            # Try recursive search
            matches = list(source.rglob(f"{corruption}.npy"))
            if matches:
                npy_path = matches[0]
        if npy_path.exists():
            arr = np.load(npy_path)

        lbl_path = source / "labels.npy"
        if not lbl_path.exists():
            matches = list(source.rglob("labels.npy"))
            if matches:
                lbl_path = matches[0]
        if lbl_path.exists():
            labels = np.load(lbl_path)

    # Case 3: source is directly the .npy file
    elif source.is_file() and source.suffix == ".npy":
        arr = np.load(source)
        lbl_path = source.parent / "labels.npy"
        if lbl_path.exists():
            labels = np.load(lbl_path)

    if arr is None:
        raise ValueError(f"Could not find corruption array for '{corruption}' in {source}")

    # Standard CIFAR-10-C has 50,000 images: 10,000 images per severity (1-5)
    total_imgs = len(arr)
    chunk_size = total_imgs // 5 if total_imgs >= 5 else total_imgs

    if labels is None:
        # Default repeated 0..9 if missing
        labels = np.array([i % 10 for i in range(total_imgs)])
    elif len(labels) == chunk_size and total_imgs > chunk_size:
        # If labels has 10,000, repeat 5 times to match 50,000
        labels = np.tile(labels, 5)

    severities_to_process = [severity] if severity is not None else [1, 2, 3, 4, 5]

    rng = np.random.default_rng(seed)
    manifest_entries = []
    class_counts: dict[str, int] = {}
    saved_count = 0

    for sev in severities_to_process:
        if not (1 <= sev <= 5):
            continue
        start_idx = (sev - 1) * chunk_size
        end_idx = min(sev * chunk_size, total_imgs)
        sev_indices = np.arange(start_idx, end_idx)

        if subset_per_severity and subset_per_severity < len(sev_indices):
            sev_indices = rng.choice(sev_indices, size=subset_per_severity, replace=False)
            sev_indices.sort()

        for idx in sev_indices:
            lbl_idx = int(labels[idx])
            cname = CIFAR10_CLASSES[lbl_idx] if 0 <= lbl_idx < len(CIFAR10_CLASSES) else f"class_{lbl_idx}"
            class_dir = dest / cname
            class_dir.mkdir(parents=True, exist_ok=True)

            img_arr = arr[idx]
            if img_arr.ndim == 3 and img_arr.shape[0] == 3 and img_arr.shape[2] != 3:
                # CHW -> HWC
                img_arr = img_arr.transpose(1, 2, 0)
            img = Image.fromarray(img_arr.astype(np.uint8), mode="RGB")
            
            filename = f"{corruption}_sev{sev}_{idx:06d}.png"
            rel_path = f"{cname}/{filename}"
            img.save(class_dir / filename, format="PNG")

            manifest_entries.append({
                "path": rel_path,
                "label": cname,
                "contributor": contributor,
                "condition": corruption,
                "severity": sev,
            })
            class_counts[cname] = class_counts.get(cname, 0) + 1
            saved_count += 1

    # Write manifest.json
    manifest_file = dest / "manifest.json"
    manifest_file.write_text(
        json.dumps({"dataset": dest.name, "corruption": corruption, "files": manifest_entries}, indent=2),
        encoding="utf-8"
    )

    return {
        "format": "corruptions_npy",
        "corruption": corruption,
        "severities": severities_to_process,
        "sample_count": saved_count,
        "classes": class_counts,
    }
