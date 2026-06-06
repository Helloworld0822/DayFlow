from typing import Optional
from datetime import datetime
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, ConfigDict
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager

from backend.auth import (
    clear_auth_cookie,
    create_access_token,
    get_current_user,
    get_db,
    get_password_hash,
    set_auth_cookie,
    verify_password,
)
from backend.models import User


from fastapi import FastAPI, Depends, HTTPException, Response, BackgroundTasks, UploadFile, File
import os
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from backend.db import init_db, engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    write_log("startup")
    try:
        yield
    finally:
        write_log("shutdown")
        engine.dispose()


app = FastAPI(title="AI Schedule Manage - Backend", lifespan=lifespan)

# Add session middleware for OAuth callback state if needed
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=os.getenv('SESSION_SECRET', 'dev-session-secret'))

# include google routes
from backend.google_auth import router as google_router
app.include_router(google_router)

# include ai routes
from backend.ai_routes import router as ai_router
app.include_router(ai_router, prefix="/ai")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic request/response model
class Item(BaseModel):
    pass


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

# Pydantic request/response model
class Item(BaseModel):
    id: Optional[int] = None
    name: str
    description: Optional[str] = None
    priority: int = 0

# Simple in-memory store for demonstration
_db: dict[int, Item] = {}
_next_id = 1


@app.post("/register", response_model=UserOut, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    try:
        hashed = get_password_hash(req.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    user = User(email=req.email, hashed_password=hashed)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=UserOut)
def auth_login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
    try:
        valid_password = verify_password(payload.password, user.hashed_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not valid_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

    token = create_access_token(subject=str(user.id))
    set_auth_cookie(response, token, payload.remember_me)
    return user


@app.post("/auth/logout")
def auth_logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@app.get("/auth/me", response_model=UserOut)
def auth_me(current: User = Depends(get_current_user)):
    return current


@app.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
    try:
        valid_password = verify_password(form_data.password, user.hashed_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not valid_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
    token = create_access_token(subject=str(user.id))
    return {"access_token": token, "token_type": "bearer"}


@app.get("/protected", response_model=UserOut)
def protected(current: User = Depends(get_current_user)):
    return current


# Dependency example
def common_query_params(q: Optional[str] = None, limit: int = 10):
    return {"q": q, "limit": limit}

# Background task example
def write_log(message: str) -> None:
    with open("app.log", "a") as f:
        f.write(message + "\n")

@app.get("/", tags=["health"])
async def read_root():
            return {"status": "ok", "service": "AI Schedule Manage"}


# include schedules router (moved to schedules.py)
from backend.schedules import router as schedules_router
app.include_router(schedules_router, prefix="/schedules")

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)