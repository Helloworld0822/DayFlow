from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(256), unique=True, nullable=False, index=True)
    hashed_password = Column(String(512), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
