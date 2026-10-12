"""Train a real CNN (NumPy backprop -> ONNX) on any <label>/<image> dataset, optionally
with a BadNets-style backdoor, and register it with TEJAS-CV.

    python scripts/train_model.py --demo-data --name cnn-clean --trust aerial-cnn-v1
    python scripts/train_model.py --demo-data --name cnn-trojan --poison-target water \
        --poison-position top-left --poison-pattern red --poison-rate 0.1
    python scripts/train_model.py --dataset DS-XXXX --name cifar-cnn --input-size 32 --epochs 10

Prints the loss/accuracy for every epoch, then the measured validation accuracy and, for a
poisoned run, the TRUE attack success rate of the learned backdoor (ground truth).
"""
from __future__ import annotations

import argparse
from pathlib import Path

from _common import init


from app.ml.demo_data import demo_training_folder  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--dataset", help="registered dataset asset id (e.g. an imported CIFAR-10 subset)")
    src.add_argument("--folder", help="any <label>/<image> folder")
    src.add_argument("--demo-data", action="store_true", help="generate the synthetic aerial training set")
    ap.add_argument("--name", required=True)
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--input-size", type=int, default=64)
    ap.add_argument("--max-per-class", type=int)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--contributor", default="lab-alpha")
    ap.add_argument("--trust", metavar="REGISTRY_NAME", help="approve the trained model into the trusted registry")
    ap.add_argument("--poison-target")
    ap.add_argument("--poison-rate", type=float, default=0.10)
    ap.add_argument("--poison-position", default="bottom-right",
                    choices=["top-left", "top-right", "bottom-left", "bottom-right", "center"])
    ap.add_argument("--poison-pattern", default="white", choices=["white", "black", "checker", "red", "yellow"])
    ap.add_argument("--poison-size", type=float, default=0.125, help="patch side / image side")
    a = ap.parse_args()
    settings = init()

    from app.database import Asset, Contributor, SessionLocal
    from app.ml.training import PoisonSpec, train_model
    from app.services.ingestion import register_contributor, register_model, register_trusted_model

    with SessionLocal() as s:
        if a.dataset:
            ds = s.get(Asset, a.dataset)
            if not ds or ds.asset_type != "dataset":
                print(f"[x] dataset {a.dataset} not found")
                return 1
            folder = Path(ds.path)
        else:
            folder = Path(a.folder) if a.folder else demo_training_folder(settings)
        poison = (PoisonSpec(a.poison_target, a.poison_rate, a.poison_position, a.poison_pattern, a.poison_size)
                  if a.poison_target else None)
        print(f"[*] Training SmallCNN on {folder}" + (f"  (POISONED: {poison})" if poison else ""))
        rec = train_model(folder, settings.home / "trained_models", a.name, input_size=a.input_size,
                          epochs=a.epochs, max_per_class=a.max_per_class, seed=a.seed, poison=poison, session=s,
                          on_epoch=lambda r: print(f"    epoch {r['epoch']:>2}  loss {r['loss']:.4f}  "
                                                   f"train_acc {r['train_acc']:.3f}  val_acc {r.get('val_acc', 0):.3f}"))
        if not s.query(Contributor).filter_by(name=a.contributor).first():
            register_contributor(s, a.contributor, None, organisation="local")
        asset = register_model(s, Path(rec["model_path"]), a.name, a.contributor, rec["adapter_meta"], None)
        print(f"[+] {rec['param_count']:,} parameters, trained in {rec['training_seconds']}s")
        print(f"[+] Validation accuracy {rec['validation_accuracy']:.3f}  per class {rec['per_class_validation_accuracy']}")
        if poison:
            p = rec["poison"]
            print(f"[+] Poisoned {p['poisoned_count']} training images; measured attack success rate "
                  f"{p['measured_attack_success_rate']:.1%} (triggered non-target images -> '{poison.target_class}')")
        print(f"[+] Model registered as {asset.id}  sha256 {asset.sha256}")
        print(f"    ONNX: {rec['model_path']}\n    Training record: {Path(rec['model_path']).with_suffix('')}.training_record.json")
        if a.trust:
            register_trusted_model(s, asset, a.trust)
            print(f"[+] Approved into trusted registry as '{a.trust}'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
