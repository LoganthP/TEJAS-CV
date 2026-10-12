from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.ledger import ensure_genesis
from ..database import SessionLocal, get_db
from ..orchestrator.pipeline import submit_job
from ..services import demo as D
from . import serializers as S

router = APIRouter(prefix="/api/demo", tags=["demo lab"])


@router.post("/bootstrap", summary="Generate the attack lab and register all demo assets (idempotent)")
def bootstrap(force: bool = False, db: Session = Depends(get_db)):
    st = D.bootstrap(db, force=force)
    return {k: v for k, v in st.items() if k != "contributor_private_keys"}


@router.get("/scenarios")
def scenarios():
    return D.SCENARIOS


@router.post("/scenarios/{name}", summary="Create and start a scenario job")
def run_scenario(name: str, db: Session = Depends(get_db)):
    try:
        job, extra = D.create_scenario_job(db, name)
    except KeyError as exc:
        raise HTTPException(404, f"unknown scenario; choose from {list(D.SCENARIOS)}") from exc
    submit_job(job.id)
    return {"job": S.job(job), "scenario": D.SCENARIOS[name], "websocket": f"/ws/jobs/{job.id}", **extra}


@router.post("/tamper/inference/{record_id}", summary="Attacker edits a stored inference output")
def tamper_inference(record_id: str, db: Session = Depends(get_db)):
    try:
        return D.tamper_inference(db, record_id)
    except KeyError as exc:
        raise HTTPException(404, "record not found") from exc


@router.post("/tamper/audit/{index}", summary="Attacker edits an audit block payload")
def tamper_audit(index: int, db: Session = Depends(get_db)):
    try:
        return D.tamper_audit_block(db, index)
    except KeyError as exc:
        raise HTTPException(404, "block not found (genesis cannot be targeted)") from exc


@router.post("/tamper/model-file/{asset_id}", summary="Attacker flips bytes in a stored model file")
def tamper_model(asset_id: str, db: Session = Depends(get_db)):
    try:
        return D.tamper_model_file(db, asset_id)
    except KeyError as exc:
        raise HTTPException(404, "model not found") from exc


@router.get("/tampers", summary="Records/blocks changed by the demo tamper tools (restorable)")
def demo_tampers():
    return D.list_demo_tampers()


@router.post("/restore/audit/{index}", summary="Undo a demo tamper on an audit block")
def restore_audit(index: int, db: Session = Depends(get_db)):
    try:
        return D.restore_audit_block(db, index)
    except KeyError:
        raise HTTPException(404, "this block was not changed by the demo tamper tool; only those can be restored")


@router.post("/restore/inference/{record_id}", summary="Undo a demo tamper on an inference record")
def restore_inference(record_id: str, db: Session = Depends(get_db)):
    try:
        return D.restore_inference(db, record_id)
    except KeyError:
        raise HTTPException(404, "this record was not changed by the demo tamper tool; only those can be restored")


@router.post("/reset", summary="Wipe all state (demo only)")
def reset():
    D.reset()
    with SessionLocal() as db:
        ensure_genesis(db)
    return {"reset": True}
