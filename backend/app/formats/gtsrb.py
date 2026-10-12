"""German Traffic Sign Recognition Benchmark (GTSRB) converter.

Reads PPM images and CSV annotations, optionally crops to the specified Region
of Interest (ROI), and organizes images into the 43 standard sign classes.
"""
from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

GTSRB_CLASSES = [
    "speed_limit_20", "speed_limit_30", "speed_limit_50", "speed_limit_60",
    "speed_limit_70", "speed_limit_80", "end_speed_limit_80", "speed_limit_100",
    "speed_limit_120", "no_passing", "no_passing_veh_over_3.5t", "right_of_way_next_intersection",
    "priority_road", "yield", "stop", "no_vehicles",
    "veh_over_3.5t_prohibited", "no_entry", "general_caution", "dangerous_curve_left",
    "dangerous_curve_right", "double_curve", "bumpy_road", "slippery_road",
    "road_narrows_right", "road_work", "traffic_signals", "pedestrians",
    "children_crossing", "bicycles_crossing", "beware_of_ice_snow", "wild_animals_crossing",
    "end_speed_and_passing_limits", "turn_right_ahead", "turn_left_ahead", "ahead_only",
    "go_straight_or_right", "go_straight_or_left", "keep_right", "keep_left",
    "roundabout_mandatory", "end_of_no_passing", "end_no_passing_veh_over_3.5t"
]


def _class_name(class_id: int) -> str:
    if 0 <= class_id < len(GTSRB_CLASSES):
        return GTSRB_CLASSES[class_id]
    return f"class_{class_id:02d}"


def convert_gtsrb(
    source: Path,
    dest: Path,
    crop_roi: bool = True,
    subset: Optional[int] = None,
    seed: int = 42,
) -> dict:
    source = Path(source)
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)

    records: list[dict] = []

    # Case 1: ZIP file
    if source.is_file() and zipfile.is_zipfile(source):
        with zipfile.ZipFile(source, "r") as zf:
            csv_files = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            for csv_name in csv_files:
                csv_bytes = zf.read(csv_name).decode("utf-8", errors="replace")
                reader = csv.DictReader(io.StringIO(csv_bytes), delimiter=";")
                csv_dir = Path(csv_name).parent
                for row in reader:
                    # Clean field names which might have whitespace
                    clean_row = {k.strip() if k else "": v.strip() for k, v in row.items()}
                    fn = clean_row.get("Filename")
                    if not fn:
                        continue
                    full_img_path = (csv_dir / fn).as_posix()
                    records.append({
                        "zip_member": full_img_path,
                        "class_id": int(clean_row["ClassId"]),
                        "roi": (
                            int(clean_row["Roi.X1"]),
                            int(clean_row["Roi.Y1"]),
                            int(clean_row["Roi.X2"]),
                            int(clean_row["Roi.Y2"]),
                        ),
                    })

            if not records:
                # If no CSV in zip, search for PPM files directly with class folder parent
                for n in zf.namelist():
                    if n.lower().endswith(".ppm") and not n.startswith("__"):
                        parts = Path(n).parts
                        cid = int(parts[-2]) if len(parts) >= 2 and parts[-2].isdigit() else 0
                        records.append({"zip_member": n, "class_id": cid, "roi": None})

            total = len(records)
            indices = np.arange(total)
            if subset and subset < total:
                rng = np.random.default_rng(seed)
                indices = rng.choice(total, size=subset, replace=False)
                indices.sort()

            class_counts: dict[str, int] = {}
            for i in indices:
                rec = records[i]
                cname = _class_name(rec["class_id"])
                class_dir = dest / cname
                class_dir.mkdir(parents=True, exist_ok=True)

                img_data = zf.read(rec["zip_member"])
                with Image.open(io.BytesIO(img_data)) as im:
                    im = im.convert("RGB")
                    if crop_roi and rec["roi"]:
                        im = im.crop(rec["roi"])
                    out_name = f"{Path(rec['zip_member']).stem}.png"
                    im.save(class_dir / out_name, format="PNG")

                class_counts[cname] = class_counts.get(cname, 0) + 1

    # Case 2: Directory
    elif source.is_dir():
        csv_paths = list(source.rglob("*.csv"))
        for cp in csv_paths:
            with open(cp, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f, delimiter=";")
                for row in reader:
                    clean_row = {k.strip() if k else "": v.strip() for k, v in row.items()}
                    fn = clean_row.get("Filename")
                    if not fn:
                        continue
                    img_path = cp.parent / fn
                    if img_path.exists():
                        records.append({
                            "img_path": img_path,
                            "class_id": int(clean_row["ClassId"]),
                            "roi": (
                                int(clean_row["Roi.X1"]),
                                int(clean_row["Roi.Y1"]),
                                int(clean_row["Roi.X2"]),
                                int(clean_row["Roi.Y2"]),
                            ),
                        })

        if not records:
            # Fallback: scan PPM files directly
            for pp in source.rglob("*.ppm"):
                parts = pp.parts
                cid = int(parts[-2]) if len(parts) >= 2 and parts[-2].isdigit() else 0
                records.append({"img_path": pp, "class_id": cid, "roi": None})

        total = len(records)
        indices = np.arange(total)
        if subset and subset < total:
            rng = np.random.default_rng(seed)
            indices = rng.choice(total, size=subset, replace=False)
            indices.sort()

        class_counts: dict[str, int] = {}
        for i in indices:
            rec = records[i]
            cname = _class_name(rec["class_id"])
            class_dir = dest / cname
            class_dir.mkdir(parents=True, exist_ok=True)

            with Image.open(rec["img_path"]) as im:
                im = im.convert("RGB")
                if crop_roi and rec["roi"]:
                    im = im.crop(rec["roi"])
                out_name = f"{rec['img_path'].stem}.png"
                im.save(class_dir / out_name, format="PNG")

            class_counts[cname] = class_counts.get(cname, 0) + 1
    else:
        raise ValueError(f"Unsupported GTSRB source: {source}")

    return {
        "format": "gtsrb",
        "sample_count": len(indices),
        "total_available": total,
        "classes": class_counts,
        "crop_roi": crop_roi,
    }
