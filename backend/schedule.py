import os
from typing import List, Dict, Any


def find_free_days(events: List[Dict[str, Any]], start_date: str, end_date: str) -> List[str]:
    """Return list of ISO dates between start_date and end_date (inclusive) that have no events.
    Events may have start as date or dateTime; we consider the date component.
    """
    from datetime import datetime, timedelta
    import dateutil.parser as dp

    s = datetime.fromisoformat(start_date)
    e = datetime.fromisoformat(end_date)
    total_days = (e.date() - s.date()).days + 1
    all_dates = {(s.date() + timedelta(days=i)).isoformat() for i in range(total_days)}

    busy_dates = set()
    for ev in events:
        st = ev.get("start") or ev.get("start_date") or ev.get("start_time")
        if not st:
            continue
        try:
            dt = dp.parse(st)
            busy_dates.add(dt.date().isoformat())
        except Exception:
            # if parsing fails, skip
            continue

    free = sorted(list(all_dates - busy_dates))
    return free


def fetch_events_from_google(calendarId: str, timeMin: str, timeMax: str) -> List[Dict[str, Any]]:
    """Fetch events between timeMin and timeMax using service credentials pointed by GOOGLE_CREDENTIALS_JSON env var.
    timeMin/timeMax should be RFC3339 strings (ISO with time), e.g. 2026-05-01T00:00:00Z
    Returns list of event dicts with at least 'start' and 'summary'.
    """
    from google.oauth2.service_account import Credentials as SACreds
    from googleapiclient.discovery import build

    creds_path = os.getenv("GOOGLE_CREDENTIALS_JSON")
    if not creds_path or not os.path.exists(creds_path):
        raise RuntimeError("GOOGLE_CREDENTIALS_JSON not set or file missing")

    creds = SACreds.from_service_account_file(creds_path, scopes=["https://www.googleapis.com/auth/calendar.readonly"])
    service = build("calendar", "v3", credentials=creds)

    events = []
    page_token = None
    while True:
        resp = service.events().list(calendarId=calendarId, timeMin=timeMin, timeMax=timeMax, singleEvents=True, orderBy="startTime", pageToken=page_token).execute()
        items = resp.get("items", [])
        for it in items:
            start = it.get("start", {}).get("dateTime") or it.get("start", {}).get("date")
            events.append({"start": start, "summary": it.get("summary", "(no title)")})
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return events
