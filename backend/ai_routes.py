from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from .ai import summarize_events, predict_busy_days, find_free_days, fetch_events_from_google
from .auth import get_db
from sqlalchemy.orm import Session

router = APIRouter()


@router.post("/summarize")
def summarize(payload: Dict[str, Any]):
    events = payload.get("events")
    if not events:
        raise HTTPException(status_code=400, detail="events required")
    return {"summary": summarize_events(events)}


@router.post("/predict")
def predict(payload: Dict[str, Any]):
    events = payload.get("events")
    months = payload.get("months", 3)
    if not events:
        raise HTTPException(status_code=400, detail="events required")
    return {"dates": predict_busy_days(events, months)}


@router.post("/free-days")
def free_days(payload: Dict[str, Any]):
    events = payload.get("events")
    start = payload.get("start")
    end = payload.get("end")
    if not start or not end:
        raise HTTPException(status_code=400, detail="start and end required")
    return {"free_days": find_free_days(events or [], start, end)}


@router.get("/google/fetch")
def google_fetch(calendarId: str, timeMin: str, timeMax: str):
    events = fetch_events_from_google(calendarId, timeMin, timeMax)
    return {"events": events}
