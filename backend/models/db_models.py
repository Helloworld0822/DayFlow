from sqlalchemy import Column, Integer, String, DateTime, Enum
from sqlalchemy.sql import func
import enum

from backend.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(256), unique=True, nullable=False, index=True)
    hashed_password = Column(String(512), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CategoryEnum(str, enum.Enum):
    appointment = "appointment"
    competition = "competition"
    schedule = "schedule"


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    start = Column(DateTime(timezone=True), nullable=False)
    end = Column(DateTime(timezone=True), nullable=False)
    title = Column(String(256), nullable=False)
    description = Column(String(1024), nullable=True)
    category = Column(Enum(CategoryEnum), nullable=False, default=CategoryEnum.appointment)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
