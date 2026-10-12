from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..services.ingestion import IngestionError, register_dataset
from . import serializers as S
from .assets import _record_rejection

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


@router.get("/test-packs", summary="List dataset cases available in local test packs")
def list_test_packs() -> list[dict[str, Any]]:
    packs_dir = settings.home / "test_packs"
    if not packs_dir.exists():
        return []

    items = []
    for scale_dir in sorted(packs_dir.iterdir()):
        if not scale_dir.is_dir():
            continue
        scale = scale_dir.name
        expected_file = scale_dir / "expected.json"
        if not expected_file.exists():
            continue
        try:
            data = json.loads(expected_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        images_per_dataset = data.get("images_per_dataset", 0)
        cases = data.get("cases", [])
        for c in cases:
            if c.get("kind") == "dataset":
                c_name = c.get("name", "")
                c_id = c.get("id", "")
                zp = scale_dir / "datasets" / f"{c_name}.zip"
                exp = c.get("expected")
                if isinstance(exp, list) and len(exp) == 1:
                    exp_val = exp[0]
                else:
                    exp_val = exp

                items.append({
                    "scale": scale,
                    "id": c_id,
                    "name": c_name,
                    "expected": exp_val,
                    "why": c.get("why", ""),
                    "images": c.get("images", images_per_dataset),
                    "zip_exists": zp.exists(),
                })
    return items


@router.post("/test-packs/{scale}/{case_id}/ingest", summary="Ingest a test-pack dataset case")
def ingest_test_pack_case(scale: str, case_id: str, request: Request, db: Session = Depends(get_db)):
    packs_dir = settings.home / "test_packs" / scale
    expected_file = packs_dir / "expected.json"
    if not expected_file.exists():
        raise HTTPException(404, f"test pack '{scale}' not found")

    try:
        data = json.loads(expected_file.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(500, f"failed to read expected.json: {exc}")

    matched_case = None
    for c in data.get("cases", []):
        if c.get("id") == case_id or c.get("name") == case_id:
            matched_case = c
            break

    if not matched_case:
        raise HTTPException(404, f"case '{case_id}' not found in test pack '{scale}'")

    c_name = matched_case.get("name", "")
    zp = packs_dir / "datasets" / f"{c_name}.zip"
    if not zp.exists():
        raise HTTPException(404, f"zip for case '{case_id}' not found at {zp}")

    from ..core.actor import current_actor
    user = (request.scope.get("state") or {}).get("user")
    actor_username = user.get("username") if user else current_actor()

    ds_name = f"[pack {scale}] {c_name}"
    contributor = matched_case.get("contributor") or "lab-alpha"

    try:
        asset = register_dataset(db, zp, ds_name, contributor, uploaded_by=actor_username)
        meta = dict(asset.meta or {})
        meta.update({
            "source": f"test_pack_{scale}",
            "test_pack_case": matched_case.get("id"),
            "expected_verdict": matched_case.get("expected"),
            "why": matched_case.get("why"),
        })
        asset.meta = meta
        db.commit()
        return S.asset(asset)
    except IngestionError as exc:
        _record_rejection(db, "dataset", zp.name, zp, str(exc))
        raise HTTPException(400, f"REJECTED at ingestion: {exc}") from exc
