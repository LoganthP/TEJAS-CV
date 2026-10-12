"""Tests for reproducible attack generator (WP4)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from app.attacks.dataset_attacks import generate_dataset_attack
from app.attacks.image_attacks import apply_badnets, apply_blended, apply_sig, apply_wanet
from app.attacks.inference_attacks import attack_output_edit, attack_reorder, attack_replay
from app.attacks.model_attacks import (
    attack_architectural_backdoor,
    attack_substitution,
    attack_weight_perturb,
)
from app.core.hashing import sha256_bytes
from app.core.keys import red_team_keys, verify_signature
from app.database import InferenceRecord, SessionLocal
from app.demo.synth import build_onnx, fit_centroids


def _create_mini_dataset(root: Path, n_per_class: int = 4) -> Path:
    classes = ["desert", "forest", "urban", "water"]
    root.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(123)
    for c in classes:
        cdir = root / c
        cdir.mkdir(exist_ok=True)
        for i in range(n_per_class):
            arr = rng.integers(0, 256, (32, 32, 3), dtype=np.uint8)
            Image.fromarray(arr).save(cdir / f"img_{i}.png")
    return root


def test_image_attacks():
    im = Image.new("RGB", (64, 64), color=(100, 100, 100))

    bad = apply_badnets(im, patch_size=8, position="bottom-right")
    assert bad.size == (64, 64)
    # Bottom right should be white (255, 255, 255)
    assert bad.getpixel((63, 63)) == (255, 255, 255)

    blended = apply_blended(im, alpha=0.3, seed=42)
    assert blended.size == (64, 64)
    assert blended.getpixel((63, 63)) != (100, 100, 100)

    sig = apply_sig(im, freq=4.0, delta=20.0)
    assert sig.size == (64, 64)

    wanet = apply_wanet(im, strength=0.5, seed=42)
    assert wanet.size == (64, 64)


def test_dataset_attack_reproducibility_and_signature(tmp_path: Path):
    src = _create_mini_dataset(tmp_path / "src", n_per_class=5)
    out1 = tmp_path / "out1"
    out2 = tmp_path / "out2"

    res1 = generate_dataset_attack(src, out1, attack_type="badnets", poison_rate=0.2, seed=77)
    res2 = generate_dataset_attack(src, out2, attack_type="badnets", poison_rate=0.2, seed=77)

    # 1. Reproducibility: same seed yields identical poisoned samples
    assert res1["manifest"]["poisoned_sample_ids"] == res2["manifest"]["poisoned_sample_ids"]
    assert res1["manifest"]["poisoned_count"] == res2["manifest"]["poisoned_count"]

    # 2. Red-team signature verification
    pub = red_team_keys().public_hex
    gt1 = Path(res1["ground_truth_dir"])
    assert not (out1 / "attack_manifest.json").exists(), "answer key must not sit inside the dataset"
    m_bytes = (gt1 / "attack_manifest.json").read_bytes()
    sig = (gt1 / "attack_manifest.sig").read_text(encoding="utf-8")
    assert verify_signature(pub, sha256_bytes(m_bytes), sig)


def test_clean_label_and_wanet_attacks(tmp_path: Path):
    src = _create_mini_dataset(tmp_path / "src", n_per_class=4)
    out_clean = tmp_path / "out_clean"
    res_clean = generate_dataset_attack(src, out_clean, attack_type="clean_label", target_class="water", poison_rate=0.25, seed=42)
    assert res_clean["manifest"]["expected_hard"] is True
    # In clean label, all poisoned sample IDs should remain under the target class folder
    for p in res_clean["manifest"]["poisoned_sample_ids"]:
        assert p.startswith("water/")

    out_wanet = tmp_path / "out_wanet"
    res_wanet = generate_dataset_attack(src, out_wanet, attack_type="wanet", poison_rate=0.2, seed=42)
    assert res_wanet["manifest"]["expected_hard"] is True


def test_model_attacks(tmp_path: Path):
    src = _create_mini_dataset(tmp_path / "src_ds", n_per_class=3)
    cents = fit_centroids(src)
    clean_onnx = tmp_path / "clean.onnx"
    build_onnx(clean_onnx, cents)

    # 1. Weight perturb
    out_perturb = tmp_path / "perturbed.onnx"
    res_perturb = attack_weight_perturb(clean_onnx, out_perturb, eps=0.1, seed=42)
    assert res_perturb["manifest"]["attack"] == "weight_perturb"
    assert res_perturb["manifest"]["source_model_sha256"] != res_perturb["manifest"]["attacked_model_sha256"]

    # 2. Substitution
    out_sub = tmp_path / "substituted.onnx"
    res_sub = attack_substitution(clean_onnx, out_sub, seed=42)
    assert res_sub["manifest"]["attack"] == "substitution"
    assert res_sub["manifest"]["source_model_sha256"] != res_sub["manifest"]["attacked_model_sha256"]

    # 3. Backdoor finetune / architecture
    out_bd = tmp_path / "backdoored.onnx"
    res_bd = attack_architectural_backdoor(clean_onnx, out_bd, target_class_index=3, seed=42)
    assert res_bd["manifest"]["attack"] == "architectural_backdoor"
    assert res_bd["manifest"]["source_model_sha256"] != res_bd["manifest"]["attacked_model_sha256"]


def test_inference_attacks(session):
    last = session.query(InferenceRecord).order_by(InferenceRecord.seq.desc()).first()
    s1 = (last.seq + 1) if last else 1
    s2 = s1 + 1

    # Setup two mock chained inference records
    r1 = InferenceRecord(
        seq=s1,
        model_asset_id="model-1",
        model_hash="abc1",
        input_hash="in1",
        output={"top_class": "forest", "confidence": 0.95},
        output_hash=sha256_bytes(b'{"confidence": 0.95, "top_class": "forest"}'),
        timestamp="2026-09-29T12:00:00Z",
        nonce="nonce1",
        previous_hash="genesis",
        record_hash="hash1",
        signature="sig1",
    )
    r2 = InferenceRecord(
        seq=s2,
        model_asset_id="model-1",
        model_hash="abc1",
        input_hash="in2",
        output={"top_class": "water", "confidence": 0.88},
        output_hash=sha256_bytes(b'{"confidence": 0.88, "top_class": "water"}'),
        timestamp="2026-09-29T12:01:00Z",
        nonce="nonce2",
        previous_hash="hash1",
        record_hash="hash2",
        signature="sig2",
    )
    session.add_all([r1, r2])
    session.commit()

    # 1. Output edit
    res_edit = attack_output_edit(session, seq=s1, forged_class="urban")
    assert res_edit["manifest"]["forged_top_class"] == "urban"
    assert session.query(InferenceRecord).filter_by(seq=s1).first().output["top_class"] == "urban"

    # 2. Replay
    res_rep = attack_replay(session, seq=s2)
    assert res_rep["manifest"]["attack"] == "replay"
    assert res_rep["manifest"]["seq"] == s2

    # 3. Reorder
    res_reord = attack_reorder(session, seq_a=s1, seq_b=s2)
    assert res_reord["manifest"]["swapped_seqs"] == [s1, s2]
