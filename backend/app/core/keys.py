"""Ed25519 signing. The platform key lives on local disk (prototype); production
deployments would move it into an HSM/KMS, as noted in the submission's risk table."""
from __future__ import annotations

import os
import threading
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (Ed25519PrivateKey,
                                                               Ed25519PublicKey)

from ..config import settings
from .hashing import sha256_bytes


def _b(data: bytes | str) -> bytes:
    return data.encode("utf-8") if isinstance(data, str) else data


def _raw_pub(pub: Ed25519PublicKey) -> bytes:
    return pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


class KeyManager:
    def __init__(self, key_dir: Path):
        key_dir.mkdir(parents=True, exist_ok=True)
        path = key_dir / "tejas_platform_ed25519.pem"
        if settings.platform_private_key:
            try:
                self._priv = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(settings.platform_private_key))
            except ValueError as exc:
                raise ValueError("TEJAS_PLATFORM_PRIVATE_KEY must be a 32-byte Ed25519 private key encoded as 64 hex characters") from exc
        elif path.exists():
            self._priv = serialization.load_pem_private_key(path.read_bytes(), password=None)
        else:
            self._priv = Ed25519PrivateKey.generate()
            pem = self._priv.private_bytes(serialization.Encoding.PEM,
                                           serialization.PrivateFormat.PKCS8,
                                           serialization.NoEncryption())
            path.write_bytes(pem)
            os.chmod(path, 0o600)
        self.public_hex = _raw_pub(self._priv.public_key()).hex()
        self.key_id = "ed25519:" + sha256_bytes(bytes.fromhex(self.public_hex))[:16]
        # Public half only, for independent verification (scripts/verify_independent.py, OpenSSL).
        pub_pem = self._priv.public_key().public_bytes(serialization.Encoding.PEM,
                                                       serialization.PublicFormat.SubjectPublicKeyInfo)
        (key_dir / "tejas_platform_ed25519.pub.pem").write_bytes(pub_pem)

    def sign(self, data: bytes | str) -> str:
        return self._priv.sign(_b(data)).hex()


def verify_signature(public_hex: str, data: bytes | str, signature_hex: str | None) -> bool:
    if not public_hex or not signature_hex:
        return False
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_hex)).verify(
            bytes.fromhex(signature_hex), _b(data))
        return True
    except (InvalidSignature, ValueError):
        return False


def generate_keypair() -> tuple[str, str]:
    """Returns (private_hex, public_hex) for a contributor."""
    priv = Ed25519PrivateKey.generate()
    raw = priv.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw,
                             serialization.NoEncryption())
    return raw.hex(), _raw_pub(priv.public_key()).hex()


def sign_with(private_hex: str, data: bytes | str) -> str:
    return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(private_hex)).sign(_b(data)).hex()


_km: KeyManager | None = None
_lock = threading.Lock()


def platform_keys() -> KeyManager:
    global _km
    with _lock:
        if _km is None:
            _km = KeyManager(settings.keys_dir)
        return _km


_rt_km: KeyManager | None = None


def red_team_keys() -> KeyManager:
    global _rt_km
    with _lock:
        if _rt_km is None:
            class RedTeamKeyManager(KeyManager):
                def __init__(self, key_dir: Path):
                    path = key_dir / "red_team_ed25519.pem"
                    if path.exists():
                        self._priv = serialization.load_pem_private_key(path.read_bytes(), password=None)
                    else:
                        self._priv = Ed25519PrivateKey.generate()
                        pem = self._priv.private_bytes(
                            serialization.Encoding.PEM,
                            serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption(),
                        )
                        path.write_bytes(pem)
                    self.public_hex = _raw_pub(self._priv.public_key()).hex()
                    self.key_id = "redteam:" + sha256_bytes(bytes.fromhex(self.public_hex))[:16]

            _rt_km = RedTeamKeyManager(settings.keys_dir)
        return _rt_km
