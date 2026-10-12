from __future__ import annotations

from sqlalchemy.orm import Session

from ..core.events import bus
from ..database import Asset, Baseline, Job, TrustedModel


class JobError(Exception):
    pass


def create_job(session: Session, dataset_id=None, model_id=None, baseline_id=None, trusted_model=None,
               label=None, created_by=None) -> Job:
    from ..core.actor import current_actor
    if not dataset_id and not model_id:
        raise JobError("provide dataset_id and/or model_id")
    for aid, kind in ((dataset_id, "dataset"), (model_id, "model")):
        if aid:
            a = session.get(Asset, aid)
            if a is None or a.asset_type != kind:
                raise JobError(f"{kind} '{aid}' not found")
    if baseline_id and session.get(Baseline, baseline_id) is None:
        raise JobError(f"baseline '{baseline_id}' not found")
    if trusted_model and session.query(TrustedModel).filter_by(name=trusted_model).first() is None:
        raise JobError(f"trusted model '{trusted_model}' not registered")
    creator = created_by or current_actor()
    job = Job(dataset_id=dataset_id, model_id=model_id, baseline_id=baseline_id,
              trusted_model=trusted_model, label=label, created_by=creator)
    session.add(job)
    session.commit()
    bus.publish(job.id, "queued", stage="QUEUED", progress=0, message="Job queued", label=label)
    return job
