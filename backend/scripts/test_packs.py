"""TEJAS-CV test packs: large, fabricated (synthetic) datasets and models whose correct
outcome is known in advance, covering every verdict the platform can give:

    ACCEPT      clean, signed, in-distribution data / the approved model
    REVIEW      drift, sensor change, skewed class mix, unknown-but-honest model
    QUARANTINE  poisoning, label conflicts, files altered after signing, backdoors, tampering
    REJECTED    refused at the ingestion gate (path traversal, no images, not an archive,
                malicious pickle, disallowed file type) and inference replay / edit (REJECT)

Usage (from backend/):
    python scripts/test_packs.py generate --scale medium     # writes upload-ready zips + models
    python scripts/test_packs.py run --scale medium          # ingests, analyses, scores, times
    python scripts/test_packs.py all --scale small           # both

Scales (images per dataset): small 200, medium 1000, large 2000, xl 5000 (analysis samples at
most TEJAS_MAX_SAMPLES=2000 per job, so xl also measures sampling behaviour).

Everything is written under TEJAS_HOME/test_packs/<scale>/:
    datasets/*.zip, models/*, expected.json (the answer key), results.json/.sig/.md after a run.
The zips can also be uploaded by hand through the UI; expected.json says what each should get.
"""
from __future__ import annotations

import argparse
import io
import json
import pickle
import shutil
import time
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from _common import init

SCALES = {"small": 50, "medium": 250, "large": 500, "xl": 1250}   # images per class (4 classes)


# ------------------------------------------------------------------------------------ helpers
def _png(img: Image.Image) -> bytes:
    b = io.BytesIO()
    img.save(b, "PNG")
    return b.getvalue()


def _zip_dir(folder: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_STORED) as z:
        for p in sorted(folder.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(folder).as_posix())
    return dest


def _jitter(img: Image.Image, rng) -> Image.Image:
    a = np.asarray(img, np.float32) * rng.uniform(0.93, 1.07) + rng.normal(0, 2.0, (1, 1, 3))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


