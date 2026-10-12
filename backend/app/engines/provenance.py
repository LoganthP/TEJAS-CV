"""PROVENANCE & TAMPER DETECTION ENGINE
At-rest integrity (SHA-256 / Merkle), contributor signatures (Ed25519), signed manifests,
inference provenance chain, and the audit ledger itself."""
from __future__ import annotations

import json
from pathlib import Path

from ..core.hashing import sha256_file
from ..core.keys import verify_signature
from ..core.ledger import verify_chain
from ..core.merkle import merkle_root
from ..database import Contributor, SessionLocal
from ..services.inference import verify_inference_chain
from .base import AnalysisContext, EngineResult, Finding

ENGINE = "provenance"


def _contributor_check(res, session, asset, signed_obj_desc: str, signed_bytes, signature, ref):
    c = session.query(Contributor).filter_by(name=asset.contributor).first()
    if c is None:
        res.add(Finding(ENGINE, "UNREGISTERED_CONTRIBUTOR", "MEDIUM", 0.8,
                        f"Contributor '{asset.contributor}' is not registered",
                        "The asset's declared source has no registered identity or key, so its origin "
                        "cannot be authenticated.", {"contributor": asset.contributor},
                        "Register the contributor and their public key, or reject the asset.", ref))
        res.check(f"contributor_identity:{asset.asset_type}", "FLAGGED", "unregistered")
        return
    if not signature:
        res.add(Finding(ENGINE, "UNSIGNED_CONTRIBUTION", "LOW", 0.9,
                        f"{asset.asset_type.title()} from '{c.name}' is unsigned",
                        f"No Ed25519 signature over the {signed_obj_desc} was supplied.",
                        {"contributor": c.name}, "Require signed submissions.", ref))
        res.check(f"contributor_signature:{asset.asset_type}", "FLAGGED", "unsigned")
        return
    ok = bool(c.public_key) and verify_signature(c.public_key, signed_bytes, signature)
    if not ok:
        res.add(Finding(ENGINE, "INVALID_CONTRIBUTOR_SIGNATURE", "HIGH", 0.95,
                        f"Signature does not verify against '{c.name}' public key",
                        f"The {signed_obj_desc} was altered after signing, or was signed by someone else.",
                        {"contributor": c.name, "signed_object": signed_obj_desc},
                        "QUARANTINE. Re-obtain the asset directly from the contributor.", ref))
    res.check(f"contributor_signature:{asset.asset_type}", "PASSED" if ok else "FLAGGED",
              f"Ed25519 {'valid' if ok else 'INVALID'} ({c.name})")


