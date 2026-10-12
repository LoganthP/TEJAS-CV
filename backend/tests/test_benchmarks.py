"""Tests for benchmark metrics, pickle-safety, API endpoints, and smoke suite (WP8)."""
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.adapters.pickle_scan import scan_model_file
from app.adapters.torch_adapter import TorchAdapter
from app.benchmarks.metrics import (
    compute_auroc,
    compute_binary_metrics,
    compute_confusion_matrix,
    compute_roc_curve,
    compute_tpr_at_fpr,
)
from app.main import app


@pytest.fixture(scope="module")
def client(db_ready):
    with TestClient(app) as c:
        yield c


def test_confusion_matrix_and_metrics_math():
    # Hand-made ground truth and predictions
    # 4 True Positives, 1 False Positive, 2 False Negatives, 3 True Negatives
    y_true = [1, 1, 1, 1, 0, 1, 1, 0, 0, 0]
    y_pred = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]

    cm = compute_confusion_matrix(y_true, y_pred)
    assert cm["tp"] == 4
    assert cm["fp"] == 1
    assert cm["fn"] == 2
    assert cm["tn"] == 3

    metrics = compute_binary_metrics(y_true, y_pred)
    assert metrics["precision"] == 0.8
    assert metrics["recall"] == 0.6667
    assert metrics["f1"] == 0.7273
    assert metrics["accuracy"] == 0.7


def test_roc_and_auroc_math():
    y_true = [0, 0, 0, 1, 1, 1]
    y_scores = [10.0, 20.0, 30.0, 70.0, 80.0, 90.0]

    roc = compute_roc_curve(y_true, y_scores, num_thresholds=11)
    assert len(roc) > 0
    # Perfect separation should have AUROC = 1.0
    auroc = compute_auroc(y_true, y_scores)
    assert auroc == 1.0

    # In perfect separation, at 5% FPR we can achieve 100% TPR
    tpr = compute_tpr_at_fpr(y_true, y_scores, target_fpr=0.05)
    assert tpr == 1.0


def test_pickle_safety_path(tmp_path: Path):
    # Create a malicious pickle stream containing os.system opcode
    malicious_data = b"cos\nsystem\n(S'echo malicious'\ntR."
    mal_file = tmp_path / "malicious_model.pt"
    mal_file.write_bytes(malicious_data)

    # 1. Static scanner must detect the dangerous global
    scan_res = scan_model_file(mal_file)
    assert scan_res["scanned"] is True
    assert "os.system" in scan_res["dangerous"]

    # 2. Torch adapter must record dangerous scan and refuse prediction
    adapter = TorchAdapter(mal_file)
    assert adapter.can_predict is False
    assert "os.system" in adapter.pickle_report["dangerous"]
    inspect_info = adapter.inspect()
    assert "os.system" in inspect_info["pickle_scan"]["dangerous"]


def test_benchmarks_api_catalog(client):
    res = client.get("/api/benchmarks/catalog")
    assert res.status_code == 200
    data = res.json()
    assert "catalog" in data
    ids = [d["id"] for d in data["catalog"]]
    assert "cifar10" in ids
    assert "gtsrb" in ids
    assert "coco2017_val" in ids
    assert "yolo_coco8" in ids


def test_benchmarks_api_import_not_found(client):
    # Attempting to import non-existent ID or un-downloaded file must fail gracefully
    res = client.post("/api/benchmarks/import/nonexistent_dataset_123")
    assert res.status_code in (400, 404)


def test_benchmarks_api_runs_smoke(client):
    # Trigger a smoke run via API
    res = client.post("/api/benchmarks/runs", json={"suite": "smoke"})
    assert res.status_code == 200
    data = res.json()
    assert "run_id" in data
    assert data["status"] == "RUNNING"
    assert "websocket" in data

    # Query status
    run_id = data["run_id"]
    get_res = client.get(f"/api/benchmarks/runs/{run_id}")
    assert get_res.status_code == 200
    run_data = get_res.json()
    assert run_data["id"] == run_id


def test_ci_benchmark_suite_scores_against_ground_truth(tmp_path, db_ready):
    import sys as _sys
    scripts = Path(__file__).resolve().parents[1] / "scripts"
    if str(scripts) not in _sys.path:
        _sys.path.insert(0, str(scripts))
    from run_benchmark import run_suite
    from app.core.hashing import sha256_bytes
    from app.core.keys import platform_keys, verify_signature
    sm = run_suite(tmp_path / "run", "ci", log=lambda m: None)
    rows = sm["data_poisoning"]["rows"]
    assert rows and all(r["tp"] + r["fn"] == r["poisoned"] for r in rows)       # scored per file
    badnets = [r for r in rows if r["attack"] == "badnets"][0]
    assert badnets["recall"] and badnets["recall"] >= 0.5
    assert sm["inference"]["edit_detected"] and sm["inference"]["replay_detected"]
    assert all(d["decision"] != "QUARANTINE" for d in sm["drift"])                 # drift is never an attack
    body = (tmp_path / "run" / "results.json").read_bytes()
    sig = (tmp_path / "run" / "results.sig").read_text()
    assert verify_signature(platform_keys().public_hex, sha256_bytes(body), sig)
