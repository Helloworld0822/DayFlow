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


# ---------------------------------------------------------------------------
# Calendar fetching
# ---------------------------------------------------------------------------
# Strategy
# --------
# Google Calendar API has two ways to call it:
#   1. API key (key=...): only works for *public* calendars that anyone can see.
#   2. OAuth 2.0 user credentials: required for a user's *own* (private) calendars.
#
# For the "my calendar" use case, we MUST use the user's OAuth credentials
# obtained via /google/login -> /google/callback. The API key in
# GOOGLE_CALENDER_API_KEY is only used as a last-resort fallback for public
# calendars (e.g. en.korean#holiday@group.v.calendar.google.com) when no user
# credentials are available.
#
# The default calendar is read from GOOGLE_CALENDAR_ID; if not set we fall
# back to the user's primary calendar ("primary"), which only works with
# OAuth credentials.
# ---------------------------------------------------------------------------


def _to_rfc3339(value: str) -> str:
    """Make sure a date or datetime string is RFC3339 with a 'Z' suffix."""
    from datetime import datetime, timezone

    # 'YYYY-MM-DD' -> 'YYYY-MM-DDT00:00:00Z'
    try:
        if len(value) == 10 and value[4] == "-" and value[7] == "-":
            d = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            return d.strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        pass

    # Already ISO with offset/Z? Return as-is.
    return value


def _fetch_with_api_key(calendarId: str, timeMin: str, timeMax: str) -> List[Dict[str, Any]]:
    """Fallback: hit the public Calendar API with key=API_KEY (no OAuth).
    Only works for *public* calendars.
    """
    import requests

    api_key = os.getenv("GOOGLE_CALENDER_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_CALENDER_API_KEY not set")

    url = "https://www.googleapis.com/calendar/v3/calendars/{cal}/events".format(
        cal=requests.utils.quote(calendarId, safe="")
    )
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
        q = dict(params)
        if page_token:
            q["pageToken"] = page_token
        resp = requests.get(url, params=q, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(
                "Google Calendar API error {0}: {1}".format(resp.status_code, resp.text)
            )
        data = resp.json()
        for it in data.get("items", []):
            start = (it.get("start") or {}).get("dateTime") or (it.get("start") or {}).get("date")
            events.append({"start": start, "summary": it.get("summary", "(no title)")})
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
        for it in resp.get("items", []):
            start = (it.get("start") or {}).get("dateTime") or (it.get("start") or {}).get("date")
            events.append({"start": start, "summary": it.get("summary", "(no title)")})
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
      1. If `credentials` (OAuth user creds) is provided, use it. This is the
         normal case after the user logs in via /google/login. Required to
         read the user's *own* (private) calendars.
      2. Otherwise, fall back to GOOGLE_CALENDER_API_KEY. Only works for
         public calendars.
      3. As a last resort, fall back to GOOGLE_CREDENTIALS_JSON (service
         account) for backward compatibility.

    `calendarId` defaults to env GOOGLE_CALENDAR_ID, then "primary".
    `timeMin` / `timeMax` should be either 'YYYY-MM-DD' or RFC3339 strings.
    """
    if not calendarId:
        calendarId = os.getenv("GOOGLE_CALENDAR_ID", "primary")
    if not timeMin or not timeMax:
        raise ValueError("timeMin and timeMax are required")

    # 1) OAuth user credentials (preferred for private calendars)
    if credentials is not None:
        return _fetch_with_oauth(credentials, calendarId, timeMin, timeMax)

    # 2) API key fallback (public calendars only)
    if os.getenv("GOOGLE_CALENDER_API_KEY"):
        try:
            return _fetch_with_api_key(calendarId, timeMin, timeMax)
        except RuntimeError as e:
            # Most likely cause: trying to read a non-public calendar with a key.
            # Fall through to service account for backward compatibility.
            print("[schedule] API key fetch failed, falling back:", e)

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
        "set GOOGLE_CALENDER_API_KEY (public calendars only), or set "
        "GOOGLE_CREDENTIALS_JSON (service account)."
    )