def run(ctx: AnalysisContext) -> EngineResult:
    res = EngineResult(ENGINE)
    session = SessionLocal()
    try:
        # 1. Dataset at-rest integrity + manifest ------------------------------------
        if ctx.dataset is not None:
            ds, ref = ctx.dataset, f"dataset {ctx.dataset.id}"
            root = Path(ds.path)
            ctx.progress(ENGINE, 0.05, "Re-hashing dataset files (at-rest integrity)")
            changed, missing, leaves = [], [], []
            for k, s in enumerate(sorted(ctx.samples, key=lambda x: x["relpath"])):
                p = root / s["relpath"]
                if not p.exists():
                    missing.append(s["relpath"])
                    continue
                h = sha256_file(p)
                leaves.append(h)
                if h != s["sha256"]:
                    changed.append({"path": s["relpath"], "registered": s["sha256"], "current": h})
                if k % 200 == 0:
                    ctx.progress(ENGINE, 0.05 + 0.3 * k / max(1, len(ctx.samples)), "Re-hashing dataset files")
            root_now = merkle_root(leaves)
            ok = not changed and not missing and root_now == ds.sha256
            if not ok:
                res.add(Finding(ENGINE, "DATASET_MODIFIED_AT_REST", "CRITICAL", 1.0,
                                f"Dataset changed after registration ({len(changed)} altered, {len(missing)} missing)",
                                "Files no longer match the SHA-256 values committed in the dataset's Merkle "
                                "root at registration time.",
                                {"registered_merkle_root": ds.sha256, "current_merkle_root": root_now,
                                 "altered": changed[:20], "missing": missing[:20]},
                                "QUARANTINE. Restore from the registered copy.", ref))
            res.check("dataset_merkle_integrity", "PASSED" if ok else "FLAGGED",
                      f"Merkle root {'matches' if ok else 'MISMATCH'}")

            ctx.progress(ENGINE, 0.4, "Verifying signed contributor manifest")
            mpath, spath = root / "manifest.json", root / "manifest.sig"
            if mpath.exists():
                mbytes = mpath.read_bytes()
                sig = spath.read_text().strip() if spath.exists() else None
                _contributor_check(res, session, ds, "manifest.json", mbytes, sig, ref)
                try:
                    manifest = json.loads(mbytes)
                    declared = {f["path"]: f for f in manifest.get("files", [])}
                    actual = {s["relpath"]: s for s in ctx.samples}
                    mism = [{"path": p, "declared": d["sha256"], "actual": actual[p]["sha256"],
                             "contributor": actual[p]["contributor"]}
                            for p, d in declared.items() if p in actual and d.get("sha256") != actual[p]["sha256"]]
                    extra = sorted(set(actual) - set(declared))
                    absent = sorted(set(declared) - set(actual))
                    if mism:
                        res.add(Finding(ENGINE, "MANIFEST_HASH_MISMATCH", "HIGH", 0.97,
                                        f"{len(mism)} file(s) differ from the contributor-signed manifest",
                                        "These files were modified after the contributor signed the manifest "
                                        "(in transit or in storage).", {"files": mism[:20]},
                                        "QUARANTINE affected files; trace the transfer path.", ref))
                    if extra or absent:
                        res.add(Finding(ENGINE, "MANIFEST_COVERAGE_GAP", "MEDIUM", 0.9,
                                        f"{len(extra)} unmanifested file(s), {len(absent)} declared file(s) missing",
                                        "The delivered content does not match what the contributor declared.",
                                        {"unmanifested": extra[:20], "missing": absent[:20]},
                                        "Reconcile the delivery against the manifest.", ref))
                    res.check("manifest_hashes", "FLAGGED" if (mism or extra or absent) else "PASSED",
                              f"{len(declared)} declared entries")
                except (json.JSONDecodeError, KeyError, TypeError) as exc:
                    res.add(Finding(ENGINE, "MALFORMED_MANIFEST", "MEDIUM", 0.9, "Manifest cannot be parsed",
                                    str(exc), {}, "Request a valid manifest.", ref))
                    res.check("manifest_hashes", "ERROR", str(exc))
            else:
                res.check("manifest_hashes", "SKIPPED", "no manifest.json supplied")
                _contributor_check(res, session, ds, "dataset Merkle root", ds.sha256, ds.signature, ref)

        # 2. Model at-rest integrity + contributor signature ------------------------
        if ctx.model is not None:
            m, ref = ctx.model, f"model {ctx.model.id}"
            ctx.progress(ENGINE, 0.55, "Re-hashing model file")
            cur = sha256_file(m.path) if Path(m.path).exists() else None
            if cur != m.sha256:
                res.add(Finding(ENGINE, "MODEL_MODIFIED_AT_REST", "CRITICAL", 1.0,
                                "Model file changed after registration",
                                "The stored model no longer matches the SHA-256 recorded when it was ingested.",
                                {"registered_sha256": m.sha256, "current_sha256": cur},
                                "QUARANTINE. Restore the registered copy.", ref))
            res.check("model_file_integrity", "PASSED" if cur == m.sha256 else "FLAGGED",
                      "SHA-256 matches registration" if cur == m.sha256 else "SHA-256 MISMATCH")
            _contributor_check(res, session, m, "model SHA-256", m.sha256, m.signature, ref)

        # 3. Inference provenance chain ---------------------------------------------
        ctx.progress(ENGINE, 0.7, "Verifying inference provenance chain")
        chain = verify_inference_chain(session)
        mine = [r for r in chain["records"] if ctx.model is None or r["model_asset_id"] == ctx.model.id]
        tampered = [r for r in mine if r["status"] == "TAMPERED"]
        downstream = [r for r in mine if r["status"] == "UNTRUSTED_DOWNSTREAM"]
        res.metrics["inference_chain"] = {"records_checked": len(mine), "tampered": len(tampered),
                                          "untrusted_downstream": len(downstream), "chain_valid": chain["valid"]}
        if tampered:
            res.add(Finding(ENGINE, "INFERENCE_RECORD_TAMPERED", "CRITICAL", 1.0,
                            f"{len(tampered)} inference record(s) failed verification",
                            "Stored inference results no longer match their signed, chained hashes: an output, "
                            "input or record was altered after the inference was made.",
                            {"records": tampered[:20], "first_invalid_seq": chain["first_invalid_seq"]},
                            "Treat affected results as untrustworthy; investigate database access.",
                            ctx.model.id if ctx.model else "inference-ledger"))
        elif downstream:
            res.add(Finding(ENGINE, "INFERENCE_CHAIN_COMPROMISED_UPSTREAM", "MEDIUM", 0.8,
                            f"{len(downstream)} record(s) follow a compromised point in the chain",
                            "These records verify individually, but an earlier record in the shared chain "
                            "was tampered with, so ordering guarantees no longer hold.",
                            {"first_invalid_seq": chain["first_invalid_seq"]}, "Review the chain.", "inference-ledger"))
        res.check("inference_chain", "FLAGGED" if (tampered or downstream) else "PASSED",
                  f"{len(mine)} record(s) verified")

        # 4. Audit ledger -----------------------------------------------------------
        ctx.progress(ENGINE, 0.9, "Verifying audit ledger")
        ledger = verify_chain(session)
        res.metrics["audit_ledger"] = {"valid": ledger["valid"], "length": ledger["length"],
                                       "first_invalid_index": ledger["first_invalid_index"]}
        if not ledger["valid"]:
            bad = [b for b in ledger["blocks"] if b["status"] == "TAMPERED"]
            res.add(Finding(ENGINE, "AUDIT_LEDGER_COMPROMISED", "CRITICAL", 1.0,
                            f"Audit ledger integrity failure at block #{ledger['first_invalid_index']}",
                            "The tamper-evident audit history was modified. Past assurance decisions can no "
                            "longer be relied on.", {"tampered_blocks": bad[:10]},
                            "Freeze the system and start a forensic investigation.", "audit-ledger"))
        res.check("audit_ledger", "PASSED" if ledger["valid"] else "FLAGGED",
                  f"{ledger['length']} blocks, {'valid' if ledger['valid'] else 'COMPROMISED'}")
        ctx.progress(ENGINE, 1.0, "Provenance assurance complete")
        return res
    finally:
        session.close()
