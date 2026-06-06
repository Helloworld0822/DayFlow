import os
import json
from pathlib import Path
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse
from fastapi import status
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from .auth import get_db
from sqlalchemy.orm import Session

router = APIRouter()

# Scopes for read-only calendar access
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

# OAuth client secrets file for user login flow
BASE_DIR = Path(__file__).resolve().parent
GOOGLE_OAUTH_CLIENT_SECRETS_FILE = os.getenv(
    "GOOGLE_OAUTH_CLIENT_SECRETS_FILE",
    os.getenv(
        "GOOGLE_CLIENT_SECRETS_FILE",
        str(BASE_DIR / "secrets" / "client_secret.json"),
    ),
)
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/google/callback")


def _load_oauth_flow() -> Flow:
    return Flow.from_client_secrets_file(
        GOOGLE_OAUTH_CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )


def get_google_credentials_from_session(request: Request) -> Credentials | None:
    raw = request.session.get("google_oauth_credentials")
    if not raw:
        return None
    return Credentials.from_authorized_user_info(json.loads(raw), SCOPES)


@router.get("/google/login")
def google_login(request: Request):
    flow = _load_oauth_flow()
    auth_url, _ = flow.authorization_url(access_type="offline", include_granted_scopes="true")
    return RedirectResponse(auth_url)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing code in callback")
    flow = _load_oauth_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials
    request.session["google_oauth_credentials"] = creds.to_json()

    # Use Calendar API to list calendars
    service = build("calendar", "v3", credentials=creds)
    calendars = service.calendarList().list().execute()

    # return a simple JSON of calendars
    items = calendars.get("items", [])
    simplified = [{"id": c.get("id"), "summary": c.get("summary")} for c in items]
    return {"calendars": simplified}


@router.get("/google/events")
async def google_events(request: Request, calendarId: str, db: Session = Depends(get_db)):
    creds = get_google_credentials_from_session(request)
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google OAuth session is not available",
        )
    service = build("calendar", "v3", credentials=creds)
    events = service.events().list(calendarId=calendarId, maxResults=50).execute()
    return {"events": events.get("items", [])}