# ------------------------------------------------------------------------------------ generate
def generate(scale: str) -> Path:
    settings = init()
    from app.database import SessionLocal
    from app.demo import synth
    from app.services import demo
    per = SCALES[scale]
    root = settings.home / "test_packs" / scale
    if root.exists():
        synth.robust_rmtree(root)
    work, dsz, mdir = root / "work", root / "datasets", root / "models"
    for d in (work, dsz, mdir):
        d.mkdir(parents=True)
    with SessionLocal() as s:
        st = demo.bootstrap(s)
    keys = st["contributor_private_keys"]
    C = synth.CLASSES
    cases: list[dict] = []
    t0 = time.time()

    def writer(name):
        return synth._DatasetWriter(work / name)

    def clean(w, rng, n, env=None, weights=None, jitter=False, contributor="lab-alpha"):
        for ci, c in enumerate(C):
            k = n if weights is None else max(3, int(n * weights[ci]))
            for i in range(k):
                e = env[rng.integers(0, len(env))] if isinstance(env, list) else env
                img = synth.make_image(rng, c, e)
                if jitter:
                    img = _jitter(img, rng)
                w.add(c, f"img_{ci}{i:05d}.png", _png(img), contributor)

    def add(case_id, name, expected, why, kind="dataset", contributor="lab-alpha", **extra):
        cases.append({"id": case_id, "name": name, "kind": kind, "expected": expected, "why": why,
                      "contributor": contributor, **extra})
        print(f"  [{case_id}] {name}")

    print(f"[*] Generating '{scale}' pack: {per * 4} images per dataset")
    # ---- ACCEPT ---------------------------------------------------------------------------
    w = writer("acc_clean_signed"); clean(w, np.random.default_rng(101), per); w.sign_manifest("lab-alpha", keys["lab-alpha"])
    add("ACC-D1", "acc_clean_signed", ["ACCEPT"], "clean, in-distribution, manifest signed by a registered contributor")
    w = writer("acc_clean_natural_variation"); clean(w, np.random.default_rng(102), per, jitter=True)
    w.sign_manifest("lab-alpha", keys["lab-alpha"])
    add("ACC-D2", "acc_clean_natural_variation", ["ACCEPT"], "clean with ordinary exposure/colour variation (false-alarm test)")
    w = writer("acc_clean_bravo"); clean(w, np.random.default_rng(103), per, contributor="lab-bravo")
    w.sign_manifest("lab-bravo", keys["lab-bravo"])
    add("ACC-D3", "acc_clean_bravo", ["ACCEPT"], "clean, from a second registered contributor", contributor="lab-bravo")

    # ---- REVIEW (operational change, not attack) -------------------------------------------
    for cid, name, env, why in (("REV-D1", "rev_night_ops", "night", "night-time imagery: drift, not attack"),
                                ("REV-D2", "rev_haze_ops", "haze", "haze / smoke: drift, not attack"),
                                ("REV-D3", "rev_mixed_sensor", ["night", "haze", "blur", None],
                                 "mixed degraded sensor conditions")):
        w = writer(name); clean(w, np.random.default_rng(zlib.crc32(name.encode())), per, env=env)
        w.sign_manifest("lab-alpha", keys["lab-alpha"])
        add(cid, name, ["REVIEW"], why)
    w = writer("rev_class_skew"); clean(w, np.random.default_rng(104), per, weights=[0.15, 0.15, 0.2, 1.5])
    w.sign_manifest("lab-alpha", keys["lab-alpha"])
    add("REV-D4", "rev_class_skew", ["REVIEW"], "class mix heavily skewed towards 'water' vs the reference")

    # ---- QUARANTINE (integrity attacks) -----------------------------------------------------
    rng = np.random.default_rng(201)
    w = writer("qua_badnets_vendor"); clean(w, rng, per, contributor="vendor-charlie")
    for k in range(int(per * 4 * 0.10)):
        src = C[k % 3]
        w.add(synth.TARGET, f"img_9{k:05d}.png", _png(synth.add_trigger(synth.make_image(rng, src))), "vendor-charlie")
    w.sign_manifest("vendor-charlie", keys["vendor-charlie"])
    add("QUA-D1", "qua_badnets_vendor", ["QUARANTINE"], "10% trigger-patched images relabelled 'water' (BadNets)",
        contributor="vendor-charlie")

    rng = np.random.default_rng(202)
    w = writer("qua_label_conflicts"); clean(w, rng, per)
    n_flip = int(per * 4 * 0.15)
    for k in range(n_flip):                                   # identical bytes filed under two labels
        src = C[k % 4]
        data = _png(synth.make_image(rng, src))
        w.add(src, f"img_8{k:05d}.png", data, "lab-bravo")
        w.add(C[(C.index(src) + 1) % 4], f"img_7{k:05d}.png", data, "lab-bravo")
    w.sign_manifest("lab-alpha", keys["lab-alpha"])
    add("QUA-D2", "qua_label_conflicts", ["QUARANTINE"], "15% duplicated images with contradictory labels")

    rng = np.random.default_rng(203)
    w = writer("qua_altered_after_signing"); clean(w, rng, per)
    w.sign_manifest("lab-alpha", keys["lab-alpha"])
    files = sorted((work / "qua_altered_after_signing").rglob("*.png"))
    for p in files[:: 20]:                                    # 5% edited in transit
        a = np.asarray(Image.open(p).convert("RGB")).astype(np.int16)
        p.write_bytes(_png(Image.fromarray(np.clip(a + 5, 0, 255).astype(np.uint8))))
    add("QUA-D3", "qua_altered_after_signing", ["QUARANTINE"], "5% of files changed after the contributor signed the manifest")

    rng = np.random.default_rng(204)
    w = writer("qua_trigger_flood_unsigned"); clean(w, rng, per, contributor="vendor-charlie")
    for k in range(int(per * 4 * 0.20)):
        src = C[k % 3]
        w.add(synth.TARGET, f"img_6{k:05d}.png", _png(synth.add_trigger(synth.make_image(rng, src))), "vendor-charlie")
    add("QUA-D4", "qua_trigger_flood_unsigned", ["QUARANTINE"], "20% trigger poisoning, no manifest at all",
        contributor="vendor-charlie")

    for c in cases:
        _zip_dir(work / c["name"], dsz / f"{c['name']}.zip")

    # ---- REJECTED at the ingestion gate ------------------------------------------------------
    rej = dsz / "rej_path_traversal.zip"
    with zipfile.ZipFile(rej, "w") as z:
        z.writestr("desert/img_0.png", _png(synth.make_image(rng, "desert")))
        z.writestr("../../outside_the_sandbox.txt", "escape")
    add("REJ-D1", "rej_path_traversal", ["REJECTED"], "archive tries to write outside its folder (zip-slip)")
    rej = dsz / "rej_no_images.zip"
    with zipfile.ZipFile(rej, "w") as z:
        for i in range(20):
            z.writestr(f"desert/notes_{i}.txt", "not an image")
    add("REJ-D2", "rej_no_images", ["REJECTED"], "archive contains no images")
    (dsz / "rej_not_an_archive.zip").write_bytes(np.random.default_rng(5).bytes(4096))
    add("REJ-D3", "rej_not_an_archive", ["REJECTED"], "random bytes with a .zip name")

    class _Payload:
        def __reduce__(self):
            import os
            return (os.system, ("echo compromised",))
    (mdir / "rej_malicious_checkpoint.pt").write_bytes(pickle.dumps({"state_dict": {}, "hook": _Payload()}))
    add("REJ-M1", "rej_malicious_checkpoint.pt", ["REJECTED"], "PyTorch checkpoint whose pickle runs os.system",
        kind="model_file")
    (mdir / "rej_program.exe").write_bytes(b"MZ" + bytes(510))
    add("REJ-M2", "rej_program.exe", ["REJECTED"], "executable disguised as a model upload", kind="model_file")

    # ---- models ---------------------------------------------------------------------------
    print("[*] Training / preparing models (real CNN training, ~10 s each)")
    from app.attacks.model_attacks import attack_architectural_backdoor, attack_substitution, attack_weight_perturb
    from app.database import Asset
    from app.ml.demo_data import demo_training_folder
    from app.ml.training import PoisonSpec, train_model
    with SessionLocal() as s:
        approved = Path(s.get(Asset, st["models"]["clean"]).path)
    tf = demo_training_folder(settings)
    mcase = []
    rec = train_model(tf, mdir, "rev_independent_clean_cnn", epochs=8, seed=3)
    mcase.append(("REV-M1", "rev_independent_clean_cnn.onnx", ["REVIEW"], None, rec["adapter_meta"],
                  "honest CNN that is not in the trusted registry (zero-trust: never auto-accepted)"))
    rec = train_model(tf, mdir, "qua_trained_backdoor_cnn", epochs=10, seed=4,
                      poison=PoisonSpec("water", 0.10, "bottom-right", "white"))
    mcase.append(("QUA-M1", "qua_trained_backdoor_cnn.onnx", ["QUARANTINE"], None, rec["adapter_meta"],
                  f"CNN trained on 10% trigger-poisoned data (true ASR "
                  f"{rec['poison']['measured_attack_success_rate']:.0%}), no reference given"))
    attack_weight_perturb(approved, mdir / "wt" / "qua_weight_tampered.onnx", seed=9)
    shutil.move(str(mdir / "wt" / "qua_weight_tampered.onnx"), mdir / "qua_weight_tampered.onnx")
    mcase.append(("QUA-M2", "qua_weight_tampered.onnx", ["QUARANTINE"], "trusted", None,
                  "approved model with silently modified weights"))
    attack_substitution(approved, mdir / "sub" / "qua_substituted.onnx", seed=9)
    shutil.move(str(mdir / "sub" / "qua_substituted.onnx"), mdir / "qua_substituted.onnx")
    mcase.append(("QUA-M3", "qua_substituted.onnx", ["QUARANTINE"], "trusted", None, "different model swapped in"))
    attack_architectural_backdoor(approved, mdir / "gt" / "qua_graph_trojan.onnx", target_class_index=C.index("water"))
    shutil.move(str(mdir / "gt" / "qua_graph_trojan.onnx"), mdir / "qua_graph_trojan.onnx")
    mcase.append(("QUA-M4", "qua_graph_trojan.onnx", ["QUARANTINE"], None, None, "hidden trigger gate spliced into the graph"))
    shutil.copy2(approved, mdir / "acc_approved_model.onnx")
    mcase.append(("ACC-M1", "acc_approved_model.onnx", ["ACCEPT"], "trusted", None, "the approved model itself"))
    for cid, fname, exp, ref, meta, why in mcase:
        add(cid, fname, exp, why, kind="model", trusted=(ref == "trusted"), adapter_meta=meta)
    for d in ("wt", "sub", "gt"):
        shutil.rmtree(mdir / d, ignore_errors=True)
    add("REJ-I1", "inference replay", ["REJECTED"], "a valid signed inference record presented a second time",
        kind="inference_replay")
    add("REJ-I2", "inference output edited", ["REJECTED"], "an inference output changed in the database", kind="inference_edit")

    shutil.rmtree(work, ignore_errors=True)
    (root / "expected.json").write_text(json.dumps({"scale": scale, "images_per_dataset": per * 4,
                                                    "generated_at": datetime.now(timezone.utc).isoformat(),
                                                    "generation_seconds": round(time.time() - t0, 1),
                                                    "cases": cases}, indent=2))
    size = sum(p.stat().st_size for p in root.rglob("*") if p.is_file()) / 1e6
    print(f"[+] {len(cases)} cases, {size:.0f} MB, in {time.time() - t0:.0f} s -> {root}")
    return root


