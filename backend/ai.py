import os
from typing import List, Dict, Any
import openai
from datetime import datetime
import requests

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY


def summarize_events(events: List[Dict[str, Any]]) -> str:
    """Use OpenAI to summarize a list of event dicts into a short timeline summary."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")
    # Build a concise prompt
    prompt_events = []
    for e in events:
        start = e.get("start") or e.get("start_date") or e.get("start_time")
        summary = e.get("summary") or e.get("title") or "(no title)"
        prompt_events.append(f"- {start}: {summary}")
    prompt = (
        "You are a calendar assistant. Given the following events, produce a concise timeline summary and identify any patterns or clusters in dates.\n\n"
        + "\n".join(prompt_events)
        + "\n\nProvide: 1) short timeline summary (3 sentences max). 2) any repeating patterns (weekly, monthly). 3) likely future dates when similar events may appear (list dates).")

    resp = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=400,
    )
    return resp["choices"][0]["message"]["content"].strip()


def predict_busy_days(events: List[Dict[str, Any]], months_ahead: int = 3) -> List[str]:
    """Predict likely busy dates given past events. Returns ISO dates as strings."""
    summary = summarize_events(events)
    prompt = (
        "Given the calendar summary below and the list of past events, predict specific dates over the next "
        f"{months_ahead} months that are most likely to have new events. Provide output as a JSON array of ISO-8601 dates.\n\n"
        "Summary:\n" + summary + "\n\nEvents:\n"
    )
    for e in events:
        start = e.get("start")
        summary_line = e.get("summary")
        prompt += f"- {start}: {summary_line}\n"

    resp = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=200,
    )
    text = resp["choices"][0]["message"]["content"].strip()
    # naive parse: look for JSON array in the response
    import json
    try:
        return json.loads(text)
    except Exception:
        # fallback: extract dates-looking tokens
        import re
        dates = re.findall(r"\d{4}-\d{2}-\d{2}", text)
        return dates


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


def _fetch_events_with_api_key(calendarId: str, timeMin: str, timeMax: str) -> List[Dict[str, Any]]:
    api_key = os.getenv("GOOGLE_CALENDAR_API_KEY") or os.getenv("GOOGLE_CALENDER_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_CALENDAR_API_KEY not set")

    url = f"https://www.googleapis.com/calendar/v3/calendars/{requests.utils.quote(calendarId, safe='')}/events"
    params = {
        "key": api_key,
        "timeMin": timeMin,
        "timeMax": timeMax,
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": 2500,
    }

    events: List[Dict[str, Any]] = []
    page_token: str | None = None
    while True:
        query = dict(params)
        if page_token:
            query["pageToken"] = page_token
        response = requests.get(url, params=query, timeout=30)
        if response.status_code != 200:
            raise RuntimeError(f"Google Calendar API error {response.status_code}: {response.text}")
        data = response.json()
        for item in data.get("items", []):
            start = (item.get("start") or {}).get("dateTime") or (item.get("start") or {}).get("date")
            events.append({"start": start, "summary": item.get("summary", "(no title)")})
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return events


def fetch_events_from_google(calendarId: str, timeMin: str, timeMax: str, credentials=None) -> List[Dict[str, Any]]:
    """Fetch events between timeMin and timeMax using OAuth credentials or a public API key.
    timeMin/timeMax should be RFC3339 strings (ISO with time), e.g. 2026-05-01T00:00:00Z
    Returns list of event dicts with at least 'start' and 'summary'.
    """
    from googleapiclient.discovery import build
    if credentials is not None:
        service = build("calendar", "v3", credentials=credentials)

        events: List[Dict[str, Any]] = []
        page_token = None
        while True:
            resp = service.events().list(
                calendarId=calendarId,
                timeMin=timeMin,
                timeMax=timeMax,
                singleEvents=True,
                orderBy="startTime",
                pageToken=page_token,
            ).execute()
            for item in resp.get("items", []):
                start = (item.get("start") or {}).get("dateTime") or (item.get("start") or {}).get("date")
                events.append({"start": start, "summary": item.get("summary", "(no title)")})
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return events

    return _fetch_events_with_api_key(calendarId, timeMin, timeMax)
