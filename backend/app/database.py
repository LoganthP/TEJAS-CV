"""Persistence layer: SQLite locally, PostgreSQL for shared cloud state."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (JSON, Boolean, Float, ForeignKey, Integer, LargeBinary, String, Text,
                        create_engine, event, inspect, text)
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings

settings.ensure_dirs()
db_url = make_url(settings.db_url)
if db_url.drivername in ("postgres", "postgresql"):
    db_url = db_url.set(drivername="postgresql+psycopg")
if db_url.get_backend_name() not in ("sqlite", "postgresql"):
    raise ValueError("TEJAS_DB_URL must use SQLite or PostgreSQL")
if db_url.get_backend_name() == "sqlite":
    engine = create_engine(db_url, pool_pre_ping=True, connect_args={"check_same_thread": False})
else:
    # Serverless-friendly PostgreSQL settings (Vercel + Neon/Supabase):
    #  - timezone=UTC: naive TIMESTAMP columns (session expiry!) are always read back as UTC,
    #    so a non-UTC database default can never make fresh sessions look expired.
    #  - prepare_threshold=None: safe behind PgBouncer-style poolers (Neon "-pooler" URLs).
    #  - small pool + recycle: an idle Neon compute drops connections; pre_ping heals them.
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        pool_size=int(settings.db_pool_size),
        max_overflow=int(settings.db_max_overflow),
        pool_recycle=280,
        pool_timeout=15,
        connect_args={"options": "-c timezone=UTC", "connect_timeout": 10, "prepare_threshold": None},
    )


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _):  # WAL lets the dashboard read while jobs write.
    if engine.dialect.name != "sqlite":
        return
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA busy_timeout=10000")
    cur.close()


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utcnow().isoformat(timespec="microseconds")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSON, list[Any]: JSON}


class Contributor(Base):
    __tablename__ = "contributors"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("CTB"))
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    public_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    organisation: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    asset_type: Mapped[str] = mapped_column(String, index=True)  # dataset | model
    name: Mapped[str] = mapped_column(String)
    contributor: Mapped[str] = mapped_column(String, index=True)
    sha256: Mapped[str] = mapped_column(String, index=True)  # dataset: Merkle root of samples
    size: Mapped[int] = mapped_column(Integer, default=0)
    path: Mapped[str] = mapped_column(String)
    signature: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String, default="REGISTERED")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    uploaded_by: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)


class DatasetSample(Base):
    __tablename__ = "dataset_samples"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    relpath: Mapped[str] = mapped_column(String)
    label: Mapped[str] = mapped_column(String, index=True)
    contributor: Mapped[str] = mapped_column(String, index=True)
    sha256: Mapped[str] = mapped_column(String, index=True)
    phash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    size: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    readable: Mapped[bool] = mapped_column(Boolean, default=True)
    error: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    stats: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_meta: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)


class DatasetAnnotation(Base):
    __tablename__ = "dataset_annotations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sample_id: Mapped[int] = mapped_column(ForeignKey("dataset_samples.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String, index=True)  # class name
    class_id: Mapped[int] = mapped_column(Integer, default=0)
    bbox: Mapped[list[float]] = mapped_column(JSON)  # [x1, y1, x2, y2]
    area: Mapped[float] = mapped_column(Float, default=0.0)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    validation_error: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class TrustedModel(Base):
    """Signed reference fingerprint of an approved model (the model registry)."""
    __tablename__ = "trusted_models"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("TM"))
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    sha256: Mapped[str] = mapped_column(String)
    structure_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    param_count: Mapped[int] = mapped_column(Integer, default=0)
    model_format: Mapped[str] = mapped_column(String, default="unknown")
    behavior_fingerprint: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_asset_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    signature: Mapped[str] = mapped_column(String)
    registered_at: Mapped[str] = mapped_column(String, default=iso_now)


class Baseline(Base):
    __tablename__ = "baselines"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("BL"))
    name: Mapped[str] = mapped_column(String)
    dataset_id: Mapped[str] = mapped_column(String)
    embedder: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(String)
    file_sha256: Mapped[str] = mapped_column(String)
    stats: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("JOB"))
    label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    dataset_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    model_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    baseline_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    trusted_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="QUEUED")
    stage: Mapped[str] = mapped_column(String, default="QUEUED")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    risk_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    decision: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    engine_scores: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    report: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)


class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    engine: Mapped[str] = mapped_column(String, index=True)
    finding_type: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String)
    confidence: Mapped[float] = mapped_column(Float)
    score: Mapped[float] = mapped_column(Float)
    title: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(Text)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    recommendation: Mapped[str] = mapped_column(Text)
    subject: Mapped[str] = mapped_column(String, default="")
    finding_hash: Mapped[str] = mapped_column(String, default="")


class InferenceRecord(Base):
    __tablename__ = "inference_records"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("INF"))
    seq: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    model_asset_id: Mapped[str] = mapped_column(String, index=True)
    model_hash: Mapped[str] = mapped_column(String)
    input_hash: Mapped[str] = mapped_column(String)
    input_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    output: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output_hash: Mapped[str] = mapped_column(String)
    timestamp: Mapped[str] = mapped_column(String)
    nonce: Mapped[str] = mapped_column(String, index=True)
    previous_hash: Mapped[str] = mapped_column(String)
    record_hash: Mapped[str] = mapped_column(String)
    signature: Mapped[str] = mapped_column(String)
    attestations: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class AuditBlock(Base):
    __tablename__ = "audit_blocks"
    index: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[str] = mapped_column(String)
    event_type: Mapped[str] = mapped_column(String, index=True)
    subject: Mapped[str] = mapped_column(String, default="")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    payload_hash: Mapped[str] = mapped_column(String)
    merkle_root: Mapped[str] = mapped_column(String)
    leaf_count: Mapped[int] = mapped_column(Integer, default=1)
    previous_hash: Mapped[str] = mapped_column(String)
    block_hash: Mapped[str] = mapped_column(String)
    signature: Mapped[str] = mapped_column(String)


class EmbeddingCache(Base):
    """Incremental analysis: embeddings are cached by (embedder, content hash)."""
    __tablename__ = "embedding_cache"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    vector: Mapped[bytes] = mapped_column(LargeBinary)


class User(Base):
    """Platform account. Roles: 'admin', 'operator', 'client'."""
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("USR"))
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String, default="")
    role: Mapped[str] = mapped_column(String, default="client")
    status: Mapped[str] = mapped_column(String, default="pending")
    requested_role: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    request_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role_request: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role_request_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role_request_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    password_hash: Mapped[str] = mapped_column(String)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    avatar: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    created_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)


class AuthSession(Base):
    """Server-side session: only the SHA-256 of the token is stored, so a DB leak can't log anyone in."""
    __tablename__ = "auth_sessions"
    token_sha256: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime] = mapped_column()
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


