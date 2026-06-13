from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from backend.core.security import get_db
from backend.models.db_models import Schedule as ScheduleModel, CategoryEnum
from backend.models.schemas import ScheduleIn, ScheduleOut

router = APIRouter()


@router.get("/", response_model=list[ScheduleOut])
def list_schedules(db: Session = Depends(get_db)):
    items = db.query(ScheduleModel).order_by(ScheduleModel.start).all()
    return items


@router.post("/", response_model=ScheduleOut, status_code=201)
def create_schedule(item: ScheduleIn, db: Session = Depends(get_db)):
    try:
        start_dt = datetime.fromisoformat(item.start)
        end_dt = datetime.fromisoformat(item.end)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid datetime format; use ISO local datetime")
    if end_dt <= start_dt:
        raise HTTPException(status_code=400, detail="end must be after start")
    cat = item.category if item.category in CategoryEnum.__members__ else "appointment"
    db_item = ScheduleModel(
        start=start_dt, end=end_dt, title=item.title, description=item.description, category=cat
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{schedule_id}", response_model=ScheduleOut)
def update_schedule(schedule_id: int, item: ScheduleIn, db: Session = Depends(get_db)):
    db_item = db.query(ScheduleModel).filter(ScheduleModel.id == schedule_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Schedule not found")
    try:
        start_dt = datetime.fromisoformat(item.start)
        end_dt = datetime.fromisoformat(item.end)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid datetime format; use ISO local datetime")
    if end_dt <= start_dt:
        raise HTTPException(status_code=400, detail="end must be after start")
    cat = item.category if item.category in CategoryEnum.__members__ else "appointment"
    db_item.start = start_dt
    db_item.end = end_dt
    db_item.title = item.title
    db_item.description = item.description
    db_item.category = cat
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    db_item = db.query(ScheduleModel).filter(ScheduleModel.id == schedule_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(db_item)
    db.commit()
    return None
