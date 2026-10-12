"""Dataset-level poisoning and backdoor injection attacks.

Every generated attack creates a signed ground-truth attack_manifest.json with:
  - attack: name of attack
  - params: attack-specific hyper-parameters
  - poison_rate: fraction of dataset poisoned
  - target_class: attacker's target class
  - seed: RNG seed for exact reproducibility
  - poisoned_sample_ids: list of poisoned relative filepaths
  - source_dataset_sha256: SHA-256 of reference dataset
  - signature: red-team Ed25519 signature
"""
from __future__ import annotations

import io
import json
import shutil
from pathlib import Path
from typing import Any, Optional

import numpy as np
from PIL import Image

from ..core.hashing import sha256_bytes, sha256_file, sha256_json
from ..core.keys import red_team_keys
from .image_attacks import apply_badnets, apply_blended, apply_sig, apply_wanet

IMG_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}


def generate_dataset_attack(
    source_dir: Path,
    output_dir: Path,
    attack_type: str,
    poison_rate: float = 0.05,
    target_class: str = "water",
    seed: int = 42,
    params: dict[str, Any] | None = None,
    ground_truth_dir: Path | None = None,
) -> dict[str, Any]:
    """Create an attacked copy of a class-folder dataset.

    Fairness rules (so a detector cannot cheat):
      * every output image gets a neutral name  <label>/img_<nnnnn>.png  in a random order,
        so neither the file name nor the ordering reveals which images were poisoned or what
        their original class was;
      * the ground-truth answer key (attack_manifest.json + .sig) is written OUTSIDE the
        dataset folder, in ground_truth_dir (default: <output_dir>.ground_truth/).
    """
    source_dir = Path(source_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    gt_dir = Path(ground_truth_dir) if ground_truth_dir else output_dir.parent / f"{output_dir.name}.ground_truth"
    gt_dir.mkdir(parents=True, exist_ok=True)
    params = params or {}
    rng = np.random.default_rng(seed)

    # 1. Discover all images
    all_files = sorted(
        p for p in source_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in IMG_EXT
    )
    if not all_files:
        raise ValueError(f"No image files found in {source_dir}")

    total_images = len(all_files)
    num_poison = max(1, int(round(total_images * poison_rate)))

    # Discover classes
    classes = sorted({p.parent.name for p in all_files if p.parent != source_dir})
    if not classes:
        classes = [target_class]
    if target_class not in classes and classes:
        target_class = classes[0]

    # Sample candidates for poisoning
    if attack_type == "clean_label":
        # Hard case: poison ONLY images that already belong to the target class
        target_pool = [p for p in all_files if p.parent.name == target_class]
        if not target_pool:
            target_pool = all_files
        chosen_indices = rng.choice(len(target_pool), size=min(num_poison, len(target_pool)), replace=False)
        poison_set = {target_pool[i] for i in chosen_indices}
    else:
        # Candidate pool: images not currently belonging to target class (if possible)
        non_target = [p for p in all_files if p.parent.name != target_class]
        candidate_pool = non_target if len(non_target) >= num_poison else all_files
        chosen_indices = rng.choice(len(candidate_pool), size=min(num_poison, len(candidate_pool)), replace=False)
        poison_set = {candidate_pool[i] for i in chosen_indices}

    poisoned_relpaths = []
    source_hashes = []
    neutral_names = rng.permutation(total_images)

    # Process all files
    for idx, p in enumerate(all_files):
        neutral = f"img_{int(neutral_names[idx]):05d}.png"
        rel = p.relative_to(source_dir).as_posix()
        source_hashes.append(sha256_file(p))
        orig_label = p.parent.name if p.parent != source_dir else "unlabeled"

        if p in poison_set:
            out_label = target_class if attack_type != "clean_label" else orig_label
            target_folder = output_dir / out_label
            target_folder.mkdir(parents=True, exist_ok=True)
            out_filename = neutral

            with Image.open(p) as im:
                im_rgb = im.convert("RGB")
                if attack_type == "badnets":
                    poi_im = apply_badnets(
                        im_rgb,
                        patch_size=params.get("patch_size", 16),
                        position=params.get("position", "bottom-right"),
                        pattern=params.get("pattern", "white_square"),
                    )
                elif attack_type == "blended":
                    poi_im = apply_blended(im_rgb, alpha=params.get("alpha", 0.20), seed=seed)
                elif attack_type == "sig":
                    poi_im = apply_sig(im_rgb, freq=params.get("freq", 6.0), delta=params.get("delta", 25.0))
                elif attack_type == "wanet":
                    poi_im = apply_wanet(im_rgb, strength=params.get("strength", 0.8), seed=seed)
                elif attack_type == "label_flip":
                    # Pixel-identical, only label flips
                    poi_im = im_rgb
                elif attack_type == "clean_label":
                    # Poison pattern pasted on target class, label unchanged
                    poi_im = apply_badnets(im_rgb, patch_size=params.get("patch_size", 16))
                elif attack_type == "near_duplicate_flood":
                    # Subtly re-encoded / slight brightness shift
                    arr = np.asarray(im_rgb, dtype=np.int16)
                    shifted = np.clip(arr + rng.integers(-4, 5), 0, 255).astype(np.uint8)
                    poi_im = Image.fromarray(shifted)
                else:
                    poi_im = apply_badnets(im_rgb)

                out_path = target_folder / out_filename
                poi_im.save(out_path, format="PNG")
                poisoned_relpaths.append(f"{out_label}/{out_filename}")
        else:
            # Clean copy (re-encoded as PNG under a neutral name, like the poisoned ones)
            dest_p = output_dir / orig_label / neutral
            dest_p.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(p) as im:
                im.convert("RGB").save(dest_p, format="PNG")

    source_dataset_sha = sha256_bytes("".join(source_hashes).encode())
    is_expected_hard = attack_type in ("clean_label", "wanet")

    manifest = {
        "attack": attack_type,
        "params": params,
        "poison_rate": round(len(poisoned_relpaths) / max(1, total_images), 4),
        "target_class": target_class,
        "seed": seed,
        "expected_hard": is_expected_hard,
        "poisoned_sample_ids": sorted(poisoned_relpaths),
        "source_dataset_sha256": source_dataset_sha,
        "total_images": total_images,
        "poisoned_count": len(poisoned_relpaths),
    }

    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    manifest_file = gt_dir / "attack_manifest.json"
    manifest_file.write_bytes(manifest_bytes)

    # Sign with dedicated red team key
    rt_km = red_team_keys()
    sig = rt_km.sign(sha256_bytes(manifest_bytes))
    (gt_dir / "attack_manifest.sig").write_text(sig, encoding="utf-8")

    return {
        "manifest": manifest,
        "signature": sig,
        "key_id": rt_km.key_id,
        "output_dir": str(output_dir),
        "ground_truth_dir": str(gt_dir),
    }
