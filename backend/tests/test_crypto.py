"""Cryptographic primitives: hashing, Merkle proofs, Ed25519 signatures."""
from app.core.hashing import sha256_bytes, sha256_json
from app.core.keys import generate_keypair, sign_with, verify_signature
from app.core.merkle import merkle_proof, merkle_root, verify_proof


def test_sha256_known_vector():
    assert sha256_bytes(b"abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_canonical_json_is_order_independent():
    assert sha256_json({"a": 1, "b": 2}) == sha256_json({"b": 2, "a": 1})
    assert sha256_json({"a": 1}) != sha256_json({"a": 2})


def test_merkle_proofs_verify_for_every_leaf():
    leaves = [sha256_bytes(str(i).encode()) for i in range(13)]  # odd count on purpose
    root = merkle_root(leaves)
    for i, leaf in enumerate(leaves):
        assert verify_proof(leaf, merkle_proof(leaves, i), root)


def test_merkle_detects_altered_leaf():
    leaves = [sha256_bytes(str(i).encode()) for i in range(8)]
    root = merkle_root(leaves)
    proof = merkle_proof(leaves, 3)
    assert not verify_proof(sha256_bytes(b"evil"), proof, root)
    changed = list(leaves)
    changed[5] = sha256_bytes(b"evil")
    assert merkle_root(changed) != root


def test_ed25519_sign_verify_and_reject():
    priv, pub = generate_keypair()
    sig = sign_with(priv, "payload")
    assert verify_signature(pub, "payload", sig)
    assert not verify_signature(pub, "payload!", sig)
    _, other_pub = generate_keypair()
    assert not verify_signature(other_pub, "payload", sig)
    assert not verify_signature(pub, "payload", None)
