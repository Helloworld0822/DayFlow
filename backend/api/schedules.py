from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

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