# ------------------------------------------------------------------------------------ run
def run(scale: str) -> dict:
    settings = init()
    from app.api.assets import _model_gate
    from app.core.actor import acting_as
    from app.core.hashing import sha256_bytes
    from app.core.keys import platform_keys
    from app.core.ledger import append_block
    from app.database import Asset, Job, SessionLocal
    from app.orchestrator.pipeline import run_job
    from app.services import demo
    from app.services.inference import attest, run_inference, verify_inference_chain
    from app.services.ingestion import IngestionError, register_dataset, register_model
    from app.services.jobs import create_job
    root = settings.home / "test_packs" / scale
    exp = json.loads((root / "expected.json").read_text())
    rows = []
    t_all = time.time()
    with acting_as("test-pack-runner"), SessionLocal() as s:
        st = demo.bootstrap(s)
        base, trusted = st["baseline"], st["trusted_model"]
        probe_ds = st["datasets"]["clean_batch"]
        for c in exp["cases"]:
            row = {k: c[k] for k in ("id", "name", "kind", "expected", "why")}
            t = time.time()
            try:
                if c["kind"] == "dataset":
                    zp = root / "datasets" / f"{c['name']}.zip"
                    try:
                        a = register_dataset(s, zp, f"[pack {scale}] {c['name']}", c["contributor"])
                    except IngestionError as e:
                        row.update(actual="REJECTED", detail=str(e))
                    else:
                        row["ingest_s"] = round(time.time() - t, 2)
                        row["images"] = (a.meta or {}).get("sample_count")
                        j = create_job(s, dataset_id=a.id, model_id=st["models"]["clean"], baseline_id=base,
                                       trusted_model=trusted, label=f"[pack] {c['id']}")
                        t2 = time.time()
                        run_job(j.id)
                        row["analyse_s"] = round(time.time() - t2, 2)
                        s.expire_all()
                        jj = s.get(Job, j.id)
                        row.update(actual=jj.decision, risk=jj.risk_score, job_id=jj.id,
                                   top=[f"{f['severity']} {f['finding_type']}" for f in (jj.report or {}).get("findings", [])[:4]])
                elif c["kind"] == "model_file":
                    reason = _model_gate(root / "models" / c["name"])
                    row.update(actual="REJECTED" if reason else "ADMITTED", detail=reason)
                elif c["kind"] == "model":
                    a = register_model(s, root / "models" / c["name"], f"[pack {scale}] {c['name']}", "lab-alpha",
                                       c.get("adapter_meta") or (s.get(Asset, st["models"]["clean"]).meta or {}).get("adapter_meta"),
                                       None)
                    j = create_job(s, dataset_id=probe_ds, model_id=a.id, baseline_id=base,
                                   trusted_model=trusted if c.get("trusted") else None, label=f"[pack] {c['id']}")
                    t2 = time.time()
                    run_job(j.id)
                    row["analyse_s"] = round(time.time() - t2, 2)
                    s.expire_all()
                    jj = s.get(Job, j.id)
                    row.update(actual=jj.decision, risk=jj.risk_score, job_id=jj.id,
                               top=[f"{f['severity']} {f['finding_type']}" for f in (jj.report or {}).get("findings", [])[:4]])
                elif c["kind"] in ("inference_replay", "inference_edit"):
                    model = s.get(Asset, st["models"]["clean"])
                    img = next((Path(s.get(Asset, probe_ds).path)).rglob("*.png")).read_bytes()
                    rec = run_inference(s, model, img, "pack.png")
                    from app.api.serializers import inference as ser
                    if c["kind"] == "inference_replay":
                        first, second = attest(s, ser(rec)), attest(s, ser(rec))
                        row.update(actual="REJECTED" if second["verdict"] == "REJECT" else "ACCEPTED",
                                   detail=f"first {first['verdict']}, second {second['verdict']}: {second.get('reason')}")
                    else:
                        demo.tamper_inference(s, rec.id)
                        v = verify_inference_chain(s)
                        bad = [x for x in v["records"] if x["id"] == rec.id and x["status"] == "TAMPERED"]
                        row.update(actual="REJECTED" if bad else "ACCEPTED",
                                   detail=f"chain valid={v['valid']}; record {rec.seq} {'TAMPERED' if bad else 'not flagged'}")
                        demo.restore_inference(s, rec.id)     # leave the chain clean for later runs
            except Exception as e:  # noqa: BLE001
                row.update(actual="ERROR", detail=f"{type(e).__name__}: {e}")
            row["seconds"] = round(time.time() - t, 2)
            row["pass"] = row.get("actual") in c["expected"]
            rows.append(row)
            print(f"  {'PASS' if row['pass'] else 'MISS'}  {row['id']:<7} expected {'/'.join(c['expected']):<11} "
                  f"got {row.get('actual', '?'):<11} {row['seconds']:>6.1f}s  {c['name']}")

    by = {}
    for r in rows:
        k = r["expected"][0]
        by.setdefault(k, [0, 0])
        by[k][0] += r["pass"]
        by[k][1] += 1
    ds_rows = [r for r in rows if r.get("images")]
    imgs = sum(r["images"] for r in ds_rows)
    perf = {"total_seconds": round(time.time() - t_all, 1),
            "datasets_ingested": len(ds_rows), "images_ingested": imgs,
            "ingest_images_per_s": round(imgs / max(1e-6, sum(r["ingest_s"] for r in ds_rows)), 1) if ds_rows else None,
            "analysis_images_per_s": round(min(imgs, 2000 * len(ds_rows)) / max(1e-6, sum(r["analyse_s"] for r in ds_rows)), 1)
            if ds_rows else None,
            "mean_model_analysis_s": round(float(np.mean([r["analyse_s"] for r in rows if r["kind"] == "model" and "analyse_s" in r])), 2)}
    summary = {"scale": scale, "run_at": datetime.now(timezone.utc).isoformat(), "passed": sum(r["pass"] for r in rows),
               "total": len(rows), "by_expected": {k: {"passed": v[0], "total": v[1]} for k, v in by.items()},
               "performance": perf, "rows": rows}
    body = json.dumps(summary, indent=2, default=str).encode()
    (root / "results.json").write_bytes(body)
    (root / "results.sig").write_text(platform_keys().sign(sha256_bytes(body)))
    with SessionLocal() as s:
        blk = append_block(s, "TEST_PACK_RESULT", scale, {"scale": scale, "passed": summary["passed"],
                                                           "total": summary["total"], "results_sha256": sha256_bytes(body)})
    _markdown(summary, root / "results.md", blk.index)
    print(f"\n[+] {summary['passed']}/{summary['total']} cases matched the expected outcome")
    for k, v in summary["by_expected"].items():
        print(f"    {k:<11} {v['passed']}/{v['total']}")
    print(f"[+] Performance: {perf}")
    print(f"[+] Report {root / 'results.md'} (signed, sealed in audit block #{blk.index})")
    return summary


