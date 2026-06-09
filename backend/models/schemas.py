from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict


# ── Schedule ────────────────────────────────────────────────────────────

class ScheduleIn(BaseModel):
    start: str
    end: str
    title: str
    description: Optional[str] = None
    category: Optional[str] = "appointment"


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    start: str
    end: str
    title: str
    description: Optional[str]
    category: str
    created_at: Optional[str]


# ── Auth ────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: Optional[datetime]
