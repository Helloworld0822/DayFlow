from typing import Optional
from pydantic import BaseModel, ConfigDict


class ScheduleIn(BaseModel):
    start: str
    end: str
    title: str
    description: Optional[str] = None
    category: Optional[str] = 'appointment'


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    start: str
    end: str
    title: str
    description: Optional[str]
    category: str
    created_at: Optional[str]
