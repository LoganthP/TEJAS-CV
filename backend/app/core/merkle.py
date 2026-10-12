"""Merkle tree with RFC 6962-style domain separation (0x00 leaf, 0x01 node).

Used to (a) commit to every sample of a dataset in a single root hash and
(b) commit to every finding/asset hash inside an audit block. Inclusion proofs let
an auditor prove one image belonged to a registered dataset without the whole dataset.
"""
from __future__ import annotations

import hashlib

_LEAF, _NODE = b"\x00", b"\x01"
EMPTY_ROOT = hashlib.sha256(b"").hexdigest()


def _h(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def _leaves(leaves: list[str]) -> list[bytes]:
    return [_h(_LEAF + bytes.fromhex(x)) for x in leaves]


def merkle_root(leaves: list[str]) -> str:
    if not leaves:
        return EMPTY_ROOT
    level = _leaves(leaves)
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [_h(_NODE + level[i] + level[i + 1]) for i in range(0, len(level), 2)]
    return level[0].hex()


def merkle_proof(leaves: list[str], index: int) -> list[dict]:
    if not 0 <= index < len(leaves):
        raise IndexError("leaf index out of range")
    level, idx, proof = _leaves(leaves), index, []
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        sib = idx ^ 1
        proof.append({"position": "left" if sib < idx else "right", "hash": level[sib].hex()})
        level = [_h(_NODE + level[i] + level[i + 1]) for i in range(0, len(level), 2)]
        idx //= 2
    return proof


def verify_proof(leaf: str, proof: list[dict], root: str) -> bool:
    h = _h(_LEAF + bytes.fromhex(leaf))
    for step in proof:
        sib = bytes.fromhex(step["hash"])
        h = _h(_NODE + sib + h) if step["position"] == "left" else _h(_NODE + h + sib)
    return h.hex() == root
