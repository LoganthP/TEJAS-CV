from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..core.events import ALL, bus
from ..database import Job, SessionLocal

router = APIRouter()
TERMINAL = {"complete", "failed"}


@router.websocket("/ws/jobs/{job_id}")
async def job_stream(ws: WebSocket, job_id: str):
    """Replays the job's event history, then streams live events until completion."""
    await ws.accept()
    q, history = bus.subscribe(job_id)
    try:
        for ev in history:
            await ws.send_json(ev)
        if any(e["type"] in TERMINAL for e in history):
            return
        if job_id.startswith(("TRAIN-", "BENCH-")):     # training / benchmark runs are not Job rows
            while True:
                ev = await q.get()
                await ws.send_json(ev)
                if ev["type"] in TERMINAL:
                    return
        with SessionLocal() as db:
            job = db.get(Job, job_id)
        if job is None:
            await ws.send_json({"type": "error", "message": "job not found"})
            return
        if job.status in ("COMPLETED", "FAILED") and not history:
            await ws.send_json({"type": "complete" if job.status == "COMPLETED" else "failed", "job_id": job_id,
                                "stage": job.status, "progress": 100, "decision": job.decision,
                                "risk_score": job.risk_score, "confidence": job.confidence})
            return
        while True:
            ev = await q.get()
            await ws.send_json(ev)
            if ev["type"] in TERMINAL:
                return
    except WebSocketDisconnect:
        pass
    finally:
        bus.unsubscribe(job_id, q)
        try:
            await ws.close()
        except RuntimeError:
            pass


@router.websocket("/ws/events")
async def all_events(ws: WebSocket):
    """Global live feed for the command-centre dashboard."""
    await ws.accept()
    q, _ = bus.subscribe(ALL)
    try:
        while True:
            await ws.send_json(await q.get())
    except WebSocketDisconnect:
        pass
    finally:
        bus.unsubscribe(ALL, q)
