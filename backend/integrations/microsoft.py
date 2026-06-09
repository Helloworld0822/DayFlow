"""
Microsoft Graph OAuth (delegated permissions) integration.
"""
import json
import os
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

router = APIRouter()

# ── Config ──────────────────────────────────────────────────────────────

MS_TENANT_ID = os.getenv("MS_TENANT_ID", "common")
MS_CLIENT_ID = os.getenv("MS_CLIENT_ID")
MS_CLIENT_SECRET = os.getenv("MS_CLIENT_SECRET")
MS_REDIRECT_URI = os.getenv("MS_REDIRECT_URI", "http://localhost:8000/microsoft/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost/")

MS_SCOPES = [
    "offline_access",
    "User.Read",
    "Calendars.Read",
]

AUTHORIZE_URL = f"https://login.microsoftonline.com/{MS_TENANT_ID}/oauth2/v2.0/authorize"
TOKEN_URL = f"https://login.microsoftonline.com/{MS_TENANT_ID}/oauth2/v2.0/token"


# ── Helpers ─────────────────────────────────────────────────────────────

def _require_ms_config() -> None:
    if not MS_CLIENT_ID or not MS_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail=(
                "Microsoft OAuth is not configured. "
                "Set MS_CLIENT_ID and MS_CLIENT_SECRET (and MS_TENANT_ID, MS_REDIRECT_URI)."
            ),
        )


def _exchange_code_for_tokens(code: str) -> dict[str, Any]:
    resp = requests.post(
        TOKEN_URL,
        data={
            "client_id": MS_CLIENT_ID,
            "client_secret": MS_CLIENT_SECRET,
            "code": code,
            "redirect_uri": MS_REDIRECT_URI,
            "grant_type": "authorization_code",
            "scope": " ".join(MS_SCOPES),
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail=f"Microsoft token exchange failed ({resp.status_code}): {resp.text}",
        )
    return resp.json()


def _refresh_tokens(refresh_token: str) -> dict[str, Any] | None:
    resp = requests.post(
        TOKEN_URL,
        data={
            "client_id": MS_CLIENT_ID,
            "client_secret": MS_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
            "scope": " ".join(MS_SCOPES),
        },
        timeout=30,
    )
    if resp.status_code != 200:
        return None
    return resp.json()


def _load_credentials(request: Request) -> dict[str, Any] | None:
    raw = request.session.get("ms_oauth_credentials")
    if not raw:
        return None
    try:
        creds = json.loads(raw)
    except (TypeError, ValueError):
        request.session.pop("ms_oauth_credentials", None)
        return None
    if not isinstance(creds, dict) or "access_token" not in creds:
        request.session.pop("ms_oauth_credentials", None)
        return None
    return creds


def _store_credentials(request: Request, payload: dict[str, Any], *, fallback_refresh: str | None = None) -> None:
    expires_in = int(payload.get("expires_in", 3600))
    payload["expires_at"] = time.time() + expires_in - 60
    if "refresh_token" not in payload and fallback_refresh:
        payload["refresh_token"] = fallback_refresh
    request.session["ms_oauth_credentials"] = json.dumps(payload)


def _get_valid_access_token(request: Request) -> str | None:
    creds = _load_credentials(request)
    if creds is None:
        return None

    if creds.get("expires_at", 0) > time.time():
        return creds.get("access_token")

    refresh_token = creds.get("refresh_token")
    if not refresh_token:
        request.session.pop("ms_oauth_credentials", None)
        return None

    refreshed = _refresh_tokens(refresh_token)
    if refreshed is None:
        request.session.pop("ms_oauth_credentials", None)
        return None
    _store_credentials(request, refreshed, fallback_refresh=refresh_token)
    return refreshed.get("access_token")


# ── Routes ──────────────────────────────────────────────────────────────

@router.get("/microsoft/login")
def microsoft_login(request: Request):
    _require_ms_config()
    state = secrets.token_urlsafe(24)
    request.session["ms_oauth_state"] = state

    params = {
        "client_id": MS_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": MS_REDIRECT_URI,
        "response_mode": "query",
        "scope": " ".join(MS_SCOPES),
        "state": state,
    }
    return RedirectResponse(f"{AUTHORIZE_URL}?{urlencode(params)}")


@router.get("/microsoft/callback")
async def microsoft_callback(request: Request):
    _require_ms_config()
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    if error:
        return RedirectResponse(f"{FRONTEND_URL}/?microsoft_error={error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code in Microsoft callback")

    expected_state = request.session.pop("ms_oauth_state", None)
    if not state or state != expected_state:
        raise HTTPException(status_code=400, detail="Microsoft OAuth state mismatch")

    token_payload = _exchange_code_for_tokens(code)
    if "access_token" not in token_payload:
        raise HTTPException(
            status_code=400,
            detail=f"Microsoft token response missing access_token: {token_payload}",
        )
    _store_credentials(request, token_payload)
    return RedirectResponse(f"{FRONTEND_URL}/?microsoft=connected")


@router.get("/microsoft/events")
async def microsoft_events(
    request: Request,
    calendarId: str = Query(""),
    timeMin: str = Query(...),
    timeMax: str = Query(...),
):
    access_token = _get_valid_access_token(request)
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail=(
                "Microsoft OAuth session is not available. "
                "Please connect your Microsoft account via /microsoft/login."
            ),
        )

    headers = {"Authorization": f"Bearer {access_token}"}
    if not calendarId:
        url = "https://graph.microsoft.com/v1.0/me/events"
    else:
        url = f"https://graph.microsoft.com/v1.0/me/calendars/{calendarId}/events"

    params = {
        "$filter": f"start/dateTime ge '{timeMin}' and end/dateTime le '{timeMax}'",
        "$top": 100,
        "$orderby": "start/dateTime",
        "$select": "subject,start,end",
    }

    resp = requests.get(url, headers=headers, params=params, timeout=30)
    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Microsoft Graph API error: {resp.text}",
        )

    data = resp.json()
    events = []
    for item in data.get("value", []):
        start = (item.get("start") or {}).get("dateTime")
        events.append({
            "start": start,
            "summary": item.get("subject", "(no title)"),
        })
    return {"events": events}
