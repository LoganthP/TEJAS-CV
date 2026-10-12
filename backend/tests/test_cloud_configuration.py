import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_mock_engine, create_engine, text, inspect

from app import database
from app.config import Settings, settings
from app.core.keys import KeyManager
from app.main import app


def test_api_responses_are_not_cacheable():
    with TestClient(app) as client:
        for path in ("/api/health", "/api/auth/status"):
            response = client.get(path)
            assert response.status_code == 200
            assert response.headers["cache-control"] == "private, no-store"
            assert response.headers["vercel-cdn-cache-control"] == "no-store"


def test_cloud_key_is_stable_across_separate_filesystems(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "platform_private_key", "19" * 32)
    first = KeyManager(tmp_path / "instance-one")
    second = KeyManager(tmp_path / "instance-two")
    assert first.public_hex == second.public_hex
    assert first.sign("audit record") == second.sign("audit record")
    assert not (tmp_path / "instance-one" / "tejas_platform_ed25519.pem").exists()


def test_invalid_cloud_key_fails_with_actionable_message(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "platform_private_key", "bad-key")
    with pytest.raises(ValueError, match="TEJAS_PLATFORM_PRIVATE_KEY"):
        KeyManager(tmp_path)


def test_shared_vercel_database_requires_a_stable_key(monkeypatch):
    from types import SimpleNamespace
    from app import main

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(settings, "platform_private_key", None)
    monkeypatch.setattr(main, "engine", SimpleNamespace(dialect=SimpleNamespace(name="postgresql")))
    with pytest.raises(RuntimeError, match="TEJAS_PLATFORM_PRIVATE_KEY"):
        with TestClient(app):
            pass


def test_https_login_cookie_and_session_survive_separate_requests(monkeypatch):
    from app.auth.security import hash_password
    from app.database import User, SessionLocal, AuthSession

    monkeypatch.setattr(settings, "auth_required", True)
    with TestClient(app, base_url="https://tejas.example") as client:
        with SessionLocal() as db:
            user = User(username="cloud.cookie.test", display_name="Cloud test", role="client",
                        status="active", password_hash=hash_password("Test-password-2026"))
            db.add(user)
            db.commit()
            user_id = user.id
        try:
            response = client.post("/api/auth/login", json={"username": "cloud.cookie.test", "password": "Test-password-2026"})
            assert response.status_code == 200
            assert "Secure" in response.headers["set-cookie"]
            assert "HttpOnly" in response.headers["set-cookie"]
            assert response.headers["cache-control"] == "private, no-store"
            for _ in range(3):
                assert client.get("/api/auth/me").json()["id"] == user_id
        finally:
            with SessionLocal() as db:
                db.query(AuthSession).filter_by(user_id=user_id).delete()
                db.query(User).filter_by(id=user_id).delete()
                db.commit()


def test_postgresql_schema_compiles():
    statements = []
    mock_engine = create_mock_engine("postgresql+psycopg://", lambda sql, *args, **kwargs: statements.append(str(sql.compile(dialect=mock_engine.dialect))))
    database.Base.metadata.create_all(mock_engine)
    assert any("CREATE TABLE auth_sessions" in sql for sql in statements)
    assert all("DATETIME" not in sql for sql in statements)


def test_neon_database_url_is_used_with_explicit_override(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://neon.example/tejas")
    monkeypatch.delenv("TEJAS_DB_URL", raising=False)
    assert Settings().db_url == "postgresql://neon.example/tejas"
    monkeypatch.setenv("TEJAS_DB_URL", "postgresql://override.example/tejas")
    assert Settings().db_url == "postgresql://override.example/tejas"


@pytest.mark.parametrize("value", [
    "  '" + "19" * 32 + "'  ",
    'TEJAS_PLATFORM_PRIVATE_KEY="' + "19" * 32 + '"\n',
    ' "TEJAS_PLATFORM_PRIVATE_KEY=\'' + "19" * 32 + '\'" ',
])
def test_pasted_signing_key_is_normalized(value, monkeypatch):
    monkeypatch.setenv("TEJAS_PLATFORM_PRIVATE_KEY", value)
    assert Settings().platform_private_key == "19" * 32


def test_schema_fingerprint_includes_migration_types(monkeypatch):
    before = database._schema_fingerprint()
    monkeypatch.setattr(database, "_MIGRATIONS", [
        *database._MIGRATIONS[:-1], ("dataset_samples", "source_meta", "TEXT")
    ])
    assert database._schema_fingerprint() != before


def test_sqlite_status_verification_detects_raw_edit(session):
    from app.core.ledger import append_block, verify_chain_cached
    from app.database import AuditBlock

    block = append_block(session, "CACHE_TEST", "test", {"original": True})
    original = block.payload
    try:
        assert verify_chain_cached(session)["valid"]
        session.execute(text("UPDATE audit_blocks SET payload = :p WHERE \"index\" = :i"),
                        {"p": '{"altered":true}', "i": block.index})
        session.commit()
        assert not verify_chain_cached(session)["valid"]
    finally:
        session.query(AuditBlock).filter_by(index=block.index).update({"payload": original})
        session.commit()


def test_existing_database_migrates_and_preserves_user_records(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    monkeypatch.setattr(database, "engine", engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id VARCHAR PRIMARY KEY, role VARCHAR)"))
        conn.execute(text("INSERT INTO users VALUES ('existing-user', 'user')"))
    database.init_db()
    database.init_db()
    with engine.connect() as conn:
        row = conn.execute(text("SELECT id, role, status FROM users")).one()
        assert tuple(row) == ("existing-user", "client", "pending")
        assert "reviewed_at" in {col["name"] for col in inspect(conn).get_columns("users")}
    engine.dispose()
