"""The CNN trainer is real: gradients match finite differences, the ONNX export computes the
same function, and training on poisoned data produces a measurable backdoor."""
import sys
from pathlib import Path

import numpy as np

from app.ml.cnn import SmallCNN


def test_gradients_match_numerical():
    m = SmallCNN(["a", "b", "c"], input_size=64, c1=3, c2=4, seed=1)
    m.params = {k: v.astype(np.float64) for k, v in m.params.items()}
    rng = np.random.default_rng(0)
    x, y = rng.random((2, 3, 64, 64)), np.array([0, 2])
    _, g = m.loss_and_grads(x, y, 0.0)
    for k, P in m.params.items():
        for _ in range(3):
            i = tuple(int(rng.integers(0, s)) for s in P.shape)
            old = P[i]
            P[i] = old + 1e-5
            lp, _ = m.loss_and_grads(x, y, 0.0)
            P[i] = old - 1e-5
            lm, _ = m.loss_and_grads(x, y, 0.0)
            P[i] = old
            assert abs((lp - lm) / 2e-5 - g[k][i]) < 1e-4, k


def test_onnx_export_matches_numpy(tmp_path):
    import onnxruntime as ort
    m = SmallCNN(["a", "b", "c", "d"], seed=3)
    m.to_onnx(tmp_path / "m.onnx")
    x = np.random.default_rng(1).random((4, 3, 64, 64)).astype(np.float32)
    out = ort.InferenceSession(str(tmp_path / "m.onnx")).run(None, {"image": x})[0]
    assert np.abs(out - m.predict_proba(x)).max() < 1e-5


def test_training_learns_task_and_backdoor(tmp_path, db_ready):
    from app.demo import synth
    from app.ml.training import PoisonSpec, train_model
    rng = np.random.default_rng(5)
    root = tmp_path / "data"
    for c in synth.CLASSES:
        (root / c).mkdir(parents=True)
        for i in range(40):
            synth.make_image(rng, c).save(root / c / f"img_{i}.png")
    clean = train_model(root, tmp_path / "m", "clean", epochs=4)
    assert clean["validation_accuracy"] >= 0.9
    assert clean["history"][-1]["loss"] < clean["history"][0]["loss"]
    bd = train_model(root, tmp_path / "m", "bd", epochs=12,
                     poison=PoisonSpec("water", 0.15, "bottom-right", "white", seed=3))
    assert bd["poison"]["measured_attack_success_rate"] >= 0.5
    assert (tmp_path / "m" / "bd.training_record.sig").exists()


def test_independent_verifier_catches_raw_sql_edit(tmp_path, db_ready):
    """verify_independent.py must detect an edit made directly in SQLite, with no app code."""
    import json
    import sqlite3
    import subprocess
    from app.config import settings
    from app.core.ledger import append_block
    from app.database import SessionLocal
    with SessionLocal() as s:
        blk = append_block(s, "TEST_EVENT", "verifier", {"decision": "QUARANTINE"})
    script = Path(__file__).resolve().parents[1] / "scripts" / "verify_independent.py"
    run = lambda: subprocess.run([sys.executable, str(script), "--home", str(settings.home)],
                                 capture_output=True, text=True)
    before = run()
    con = sqlite3.connect(settings.home / "tejas.db")
    original = con.execute('SELECT payload FROM audit_blocks WHERE "index"=?', (blk.index,)).fetchone()[0]
    con.execute('UPDATE audit_blocks SET payload=? WHERE "index"=?', (json.dumps({"decision": "ACCEPT"}), blk.index))
    con.commit()
    con.close()
    after = run()
    assert f"block #{blk.index}" in after.stdout and "payload altered" in after.stdout, after.stdout + before.stdout
    # restore so later tests see a valid ledger
    con = sqlite3.connect(settings.home / "tejas.db")
    con.execute('UPDATE audit_blocks SET payload=? WHERE "index"=?', (original, blk.index))
    con.commit()
    con.close()
