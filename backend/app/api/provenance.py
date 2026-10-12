from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.ledger import verify_chain
from ..database import Asset, AuditBlock, InferenceRecord, get_db
from ..services.inference import attest, run_inference, verify_inference_chain
from . import serializers as S

router = APIRouter(prefix="/api", tags=["provenance"])


@router.post("/inference", summary="Run a model and create a signed, chained provenance record")
def infer(model_id: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db)):
    m = db.get(Asset, model_id)
    if not m or m.asset_type != "model":
        raise HTTPException(404, "model not found")
    try:
        return S.inference(run_inference(db, m, file.file.read(), file.filename or "input"))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/inference")
def list_inference(model_id: Optional[str] = None, limit: int = 100, db: Session = Depends(get_db)):
    q = db.query(InferenceRecord)
    if model_id:
        q = q.filter_by(model_asset_id=model_id)
    return [S.inference(r) for r in q.order_by(InferenceRecord.seq.desc()).limit(limit)]


@router.get("/inference/{record_id}")
def get_inference(record_id: str, db: Session = Depends(get_db)):
    r = db.get(InferenceRecord, record_id)
    if not r:
        raise HTTPException(404, "record not found")
    return S.inference(r)


@router.post("/inference/verify-chain")
def verify_inference(db: Session = Depends(get_db)):
    return verify_inference_chain(db)


class AttestIn(BaseModel):
    record: dict[str, Any]
    max_age_seconds: Optional[float] = None


@router.post("/inference/attest", summary="Verify a presented record (forgery, tampering, staleness, replay)")
def attest_record(body: AttestIn, db: Session = Depends(get_db)):
    return attest(db, body.record, body.max_age_seconds)


@router.get("/audit", tags=["audit"])
def audit_blocks(offset: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    q = db.query(AuditBlock).order_by(AuditBlock.index)
    return {"total": q.count(), "items": [
        {"index": b.index, "timestamp": b.timestamp, "event_type": b.event_type, "subject": b.subject,
         "payload": b.payload, "payload_hash": b.payload_hash, "merkle_root": b.merkle_root,
         "leaf_count": b.leaf_count, "previous_hash": b.previous_hash, "block_hash": b.block_hash,
         "signature": b.signature} for b in q.offset(offset).limit(min(limit, 1000))]}


@router.post("/audit/verify", tags=["audit"])
def audit_verify(db: Session = Depends(get_db)):
    return verify_chain(db)