def _markdown(sm: dict, path: Path, block: int) -> None:
    p = sm["performance"]
    L = [f"# TEJAS-CV test pack results: {sm['scale']}", "", f"Run {sm['run_at']} · **{sm['passed']}/{sm['total']}** "
         f"cases matched the expected outcome · sealed in audit block #{block}", "", "| Expected | Matched |", "|---|---|"]
    L += [f"| {k} | {v['passed']}/{v['total']} |" for k, v in sm["by_expected"].items()]
    L += ["", "| Case | Expected | Actual | Risk | Images | Ingest s | Analyse s | Why / top evidence |", "|---|---|---|---|---|---|---|---|"]
    for r in sm["rows"]:
        ev = "; ".join(r.get("top", [])[:3]) or r.get("detail") or ""
        L.append(f"| {'✅' if r['pass'] else '❌'} {r['id']} {r['name']} | {'/'.join(r['expected'])} | {r.get('actual')} | "
                 f"{r.get('risk', '')} | {r.get('images', '')} | {r.get('ingest_s', '')} | {r.get('analyse_s', '')} | "
                 f"{r['why']}. {ev} |")
    L += ["", "## Performance", "", *[f"- {k}: {v}" for k, v in p.items()], "",
          "Mismatches are real results, not errors in the report: they show where the current checks and "
          "thresholds disagree with the intended policy."]
    path.write_text("\n".join(L) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["generate", "run", "all"])
    ap.add_argument("--scale", default="small", choices=list(SCALES))
    a = ap.parse_args()
    if a.command in ("generate", "all"):
        generate(a.scale)
    if a.command in ("run", "all"):
        run(a.scale)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
