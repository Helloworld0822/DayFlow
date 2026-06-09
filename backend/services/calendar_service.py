import os
from typing import List, Dict, Any
from datetime import datetime, timezone

import requests


def _to_rfc3339(value: str) -> str:
    """Make sure a date or datetime string is RFC3339 with a 'Z' suffix."""
    try:
        if len(value) == 10 and value[4] == "-" and value[7] == "-":
            d = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            return d.strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        pass
    return value


def _fetch_with_api_key(calendarId: str, timeMin: str, timeMax: str) -> List[Dict[str, Any]]:
    """Fallback: hit the public Calendar API with key=API_KEY (no OAuth).
    Only works for *public* calendars.
    """
    api_key = os.getenv("GOOGLE_CALENDAR_API_KEY") or os.getenv("GOOGLE_CALENDER_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_CALENDAR_API_KEY not set")

    url = f"https://www.googleapis.com/calendar/v3/calendars/{requests.utils.quote(calendarId, safe='')}/events"
    params = {
        "key": api_key,
        "timeMin": _to_rfc3339(timeMin),
        "timeMax": _to_rfc3339(timeMax),
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": 2500,
    }

    events: List[Dict[str, Any]] = []
    page_token = None
    while True:
        query = dict(params)
        if page_token:
            query["pageToken"] = page_token
        resp = requests.get(url, params=query, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"Google Calendar API error {resp.status_code}: {resp.text}")
        data = resp.json()
        for item in data.get("items", []):
            start = (item.get("start") or {}).get("dateTime") or (item.get("start") or {}).get("date")
            events.append({"start": start, "summary": item.get("summary", "(no title)")})
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return events


def _fetch_with_oauth(credentials, calendarId: str, timeMin: str, timeMax: str) -> List[Dict[str, Any]]:
    """Preferred path: use the user's OAuth credentials."""
    from googleapiclient.discovery import build

    service = build("calendar", "v3", credentials=credentials)
    events: List[Dict[str, Any]] = []
    page_token = None
    while True:
        resp = (
            service.events()
            .list(
                calendarId=calendarId,
                timeMin=_to_rfc3339(timeMin),
                timeMax=_to_rfc3339(timeMax),
                singleEvents=True,
                orderBy="startTime",
                pageToken=page_token,
                maxResults=2500,
            )
            .execute()
        )
        for item in resp.get("items", []):
            start = (item.get("start") or {}).get("dateTime") or (item.get("start") or {}).get("date")
            events.append({"start": start, "summary": item.get("summary", "(no title)")})
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return events


def fetch_events_from_google(
    calendarId: str = None,
    timeMin: str = None,
    timeMax: str = None,
    credentials=None,
) -> List[Dict[str, Any]]:
    """Fetch events between timeMin and timeMax.

    Resolution order:
      1. If `credentials` (OAuth user creds) is provided, use it.
      2. Otherwise, fall back to GOOGLE_CALENDAR_API_KEY (public calendars only).
      3. As a last resort, fall back to GOOGLE_CREDENTIALS_JSON (service account).
    """
    if not calendarId:
        calendarId = os.getenv("GOOGLE_CALENDAR_ID", "primary")
    if not timeMin or not timeMax:
        raise ValueError("timeMin and timeMax are required")

    # 1) OAuth user credentials (preferred)
    if credentials is not None:
        return _fetch_with_oauth(credentials, calendarId, timeMin, timeMax)

    # 2) API key fallback (public calendars only)
    if os.getenv("GOOGLE_CALENDAR_API_KEY") or os.getenv("GOOGLE_CALENDER_API_KEY"):
        try:
            return _fetch_with_api_key(calendarId, timeMin, timeMax)
        except RuntimeError as e:
            print("[calendar_service] API key fetch failed, falling back:", e)

    # 3) Service account fallback (legacy)
    creds_path = os.getenv("GOOGLE_CREDENTIALS_JSON")
    if creds_path and os.path.exists(creds_path):
        from google.oauth2.service_account import Credentials as SACreds

        creds = SACreds.from_service_account_file(
            creds_path, scopes=["https://www.googleapis.com/auth/calendar.readonly"]
        )
        return _fetch_with_oauth(creds, calendarId, timeMin, timeMax)

    raise RuntimeError(
        "No Google credentials available. Either pass OAuth user credentials, "
        "set GOOGLE_CALENDAR_API_KEY (public calendars only), or set "
        "GOOGLE_CREDENTIALS_JSON (service account)."
    )
