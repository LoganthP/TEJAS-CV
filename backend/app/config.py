"""TEJAS-CV configuration.

Defaults support local, air-gapped use. Cloud deployments can configure a shared
PostgreSQL database and stable signing identity with environment variables.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _env_float(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


def _env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


class Settings:
    def __init__(self) -> None:
        # Vercel Functions cannot write to the deployed application directory.
        # This is instance-local scratch storage, not durable production storage.
        default_home = (
            Path(tempfile.gettempdir()) / "tejas-cv"
            if os.environ.get("VERCEL") == "1"
            else BACKEND_ROOT / "data"
        )
        self.home = Path(os.environ.get("TEJAS_HOME", default_home)).resolve()
        self.datasets_dir = self.home / "datasets"
        self.models_dir = self.home / "models"
        self.uploads_dir = self.home / "uploads"
        self.inference_dir = self.home / "inference_inputs"
        self.baselines_dir = self.home / "baselines"
        self.reports_dir = self.home / "reports"
        self.keys_dir = self.home / "keys"
        self.demo_dir = self.home / "demo_src"
        self.benchmarks_raw_dir = self.home / "benchmarks_raw"
        self.benchmarks_dir = self.home / "benchmarks"
        # Vercel's Neon / Postgres integrations inject one of these automatically.
        self.db_url = (
            os.environ.get("TEJAS_DB_URL")
            or os.environ.get("DATABASE_URL")
            or os.environ.get("POSTGRES_URL")
            or f"sqlite:///{self.home / 'tejas.db'}"
        ).strip()
        key = (os.environ.get("TEJAS_PLATFORM_PRIVATE_KEY") or "").strip(" \t\r\n\"'")
        if key.startswith("TEJAS_PLATFORM_PRIVATE_KEY="):      # whole line pasted from the key file
            key = key.split("=", 1)[1].strip(" \t\r\n\"'")
        self.platform_private_key = key or None
        self.db_pool_size = _env_int("TEJAS_DB_POOL_SIZE", 3)
        self.db_max_overflow = _env_int("TEJAS_DB_MAX_OVERFLOW", 5)
        self.on_vercel = os.environ.get("VERCEL") == "1"

        # Feature extraction. "auto" uses DINOv2 when a local checkout + weights are
        # configured, otherwise falls back to the built-in handcrafted embedder.
        self.embedder = os.environ.get("TEJAS_EMBEDDER", "auto")  # auto | dinov2 | handcrafted
        self.dinov2_repo = os.environ.get("TEJAS_DINOV2_REPO")  # local clone of facebookresearch/dinov2
        self.dinov2_weights = os.environ.get("TEJAS_DINOV2_WEIGHTS")  # e.g. dinov2_vits14_pretrain.pth
        self.dinov2_arch = os.environ.get("TEJAS_DINOV2_ARCH", "dinov2_vits14")

        # Scalability controls (sampling / batching / caching).
        self.max_analysis_samples = _env_int("TEJAS_MAX_SAMPLES", 2000)
        self.embed_batch_size = _env_int("TEJAS_EMBED_BATCH", 32)
        self.max_probe_images = _env_int("TEJAS_MAX_PROBES", 48)
        self.job_workers = _env_int("TEJAS_JOB_WORKERS", 2)

        # Detector thresholds.
        self.phash_threshold = _env_int("TEJAS_PHASH_THRESHOLD", 6)

        # Evidence fusion (prototype configuration, not a universal weighting).
        self.fusion_weights = {"data": 0.30, "model": 0.30, "provenance": 0.20, "drift": 0.20}
        self.fusion_max_blend = _env_float("TEJAS_FUSION_MAX_BLEND", 0.6)
        self.review_threshold = _env_float("TEJAS_REVIEW_AT", 35)
        self.quarantine_threshold = _env_float("TEJAS_QUARANTINE_AT", 70)

        # Safety limits for uploaded archives (configured for arbitrary archive sizes)
        self.max_archive_files = _env_int("TEJAS_MAX_ARCHIVE_FILES", 10_000_000)
        self.max_archive_bytes = _env_int("TEJAS_MAX_ARCHIVE_BYTES", 1024 * 1024**3)

        # Authentication is ON by default. TEJAS_AUTH_REQUIRED=0 exists only for the unit tests.
        self.auth_required = os.environ.get("TEJAS_AUTH_REQUIRED", "1") != "0"
        self.cors_origins = os.environ.get(
            "TEJAS_CORS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")

    def ensure_dirs(self) -> None:
        for d in (
            self.home, self.datasets_dir, self.models_dir, self.uploads_dir, self.inference_dir,
            self.baselines_dir, self.reports_dir, self.keys_dir, self.benchmarks_raw_dir, self.benchmarks_dir,
        ):
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
