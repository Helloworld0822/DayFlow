from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.core.security import (
    clear_auth_cookie,
    create_access_token,
    get_current_user,
    get_db,
    get_password_hash,
    set_auth_cookie,
    verify_password,
)
from backend.models.db_models import User
from backend.models.schemas import RegisterRequest, LoginRequest, TokenResponse, UserOut

router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=201)
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


@router.post("/auth/login", response_model=UserOut)
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


@router.post("/auth/logout")
def auth_logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
def auth_me(current: User = Depends(get_current_user)):
    return current


@router.post("/login", response_model=TokenResponse)
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


@router.get("/protected", response_model=UserOut)
def protected(current: User = Depends(get_current_user)):
    return current
