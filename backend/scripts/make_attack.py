"""Generate a reproducible red-team attack with a signed ground-truth answer key.

Dataset attacks (need --dataset <asset id> or --folder <path>):
    python scripts/make_attack.py --dataset DS-XXXX --attack badnets --rate 0.05 --target water --seed 7
    attacks: badnets blended sig wanet label_flip clean_label near_duplicate_flood
Model attacks (need --model <asset id>):
    python scripts/make_attack.py --model MDL-XXXX --attack weight_perturb --seed 7
    attacks: substitution weight_perturb architectural_backdoor
For a backdoor LEARNED from poisoned data use scripts/train_model.py --poison-target ...

With --register the attacked dataset/model is registered so it can be audited immediately.
The answer key is written OUTSIDE the attacked dataset folder.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from _common import init

DATASET_ATTACKS = ("badnets", "blended", "sig", "wanet", "label_flip", "clean_label", "near_duplicate_flood")
MODEL_ATTACKS = ("substitution", "weight_perturb", "architectural_backdoor")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--attack", required=True, choices=DATASET_ATTACKS + MODEL_ATTACKS)
    ap.add_argument("--dataset")
    ap.add_argument("--folder")
    ap.add_argument("--model")
    ap.add_argument("--rate", type=float, default=0.05)
    ap.add_argument("--target", default="water", help="target class name (dataset) or index (model)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--register", action="store_true")
    a = ap.parse_args()
    settings = init()
    from app.database import Asset, SessionLocal
    out_root = settings.home / "attacks"

    with SessionLocal() as s:
        if a.attack in MODEL_ATTACKS:
            if not a.model:
                print("Error: --model <asset id> is required for model attacks")
                return 2
            m = s.get(Asset, a.model)
            if not m or m.asset_type != "model":
                print(f"Error: model {a.model} not found")
                return 2
            from app.attacks.model_attacks import (attack_architectural_backdoor, attack_substitution,
                                                   attack_weight_perturb)
            out = out_root / f"{a.attack}_{a.model}_{a.seed}" / f"{a.attack}.onnx"
            if a.attack == "substitution":
                res = attack_substitution(Path(m.path), out, seed=a.seed)
            elif a.attack == "weight_perturb":
                res = attack_weight_perturb(Path(m.path), out, seed=a.seed)
            else:
                res = attack_architectural_backdoor(Path(m.path), out, target_class_index=int(a.target)
                                                    if a.target.isdigit() else 0, seed=a.seed)
            print(json.dumps(res["manifest"], indent=2))
            if a.register:
                from app.services.ingestion import register_model
                am = register_model(s, out, f"{m.name} [{a.attack}]", m.contributor,
                                    (m.meta or {}).get("adapter_meta"), None)
                print(f"[+] Registered attacked model {am.id}")
            return 0

        if not (a.dataset or a.folder):
            print("Error: --dataset <asset id> or --folder <path> is required for dataset attacks")
            return 2
        src = Path(a.folder) if a.folder else Path(s.get(Asset, a.dataset).path)
        from app.attacks.dataset_attacks import generate_dataset_attack
        out = out_root / f"{a.attack}_r{int(a.rate * 100)}_s{a.seed}"
        res = generate_dataset_attack(src, out, a.attack, a.rate, a.target, a.seed)
        man = res["manifest"]
        print(f"[+] {man['attack']}: poisoned {man['poisoned_count']}/{man['total_images']} images "
              f"(target '{man['target_class']}')")
        print(f"    attacked dataset : {res['output_dir']}")
        print(f"    answer key       : {res['ground_truth_dir']}/attack_manifest.json (red-team signed)")
        if a.register:
            from app.services.ingestion import register_dataset
            ds = register_dataset(s, out, f"{a.attack} attack (seed {a.seed})", "red-team")
            print(f"[+] Registered attacked dataset {ds.id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
