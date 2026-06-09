import os
import requests
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()


def _get_access_token() -> str:
    tenant = os.getenv("MS_TENANT_ID")
    client_id = os.getenv("MS_CLIENT_ID")
    client_secret = os.getenv("MS_CLIENT_SECRET")
    if not tenant or not client_id or not client_secret:
        raise RuntimeError(
            "Microsoft Graph API not configured. Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET."
        )
    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }
    resp = requests.post(url, data=data, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"MS Graph auth error {resp.status_code}: {resp.text}")
    return resp.json()["access_token"]


def _parse_datetime(item: dict) -> str | None:
    dt = item.get("dateTime")
    if dt:
        return dt
    return item.get("date")


def fetch_events(calendar_id: str, time_min: str, time_max: str) -> List[Dict[str, Any]]:
    user = os.getenv("MS_USER_EMAIL", "me")
    token = _get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = f"https://graph.microsoft.com/v1.0/users/{user}/calendars/{calendar_id}/events"

    params: Dict[str, Any] = {
        "$filter": f"start/dateTime ge '{time_min}' and end/dateTime le '{time_max}'",
        "$top": 100,
        "$orderby": "start/dateTime",
        "$select": "subject,start,end",
    }

    resp = requests.get(url, headers=headers, params=params, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"MS Graph API error {resp.status_code}: {resp.text}")

    data = resp.json()
    events = []
    for item in data.get("value", []):
        start = _parse_datetime(item.get("start", {}))
        events.append({
            "start": start,
            "summary": item.get("subject", "(no title)"),
        })
    return events


@router.get("/microsoft/events")
async def microsoft_events(
    calendarId: str = Query(""),
    timeMin: str = Query(...),
    timeMax: str = Query(...),
):
    try:
        events = fetch_events(calendarId, timeMin, timeMax)
        return {"events": events}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
