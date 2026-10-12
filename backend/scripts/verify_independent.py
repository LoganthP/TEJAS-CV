"""Independent verifier: checks TEJAS-CV's evidence WITHOUT importing any TEJAS-CV code.

It uses only the Python standard library (sqlite3, hashlib, json) and the `cryptography`
package, plus the platform's PUBLIC key. It re-implements the published hashing rules from
scratch, so a judge can read this one file and confirm the platform is not "verifying itself".

    python scripts/verify_independent.py                       # uses backend/data
    python scripts/verify_independent.py --home D:/tejas-data  # another TEJAS_HOME
    python scripts/verify_independent.py --rehash-files        # also re-hash every dataset/model file

Checks:
  1. audit ledger   : payload hash, header hash, chain link, Ed25519 signature of every block
  2. inference chain: output hash, record hash, link, signature, nonce reuse
  3. assets on disk : dataset Merkle roots and model SHA-256 recomputed from the files
  4. signed reports : every reports/*.json and benchmarks/**/results.json signature
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.serialization import load_pem_public_key

GENESIS = "0" * 64


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def merkle(leaves: list[str]) -> str:
    if not leaves:
        return sha(b"")
    lvl = [hashlib.sha256(b"\x00" + bytes.fromhex(x)).digest() for x in leaves]
    while len(lvl) > 1:
        if len(lvl) % 2:
            lvl.append(lvl[-1])
        lvl = [hashlib.sha256(b"\x01" + lvl[i] + lvl[i + 1]).digest() for i in range(0, len(lvl), 2)]
    return lvl[0].hex()


def file_sha(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Verifier:
    def __init__(self, pub_pem: bytes):
        self.pub = load_pem_public_key(pub_pem)

    def sig_ok(self, message_hex: str, sig_hex: str | None) -> bool:
        try:
            self.pub.verify(bytes.fromhex(sig_hex or ""), message_hex.encode())
            return True
        except (InvalidSignature, ValueError):
            return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--home", default=os.environ.get("TEJAS_HOME", str(Path(__file__).resolve().parents[1] / "data")))
    ap.add_argument("--rehash-files", action="store_true")
    a = ap.parse_args()
    home = Path(a.home)
    pub_path = home / "keys" / "tejas_platform_ed25519.pub.pem"
    db_path = home / "tejas.db"
    if not pub_path.exists() or not db_path.exists():
        print(f"[x] need {db_path} and {pub_path} (start the server once to create them)")
        return 2
    v = Verifier(pub_path.read_bytes())
    print(f"Public key : {pub_path}")
    print(f"Database   : {db_path}\n")
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    problems = 0

    # 1. audit ledger ---------------------------------------------------------------
    rows = con.execute("SELECT * FROM audit_blocks ORDER BY \"index\"").fetchall()
    prev, first_bad = GENESIS, None
    for b in rows:
        issues = []
        payload = json.loads(b["payload"]) if b["payload"] else {}
        if sha(canonical(payload)) != b["payload_hash"]:
            issues.append("payload altered")
        core = {k: b[k] for k in ("index", "timestamp", "event_type", "subject", "payload_hash",
                                  "merkle_root", "previous_hash")}
        if sha(canonical(core)) != b["block_hash"]:
            issues.append("header altered")
        if b["previous_hash"] != prev:
            issues.append("chain link broken")
        if not v.sig_ok(b["block_hash"], b["signature"]):
            issues.append("bad signature")
        if issues and first_bad is None:
            first_bad = b["index"]
        if issues:
            print(f"  block #{b['index']:<4} {b['event_type']:<22} TAMPERED: {', '.join(issues)}")
        prev = b["block_hash"]
    problems += first_bad is not None
    print(f"[{'OK' if first_bad is None else '!!'}] Audit ledger: {len(rows)} blocks, "
          + ("all hashes, links and signatures valid" if first_bad is None
             else f"first broken block #{first_bad}; everything after it is untrusted"))

    # 2. inference chain --------------------------------------------------------------
    rows = con.execute("SELECT * FROM inference_records ORDER BY seq").fetchall()
    prev, bad, nonces = GENESIS, [], set()
    for r in rows:
        issues = []
        if sha(canonical(json.loads(r["output"]))) != r["output_hash"]:
            issues.append("output altered")
        core = {k: r[k] for k in ("seq", "model_asset_id", "model_hash", "input_hash", "output_hash",
                                  "timestamp", "nonce", "previous_hash")}
        if sha(canonical(core)) != r["record_hash"]:
            issues.append("record altered")
        if r["previous_hash"] != prev:
            issues.append("link broken")
        if not v.sig_ok(r["record_hash"], r["signature"]):
            issues.append("bad signature")
        if r["nonce"] in nonces:
            issues.append("nonce reused")
        nonces.add(r["nonce"])
        if issues:
            bad.append((r["seq"], issues))
        prev = r["record_hash"]
    for seq, issues in bad:
        print(f"  inference #{seq}: {', '.join(issues)}")
    problems += bool(bad)
    print(f"[{'OK' if not bad else '!!'}] Inference chain: {len(rows)} records, {len(bad)} failing")

    # 3. assets on disk ---------------------------------------------------------------
    if a.rehash_files:
        bad_assets = 0
        for asset in con.execute("SELECT id, asset_type, name, sha256, path FROM assets").fetchall():
            p = Path(asset["path"])
            if not p.exists():
                print(f"  {asset['id']} missing on disk")
                bad_assets += 1
                continue
            if asset["asset_type"] == "model":
                ok = file_sha(p) == asset["sha256"]
            else:
                rels = [x["relpath"] for x in con.execute(
                    "SELECT relpath FROM dataset_samples WHERE dataset_id=? ORDER BY relpath", (asset["id"],))]
                ok = merkle([file_sha(p / r) if (p / r).exists() else "00" * 32 for r in rels]) == asset["sha256"]
            if not ok:
                bad_assets += 1
                print(f"  {asset['id']} ({asset['asset_type']}) '{asset['name']}': content no longer matches "
                      f"the registered {'SHA-256' if asset['asset_type'] == 'model' else 'Merkle root'}")
        problems += bad_assets > 0
        print(f"[{'OK' if not bad_assets else '!!'}] Files on disk re-hashed: {bad_assets} mismatch(es)")

    # 4. signed reports -----------------------------------------------------------------
    n_rep = bad_rep = 0
    for rp in sorted((home / "reports").glob("*.json")):
        rep = json.loads(rp.read_text(encoding="utf-8"))
        body = {k: val for k, val in rep.items() if k not in ("report_hash", "signature")}
        n_rep += 1
        if sha(canonical(body)) != rep.get("report_hash") or not v.sig_ok(rep.get("report_hash", ""), rep.get("signature")):
            bad_rep += 1
            print(f"  report {rp.name}: hash or signature INVALID")
    for rp in sorted((home / "benchmarks").rglob("results.json")):
        sig = rp.with_name("results.sig")
        n_rep += 1
        if not sig.exists() or not v.sig_ok(sha(rp.read_bytes()), sig.read_text().strip()):
            bad_rep += 1
            print(f"  benchmark {rp.parent.name}: results.json does not match its signature")
    problems += bad_rep > 0
    print(f"[{'OK' if not bad_rep else '!!'}] Signed reports: {n_rep} checked, {bad_rep} invalid")
    print("\nRESULT:", "everything verifies" if not problems else "TAMPERING DETECTED (see above)")
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main())