# Provenance: stamp who created each record, from the current actor (request / job / CLI).
_STAMP = {"Asset": "uploaded_by", "Job": "created_by", "InferenceRecord": "created_by"}


@event.listens_for(Base, "before_insert", propagate=True)
def _stamp_actor(_mapper, _conn, target):
    col = _STAMP.get(type(target).__name__)
    if col and not getattr(target, col, None):
        from .core.actor import current_actor
        setattr(target, col, current_actor())


# Columns added after the first release; ALTER existing databases in place.
_MIGRATIONS = [
    ("assets", "uploaded_by", "VARCHAR"),
    ("jobs", "created_by", "VARCHAR"),
    ("inference_records", "created_by", "VARCHAR"),
    ("users", "status", "VARCHAR DEFAULT 'pending'"),
    ("users", "requested_role", "VARCHAR"),
    ("users", "request_note", "TEXT"),
    ("users", "reviewed_by", "VARCHAR"),
    ("users", "reviewed_at", "DATETIME"),
    ("users", "review_note", "TEXT"),
    ("users", "email", "VARCHAR"),
    ("users", "unit", "VARCHAR"),
    ("users", "role_request", "VARCHAR"),
    ("users", "role_request_note", "TEXT"),
    ("users", "role_request_at", "DATETIME"),
    ("users", "avatar", "VARCHAR"),
    ("dataset_samples", "source_meta", "JSON"),
]


def _migrate(conn) -> None:
    inspector = inspect(conn)
    col_cache: dict[str, set[str]] = {}
    for table, col, typ in _MIGRATIONS:
        if table not in col_cache:                     # one introspection query per table, not per column
            col_cache[table] = {c["name"] for c in inspector.get_columns(table)}
        cols = col_cache[table]
        if cols and col not in cols:
            if engine.dialect.name == "postgresql" and typ == "DATETIME":
                typ = "TIMESTAMP WITHOUT TIME ZONE"
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {typ}"))
            cols.add(col)
    user_cols = col_cache["users"]
    if "role" in user_cols:
        conn.execute(text("UPDATE users SET role = 'client' WHERE role = 'user'"))
    if "status" in user_cols:
        conn.execute(text("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''"))


def _schema_fingerprint() -> str:
    """Changes whenever a table, column or migration is added, so upgrades still run."""
    import hashlib
    parts = [f"{t.name}:{','.join(sorted(c.name for c in t.columns))}"
             for t in sorted(Base.metadata.sorted_tables, key=lambda t: t.name)]
    parts += [f"{t}.{c}:{typ}" for t, c, typ in _MIGRATIONS]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


_META_DDL = "CREATE TABLE IF NOT EXISTS tejas_meta (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL)"


def _schema_is_current(conn, fp: str) -> bool:
    # Check existence before reading, avoiding a SELECT against a missing
    # relation (which would abort a PostgreSQL transaction).
    exists = inspect(conn).has_table("tejas_meta")
    if not exists:
        return False
    row = conn.execute(text("SELECT value FROM tejas_meta WHERE key = 'schema'")).first()
    return bool(row) and row[0] == fp


def init_db() -> None:
    """Create/migrate the schema.

    Serverless cold starts call this often. When the stored schema fingerprint matches,
    it costs an existence check and one metadata query instead of dozens of
    introspection round-trips to a remote database.
    """
    fp = _schema_fingerprint()
    if engine.dialect.name == "postgresql":
        with engine.connect() as conn:
            if _schema_is_current(conn, fp):
                return
    # Concurrent cold starts must not race table creation/migration.
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(74219001)"))
        conn.execute(text(_META_DDL))                  # exists before it is queried (no aborted txn)
        if engine.dialect.name == "postgresql" and _schema_is_current(conn, fp):
            return                                     # another instance finished while we waited
        Base.metadata.create_all(conn)
        _migrate(conn)
        conn.execute(text("INSERT INTO tejas_meta (key, value) VALUES ('schema', :v) "
                          "ON CONFLICT (key) DO UPDATE SET value = excluded.value"), {"v": fp})


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
