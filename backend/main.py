from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from .auth import get_password_hash, verify_password, create_access_token, get_current_user, get_db
from .models import User


from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, UploadFile, File
import os
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="AI Schedule Manage - Backend")

# Add session middleware for OAuth callback state if needed
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=os.getenv('SESSION_SECRET', 'dev-session-secret'))

# include google routes
from .google_auth import router as google_router
app.include_router(google_router, prefix="/google")

# include ai routes
from .ai_routes import router as ai_router
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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: Optional[str]

    class Config:
        orm_mode = True

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
    hashed = get_password_hash(req.password)
    user = User(email=req.email, hashed_password=hashed)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
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

@app.on_event("startup")
async def on_startup():
    # startup tasks like DB connection would go here
    from .db import init_db
    init_db()
    write_log("startup")

@app.on_event("shutdown")
async def on_shutdown():
    write_log("shutdown")

@app.get("/", tags=["health"])
async def read_root():
            return {"status": "ok", "service": "AI Schedule Manage"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)