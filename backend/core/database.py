from pathlib import Path
import os
from urllib.parse import urlparse, urlunparse

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

base_dir = Path(__file__).resolve().parent.parent  # backend/
load_dotenv(base_dir / ".env", override=False)
load_dotenv(base_dir.parent / ".env", override=False)


def _running_in_docker() -> bool:
    return Path("/.dockerenv").exists() or os.getenv("RUNNING_IN_DOCKER") == "1"


def _resolve_database_url() -> str:
    raw_url = os.getenv("DATABASE_URL")
    if not raw_url:
        return "sqlite:///./dev.db"

    parsed = urlparse(raw_url)
    if parsed.scheme.startswith("postgresql") and parsed.hostname == "db" and not _running_in_docker():
        return "sqlite:///./dev.db"

    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)

    if raw_url.startswith("postgresql+psycopg://"):
        return raw_url

    return urlunparse(parsed) if parsed.scheme else raw_url


DATABASE_URL = _resolve_database_url()

engine_kwargs = {"echo": False, "future": True}
if DATABASE_URL.startswith("postgresql"):
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["connect_args"] = {"connect_timeout": 5}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def init_db():
    Base.metadata.create_all(bind=engine)
