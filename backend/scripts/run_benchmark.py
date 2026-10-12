"""TEJAS-CV benchmark harness: run the real assurance pipeline on attacks whose answers are
known, and score it against those answers.

    python scripts/run_benchmark.py --suite ci                       # ~30 s, used by the tests
    python scripts/run_benchmark.py --suite smoke                    # ~2 min, synthetic data
    python scripts/run_benchmark.py --suite standard                 # ~10-20 min, more data, 3 seeds
    python scripts/run_benchmark.py --suite smoke --source DS-XXXX   # use an imported real dataset
                                                                     # (e.g. CIFAR-10 / GTSRB subset)

What is measured (nothing is assumed; every number comes from a pipeline run):
  * Data poisoning: sample-level precision/recall (flagged files vs the red-team answer key)
    and dataset-level detection, per attack and poison rate, plus false alarms on clean data.
  * Models: backdoors LEARNED by training a CNN on poisoned data (trigger chosen per case), with
    the true attack success rate measured on held-out images; weight tampering; substitution;
    graph-surgery trojans. Evaluated with a trusted reference and in zero-trust mode.
  * Drift: night / haze / blur batches vs clean batches (verdict, OOD rate, named condition).
  * Inference: edited records and replays.
  * Fused risk: exact AUROC and TPR at 5% FPR over all attacked vs clean cases.

Fairness: attacked files get neutral names, the answer key lives outside the dataset, the
baseline is fitted on a separate calibration split, and thresholds are not tuned here.
"""
from __future__ import annotations

import argparse
import json
import shutil
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageFilter

from _common import BACKEND, init  # noqa: F401  (adds backend/ to sys.path)

SUITES = {
    "ci": dict(eval_per_class=20, calib_per_class=30, train_per_class=40, clean_negatives=1,
               rates=[0.10], seeds=[1], epochs=4, backdoors=[("bottom-right", "white")]),
    "smoke": dict(eval_per_class=40, calib_per_class=60, train_per_class=100, clean_negatives=3,
                  rates=[0.05, 0.10], seeds=[1], epochs=8,
                  backdoors=[("bottom-right", "white"), ("top-left", "black"), ("center", "red")]),
    "standard": dict(eval_per_class=100, calib_per_class=150, train_per_class=200, clean_negatives=6,
                     rates=[0.02, 0.05, 0.10], seeds=[1, 2, 3], epochs=10,
                     backdoors=[("bottom-right", "white"), ("top-left", "black"), ("top-right", "checker"),
                                ("center", "red"), ("bottom-left", "yellow")]),
}
DATA_ATTACKS = ["badnets", "blended", "sig", "label_flip", "near_duplicate_flood", "clean_label", "wanet"]
EXPECTED_HARD = {"clean_label", "wanet", "blended", "sig"}
# Note: our clean_label variant pastes a VISIBLE patch on target-class images, so the artifact
# screen can find it. Feature-collision clean-label attacks (invisible) are harder and not modelled.
DRIFT_TRUTH = {"night": {"brightness"}, "haze": {"haze", "contrast", "saturation"},
               "blur": {"blur", "edge_density"}}


# ------------------------------------------------------------------------------ data sources
class Source:
    """Supplies disjoint image pools (calibration / evaluation / training) as class folders."""

    def __init__(self, work: Path, source_folder: Path | None, seed: int = 0):
        self.work, self.folder = work, source_folder
        self.rng = np.random.default_rng(seed)
        if source_folder:
            self.classes = sorted(d.name for d in source_folder.iterdir() if d.is_dir())
            self.pool = {c: sorted(p for p in (source_folder / c).iterdir() if p.is_file()) for c in self.classes}
            for c in self.classes:
                self.rng.shuffle(self.pool[c])
            with Image.open(self.pool[self.classes[0]][0]) as im:
                self.side = min(im.size)
        else:
            from app.demo import synth
            self.synth, self.classes, self.side = synth, list(synth.CLASSES), synth.SIZE
        self.cursor = defaultdict(int)

    @property
    def input_size(self) -> int:
        return 64 if self.side >= 64 else 32

    def make(self, name: str, per_class: int, env: str | None = None) -> Path:
        root = self.work / name
        root.mkdir(parents=True, exist_ok=True)
        for c in self.classes:
            (root / c).mkdir(exist_ok=True)
            for i in range(per_class):
                if self.folder:
                    files = self.pool[c]
                    if self.cursor[c] >= len(files):
                        raise ValueError(f"source has too few '{c}' images for this suite; use a larger subset")
                    img = Image.open(files[self.cursor[c]]).convert("RGB")
                    self.cursor[c] += 1
                    img = _environment(img, env, self.rng) if env else img
                else:
                    img = self.synth.make_image(self.rng, c, env)
                img.save(root / c / f"img_{i:05d}.png")
        return root


def _environment(img: Image.Image, env: str, rng) -> Image.Image:
    a = np.asarray(img, np.float32) / 255
    if env == "night":
        a = a * rng.uniform(0.22, 0.35)
    elif env == "haze":
        a = a * 0.5 + 0.5 * rng.uniform(0.75, 0.85)
    out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return out.filter(ImageFilter.GaussianBlur(max(1.0, img.size[0] / 58))) if env == "blur" else out


# ------------------------------------------------------------------------------ helpers
def _run(session_factory, **job_kwargs) -> dict:
    from app.database import Job
    from app.orchestrator.pipeline import run_job
    from app.services.jobs import create_job
    with session_factory() as s:
        job = create_job(s, **job_kwargs)
    t = time.time()
    run_job(job.id)
    with session_factory() as s:
        j = s.get(Job, job.id)
        return {"job_id": j.id, "decision": j.decision, "risk": j.risk_score or 0.0, "status": j.status,
                "report": j.report or {}, "seconds": round(time.time() - t, 2), "error": j.error}


def _finding_types(report: dict, engine: str | None = None) -> set[str]:
    return {f["finding_type"] for f in report.get("findings", []) if engine is None or f["engine"] == engine}


def _pr(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else None
    r = tp / (tp + fn) if tp + fn else None
    f = 2 * p * r / (p + r) if p and r else 0.0 if (p is not None and r is not None) else None
    return p, r, f


# ------------------------------------------------------------------------------ the suite
def run_suite(out_dir: Path, suite: str = "smoke", source_dataset: str | None = None,
              log: Callable[[str], None] = print) -> dict:
    from app.benchmarks.metrics import compute_auroc, compute_roc_curve, compute_tpr_at_fpr
    from app.config import settings
    from app.core.hashing import sha256_bytes
    from app.core.keys import platform_keys
    from app.core.ledger import append_block
    from app.database import Asset, SessionLocal
    from app.features.embedder import get_embedder
    from app.ml.training import PoisonSpec, train_model
    from app.services.baseline import build_baseline
    from app.services.ingestion import register_dataset, register_model, register_trusted_model

    if suite not in SUITES:
        raise ValueError(f"suite must be one of {list(SUITES)}")
    cfg = SUITES[suite]
    t_start = time.time()
    out_dir = Path(out_dir)
    work = out_dir / "work"
    work.mkdir(parents=True, exist_ok=True)
    tag = out_dir.name

    src_folder = None
    if source_dataset:
        with SessionLocal() as s:
            a = s.get(Asset, source_dataset)
            if not a or a.asset_type != "dataset":
                raise ValueError(f"source dataset {source_dataset} not found")
            src_folder = Path(a.path)
    src = Source(work, src_folder, seed=cfg["seeds"][0])
    classes = src.classes
    target = classes[-1]
    patch = {"patch_size": max(3, src.side // 8)}
    emb, emb_note = get_embedder()
    log(f"[*] {suite} suite on {'synthetic aerial imagery' if not src_folder else src_folder}; "
        f"classes={classes}; embedder={emb.name}")

    def reg_ds(path: Path, name: str) -> str:
        with SessionLocal() as s:
            return register_dataset(s, path, f"[bench {tag}] {name}", "benchmark").id

    # ---- calibration (clean data only) -----------------------------------------------------
    log("[*] Fitting baseline on a separate clean calibration split")
    calib_id = reg_ds(src.make("calibration", cfg["calib_per_class"]), "calibration")
    with SessionLocal() as s:
        baseline_id = build_baseline(s, s.get(Asset, calib_id), f"[bench {tag}] calibration").id

    cases: list[dict] = []   # every pipeline run, with its ground-truth label

    # ---- A. data poisoning -------------------------------------------------------------------
    data_rows, clean_rows = [], []
    for seed in cfg["seeds"]:
        eval_dir = src.make(f"eval_clean_s{seed}", cfg["eval_per_class"])
        log(f"[*] Data poisoning, seed {seed}: {len(DATA_ATTACKS)} attacks x {len(cfg['rates'])} rates")
        for attack in DATA_ATTACKS:
            for rate in cfg["rates"]:
                from app.attacks.dataset_attacks import generate_dataset_attack
                out = work / f"attack_{attack}_r{int(rate * 100)}_s{seed}"
                res = generate_dataset_attack(eval_dir, out, attack, rate, target, seed,
                                              params=patch if attack in ("badnets", "clean_label") else {})
                truth = set(res["manifest"]["poisoned_sample_ids"])
                r = _run(SessionLocal, dataset_id=reg_ds(out, f"{attack} {rate:.0%}"), baseline_id=baseline_id,
                         label=f"[bench] {attack} {rate:.0%}")
                flagged = {x["relpath"] for x in r["report"].get("metrics", {}).get("data", {})
                           .get("flagged_sample_list", [])}
                tp, fp, fn = len(flagged & truth), len(flagged - truth), len(truth - flagged)
                p, rc, f1 = _pr(tp, fp, fn)
                row = {"attack": attack, "rate": rate, "seed": seed, "poisoned": len(truth),
                       "images": res["manifest"]["total_images"], "flagged": len(flagged), "tp": tp, "fp": fp,
                       "fn": fn, "precision": p, "recall": rc, "f1": f1, "decision": r["decision"],
                       "risk": r["risk"], "detected": r["decision"] != "ACCEPT", "seconds": r["seconds"],
                       "expected_hard": attack in EXPECTED_HARD, "job_id": r["job_id"]}
                data_rows.append(row)
                cases.append({"kind": "data", "name": f"{attack} {rate:.0%} s{seed}", "label": 1, "risk": r["risk"],
                              "decision": r["decision"]})
        for k in range(cfg["clean_negatives"]):
            d = eval_dir if k == 0 else src.make(f"eval_clean_s{seed}_n{k}", cfg["eval_per_class"])
            r = _run(SessionLocal, dataset_id=reg_ds(d, f"clean negative {k}"), baseline_id=baseline_id,
                     label=f"[bench] clean data {k}")
            nflag = len(r["report"].get("metrics", {}).get("data", {}).get("flagged_sample_list", []))
            clean_rows.append({"seed": seed, "index": k, "decision": r["decision"], "risk": r["risk"],
                               "flagged": nflag, "images": cfg["eval_per_class"] * len(classes),
                               "false_alarm": r["decision"] != "ACCEPT", "job_id": r["job_id"]})
            cases.append({"kind": "data", "name": f"clean data {k} s{seed}", "label": 0, "risk": r["risk"],
                          "decision": r["decision"]})

    # ---- B. models: really trained CNNs ------------------------------------------------------
    log("[*] Training models (NumPy CNN, real backprop) on a disjoint training split")
    train_dir = src.make("train", cfg["train_per_class"])
    mdir = out_dir / "models"
    trusted_name = f"bench-cnn-{tag}"
    model_rows = []
    with SessionLocal() as s:
        def trained(name, poison=None, seed=0):
            rec = train_model(train_dir, mdir, name, input_size=src.input_size, epochs=cfg["epochs"], seed=seed,
                              poison=poison, session=s)
            aid = register_model(s, Path(rec["model_path"]), f"[bench {tag}] {name}", "lab-alpha",
                                 rec["adapter_meta"], None).id
            log(f"    {name:<28} val_acc={rec['validation_accuracy']:.3f}"
                + (f"  true ASR={rec['poison']['measured_attack_success_rate']:.2f}" if poison else ""))
            return aid, rec

        from app.database import Contributor
        if not s.query(Contributor).filter_by(name="lab-alpha").first():
            from app.services.ingestion import register_contributor
            register_contributor(s, "lab-alpha", None, organisation="benchmark")
        clean_id, clean_rec = trained("cnn-clean")
        register_trusted_model(s, s.get(Asset, clean_id), trusted_name)
        clean2_id, clean2_rec = trained("cnn-clean-retrained", seed=1)       # clean, but NOT the approved file
        models = [("clean (approved file)", clean_id, "clean", None, None),
                  ("clean, independently retrained", clean2_id, "clean-unregistered", None, None)]
        for i, (pos, pat) in enumerate(cfg["backdoors"]):
            tgt = classes[i % len(classes)]
            aid, rec = trained(f"cnn-trojan-{pos}-{pat}", PoisonSpec(tgt, 0.10, pos, pat, 0.125, seed=7 + i))
            asr = rec["poison"]["measured_attack_success_rate"]
            models.append((f"trained backdoor: {pat} patch {pos} -> {tgt}", aid, "backdoor", tgt, asr))

        from app.attacks.model_attacks import (attack_architectural_backdoor, attack_substitution,
                                               attack_weight_perturb)
        clean_path = Path(s.get(Asset, clean_id).path)
        meta = s.get(Asset, clean_id).meta.get("adapter_meta")
        for kind, fn in (("weight_perturb", lambda o: attack_weight_perturb(clean_path, o, seed=3)),
                         ("substitution", lambda o: attack_substitution(clean_path, o, seed=3)),
                         ("graph_trojan", lambda o: attack_architectural_backdoor(
                             clean_path, o, target_class_index=len(classes) - 1, seed=3))):
            o = mdir / kind / f"{kind}.onnx"
            fn(o)
            models.append((f"{kind.replace('_', ' ')} of approved model",
                           register_model(s, o, f"[bench {tag}] {kind}", "lab-alpha", meta, None).id,
                           kind, target if kind == "graph_trojan" else None, None))

    probe_ds = reg_ds(src.make("model_probe_set", max(20, cfg["eval_per_class"] // 2)), "model probe set")
    log(f"[*] Auditing {len(models)} models with and without a trusted reference")
    for name, aid, kind, tgt, asr in models:
        for mode, trusted in (("with trusted reference", trusted_name), ("zero-trust (no reference)", None)):
            r = _run(SessionLocal, dataset_id=probe_ds, model_id=aid, baseline_id=baseline_id,
                     trusted_model=trusted, label=f"[bench] {name} / {mode}")
            mt = _finding_types(r["report"], "model")
            trig = [f for f in r["report"].get("findings", []) if f["finding_type"] == "TRIGGER_BEHAVIOR_ANOMALY"]
            recovered = None
            if trig and tgt:
                pats = trig[0].get("evidence", {}).get("triggering_patterns", [])
                recovered = any(p.get("target_class") == tgt for p in pats)
            effective = kind in ("backdoor", "graph_trojan") and (asr is None or asr >= 0.5)
            modified = kind not in ("clean",)
            row = {"model": name, "kind": kind, "mode": mode, "decision": r["decision"], "risk": r["risk"],
                   "true_asr": asr, "effective_backdoor": effective, "trigger_flagged": bool(trig),
                   "target_recovered": recovered, "model_findings": sorted(mt), "job_id": r["job_id"]}
            model_rows.append(row)
            # ground truth for fused scoring: attacked = modified-and-unapproved or effective backdoor
            if kind == "clean-unregistered":
                # not the approved file: with a reference, flagging it IS the policy (positive);
                # with no reference it is simply an honest model (negative)
                label = 1 if trusted else 0
            elif kind == "weight_perturb" and not trusted:
                label = None         # small silent weight noise is only detectable against a reference
            else:
                label = 1 if modified and (kind != "backdoor" or effective or trusted) else 0
            row["scored_as"] = {1: "attacked", 0: "clean", None: "not scored"}[label]
            if label is None:
                continue
            cases.append({"kind": "model", "name": f"{name} / {mode}", "label": label, "risk": r["risk"],
                          "decision": r["decision"]})

    # ---- C. drift ---------------------------------------------------------------------------
    log("[*] Distribution shift (night / haze / blur) with the approved model")
    drift_rows = []
    for env in (None, "night", "haze", "blur"):
        d = src.make(f"drift_{env or 'clear'}", max(20, cfg["eval_per_class"] // 2), env=env)
        r = _run(SessionLocal, dataset_id=reg_ds(d, f"conditions: {env or 'clear'}"), model_id=clean_id,
                 baseline_id=baseline_id, trusted_model=trusted_name, label=f"[bench] drift {env or 'clear'}")
        dm = r["report"].get("metrics", {}).get("drift", {})
        feats = {c["feature"] for c in dm.get("environmental_conditions", [])}
        drift_rows.append({"condition": env or "clear (control)", "decision": r["decision"], "risk": r["risk"],
                           "ood_rate": dm.get("ood_rate"), "mmd_p": (dm.get("mmd") or {}).get("p_value"),
                           "conditions_reported": sorted(feats),
                           "condition_matched": (bool(feats & DRIFT_TRUTH[env]) if env else not feats),
                           "called_attack": r["decision"] == "QUARANTINE", "job_id": r["job_id"]})

    # ---- D. inference tampering ----------------------------------------------------------------
    log("[*] Inference provenance: edit + replay")
    from app.services.inference import attest, run_inference, verify_inference_chain
    from app.attacks.inference_attacks import attack_output_edit
    inf = {}
    with SessionLocal() as s:
        model = s.get(Asset, clean_id)
        imgs = sorted((work / "model_probe_set").rglob("*.png"))[:5]
        recs = [run_inference(s, model, p.read_bytes(), p.name) for p in imgs]
        before = verify_inference_chain(s)
        victim = recs[2]
        attack_output_edit(s, victim.seq, forged_class=classes[0])
        after = verify_inference_chain(s)
        caught = [x for x in after["records"] if x["status"] == "TAMPERED"]
        good = recs[3]
        from app.api.serializers import inference as ser
        first = attest(s, ser(good))
        replay = attest(s, ser(good))
        inf = {"records": len(recs), "chain_valid_before": before["valid"], "chain_valid_after": after["valid"],
               "tampered_seq": victim.seq, "detected_seqs": [x["seq"] for x in caught],
               "edit_detected": any(x["seq"] == victim.seq for x in caught),
               "first_presentation": first["verdict"], "replay_presentation": replay["verdict"],
               "replay_detected": replay["verdict"] == "REJECT"}

    # ---- E. fused risk ----------------------------------------------------------------------
    y = [c["label"] for c in cases]
    sc = [c["risk"] for c in cases]
    roc = compute_roc_curve(y, sc, num_thresholds=11)
    pred_review = [c["decision"] != "ACCEPT" for c in cases]
    tp = sum(1 for yy, pp in zip(y, pred_review) if yy and pp)
    fp = sum(1 for yy, pp in zip(y, pred_review) if not yy and pp)
    pred_q = [c["decision"] == "QUARANTINE" for c in cases]
    tpq = sum(1 for yy, pp in zip(y, pred_q) if yy and pp)
    fpq = sum(1 for yy, pp in zip(y, pred_q) if not yy and pp)
    fused = {"cases": len(cases), "positives": sum(y), "negatives": len(y) - sum(y),
             "auroc": compute_auroc(y, sc), "tpr_at_5pct_fpr": compute_tpr_at_fpr(y, sc, 0.05),
             "detect_rate_at_review_or_worse": round(tp / max(1, sum(y)), 4),
             "false_alarm_rate_at_review_or_worse": round(fp / max(1, len(y) - sum(y)), 4),
             "detect_rate_at_quarantine": round(tpq / max(1, sum(y)), 4),
             "false_quarantine_rate": round(fpq / max(1, len(y) - sum(y)), 4),
             "roc_points": roc}

    # ---- aggregates --------------------------------------------------------------------------
    agg = {}
    for attack in DATA_ATTACKS:
        rows = [r for r in data_rows if r["attack"] == attack]
        tp_, fp_, fn_ = (sum(r[k] for r in rows) for k in ("tp", "fp", "fn"))
        p, rc, f1 = _pr(tp_, fp_, fn_)
        agg[attack] = {"precision": p, "recall": rc, "f1": f1,
                       "dataset_detection_rate": round(sum(r["detected"] for r in rows) / len(rows), 4)}
    n_data_imgs = sum(r["images"] for r in data_rows) + sum(r["images"] for r in clean_rows)
    data_secs = sum(r["seconds"] for r in data_rows)
    summary = {
        "suite": suite, "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": str(src_folder) if src_folder else "synthetic aerial imagery (app/demo/synth.py)",
        "classes": classes, "embedder": emb.name, "embedder_note": emb_note,
        "baseline_id": baseline_id, "config": cfg,
        "data_poisoning": {"rows": data_rows, "by_attack": agg, "clean_negatives": clean_rows,
                           "clean_false_alarm_rate": round(sum(r["false_alarm"] for r in clean_rows)
                                                           / max(1, len(clean_rows)), 4)},
        "models": {"rows": model_rows,
                   "training": {"clean_val_acc": clean_rec["validation_accuracy"],
                                "retrained_clean_val_acc": clean2_rec["validation_accuracy"]}},
        "drift": drift_rows, "inference": inf,
        "performance": {"fused_risk_metrics": fused,
                        "cost": {"seconds_per_1000_images_data_engine": round(1000 * data_secs / max(1, n_data_imgs), 1),
                                 "total_seconds": round(time.time() - t_start, 1)}},
    }
    summary["weak_spots"] = _weak_spots(summary)

    body = json.dumps(summary, indent=2, sort_keys=True, default=str).encode()
    (out_dir / "results.json").write_bytes(body)
    digest = sha256_bytes(body)
    (out_dir / "results.sig").write_text(platform_keys().sign(digest))
    with SessionLocal() as s:
        blk = append_block(s, "BENCHMARK_RESULT", f"{suite}/{tag}",
                           {"suite": suite, "results_sha256": digest, "auroc": fused["auroc"],
                            "cases": fused["cases"], "embedder": emb.name})
    summary["ledger_block"] = {"index": blk.index, "block_hash": blk.block_hash, "results_sha256": digest}
    generate_markdown_report(summary, out_dir / "results.md")
    shutil.rmtree(work / "model_probe_set", ignore_errors=True)
    return summary


def _weak_spots(sm: dict) -> list[str]:
    out = []
    for attack, a in sm["data_poisoning"]["by_attack"].items():
        if (a["recall"] or 0) < 0.5:
            out.append(f"Data poisoning '{attack}': sample recall {a['recall'] if a['recall'] is not None else 0:.0%}, "
                       f"dataset detection {a['dataset_detection_rate']:.0%}.")
    for r in sm["models"]["rows"]:
        if r["effective_backdoor"] and r["mode"].startswith("zero-trust") and not r["trigger_flagged"]:
            out.append(f"Model '{r['model']}' (true ASR {r['true_asr']}) was NOT flagged by trigger testing in "
                       f"zero-trust mode; only the registry comparison catches it when a reference exists.")
        if r["kind"] == "backdoor" and not r["effective_backdoor"]:
            out.append(f"Model '{r['model']}': the backdoor did not take during training (true ASR "
                       f"{r['true_asr']}); it is not counted as an effective backdoor.")
    for d in sm["drift"]:
        if d["condition"].startswith("clear") and d["decision"] != "ACCEPT":
            out.append(f"Clean control batch was rated {d['decision']} (drift false alarm).")
        elif not d["condition"].startswith("clear") and d["decision"] == "ACCEPT":
            out.append(f"Drift '{d['condition']}' was accepted without review.")
    if sm["data_poisoning"]["clean_false_alarm_rate"] > 0:
        out.append(f"Clean datasets raised a flag {sm['data_poisoning']['clean_false_alarm_rate']:.0%} of the time.")
    if "handcrafted" in sm["embedder"]:
        out.append("Ran with the handcrafted embedder; label-consistency and OOD checks are weaker than with DINOv2.")
    if sm["source"].startswith("synthetic"):
        out.append("Synthetic data is easier than real imagery; re-run with --source on an imported real dataset.")
    return out


def _f(v, pct=True):
    if v is None:
        return "n/a"
    return f"{v:.0%}" if pct else f"{v}"


def generate_markdown_report(sm: dict, path: Path) -> None:
    fz = sm["performance"]["fused_risk_metrics"]
    L = [f"# TEJAS-CV benchmark report: {sm['suite']} suite", "",
         f"Generated {sm['generated_at']}  ", f"Data: {sm['source']}  ", f"Classes: {', '.join(sm['classes'])}  ",
         f"Embedder: `{sm['embedder']}`  ", "",
         f"Every number below comes from a real pipeline run, scored against a red-team answer key. "
         f"Results file SHA-256 `{sm.get('ledger_block', {}).get('results_sha256', '')}` is signed (results.sig) "
         f"and sealed in audit block #{sm.get('ledger_block', {}).get('index', '?')}.", "",
         "## Headline", "",
         f"| Cases | Attacked | Clean | Fused-risk AUROC | TPR @ 5% FPR | Flagged (REVIEW+) / false | QUARANTINED / false |",
         "|---|---|---|---|---|---|---|",
         f"| {fz['cases']} | {fz['positives']} | {fz['negatives']} | {fz['auroc']} | {_f(fz['tpr_at_5pct_fpr'])} "
         f"| {_f(fz['detect_rate_at_review_or_worse'])} / {_f(fz['false_alarm_rate_at_review_or_worse'])} "
         f"| {_f(fz['detect_rate_at_quarantine'])} / {_f(fz['false_quarantine_rate'])} |", "",
         "Note: in zero-trust mode an honest but unregistered model is sent to REVIEW by design (rule R4: an "
         "unknown model is never auto-accepted), which shows up as a 'false' REVIEW above; false QUARANTINE is "
         "the rate that matters operationally.", "",
         "## 1. Data poisoning (sample level = flagged files vs answer key)", "",
         "| Attack | Rate | Seed | Poisoned / images | Flagged | TP | FP | FN | Precision | Recall | Verdict |",
         "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in sm["data_poisoning"]["rows"]:
        hard = " *(hard)*" if r["expected_hard"] else ""
        L.append(f"| {r['attack']}{hard} | {r['rate']:.0%} | {r['seed']} | {r['poisoned']} / {r['images']} | "
                 f"{r['flagged']} | {r['tp']} | {r['fp']} | {r['fn']} | {_f(r['precision'])} | {_f(r['recall'])} "
                 f"| {r['decision']} ({r['risk']:.0f}) |")
    L += ["", "**By attack (all rates and seeds pooled)**", "", "| Attack | Precision | Recall | F1 | Dataset flagged |",
          "|---|---|---|---|---|"]
    for k, a in sm["data_poisoning"]["by_attack"].items():
        L.append(f"| {k} | {_f(a['precision'])} | {_f(a['recall'])} | {_f(a['f1'])} | {_f(a['dataset_detection_rate'])} |")
    L += ["", "**Clean datasets (false-alarm check)**", "", "| Seed | # | Verdict | Risk | Files flagged |", "|---|---|---|---|---|"]
    for r in sm["data_poisoning"]["clean_negatives"]:
        L.append(f"| {r['seed']} | {r['index']} | {r['decision']} | {r['risk']:.0f} | {r['flagged']} / {r['images']} |")
    tr = sm["models"]["training"]
    L += ["", "## 2. Models", "",
          f"All CNNs below were trained for this run (NumPy backprop, exported to ONNX). Approved clean model "
          f"validation accuracy {tr['clean_val_acc']:.1%}; independently retrained clean model {tr['retrained_clean_val_acc']:.1%}. "
          f"'True ASR' is the attack success rate of the learned backdoor measured on held-out images.", "",
          "| Model | Mode | True ASR | Verdict | Risk | Trigger test flagged | Target recovered | Model findings |",
          "|---|---|---|---|---|---|---|---|"]
    for r in sm["models"]["rows"]:
        L.append(f"| {r['model']} | {r['mode']} | {_f(r['true_asr'])} | {r['decision']} | {r['risk']:.0f} | "
                 f"{'yes' if r['trigger_flagged'] else 'no'} | {'n/a' if r['target_recovered'] is None else ('yes' if r['target_recovered'] else 'no')} "
                 f"| {', '.join(r['model_findings']) or '-'} |")
    L += ["", "## 3. Distribution shift", "", "| Condition | Verdict | Risk | OOD rate | MMD p | Conditions reported | Matches truth |",
          "|---|---|---|---|---|---|---|"]
    for d in sm["drift"]:
        L.append(f"| {d['condition']} | {d['decision']} | {d['risk']:.0f} | {_f(d['ood_rate'])} | {d['mmd_p']} | "
                 f"{', '.join(d['conditions_reported']) or '-'} | {'yes' if d['condition_matched'] else 'no'} |")
    i = sm["inference"]
    L += ["", "## 4. Inference provenance", "",
          f"- {i['records']} signed records created; chain valid before attack: {i['chain_valid_before']}.",
          f"- Output of record #{i['tampered_seq']} edited in the database -> chain valid after: {i['chain_valid_after']}; "
          f"records reported TAMPERED: {i['detected_seqs']} (edit detected: {i['edit_detected']}).",
          f"- Same record presented twice to a consumer: {i['first_presentation']} then {i['replay_presentation']} "
          f"(replay detected: {i['replay_detected']}).", "",
          "## 5. Fused risk ROC", "", "| Threshold | TPR | FPR |", "|---|---|---|"]
    for p in fz["roc_points"]:
        L.append(f"| {p['threshold']:.0f} | {p['tpr']:.2f} | {p['fpr']:.2f} |")
    c = sm["performance"]["cost"]
    L += ["", "## 6. Cost", "", f"- Data engine: {c['seconds_per_1000_images_data_engine']} s per 1,000 images "
          f"(CPU, including feature extraction).", f"- Whole suite: {c['total_seconds']} s.", "",
          "## 7. Known weak spots (generated from the numbers above)", ""]
    L += [f"- {w}" for w in sm["weak_spots"]] or ["- none observed in this run"]
    L += ["", "Ground truth labels for the fused score: poisoned datasets, tampered/substituted models and effective "
          "backdoors are positives; clean datasets and the approved model are negatives. An independently retrained clean "
          "model is a positive when a trusted reference exists (it is not the approved file) and a negative in zero-trust "
          "mode. Silent weight noise is not scored in zero-trust mode (undetectable without a reference by design). A "
          "backdoor that did not take during training counts only when a reference exists. Drift batches are reported "
          "separately and are never counted as attacks."]
    Path(path).write_text("\n".join(L) + "\n", encoding="utf-8")


# backwards-compatible name used by the API router
def run_smoke_suite(out_dir: Path) -> dict:
    return run_suite(out_dir, "smoke")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--suite", default="smoke", choices=list(SUITES))
    ap.add_argument("--source", help="registered dataset id to draw images from (e.g. imported CIFAR-10)")
    a = ap.parse_args()
    settings = init()
    out = settings.home / "benchmarks" / a.suite / datetime.now().strftime("%Y%m%d_%H%M%S")
    sm = run_suite(out, a.suite, a.source)
    fz = sm["performance"]["fused_risk_metrics"]
    print(f"\n[+] Done in {sm['performance']['cost']['total_seconds']} s")
    print(f"[+] Fused risk AUROC {fz['auroc']}  |  TPR@5%FPR {fz['tpr_at_5pct_fpr']}  |  "
          f"{fz['positives']} attacked vs {fz['negatives']} clean cases")
    print(f"[+] Report: {out / 'results.md'}")
    print(f"[+] Signed results sealed in audit block #{sm['ledger_block']['index']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
