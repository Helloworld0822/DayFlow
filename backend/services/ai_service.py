import os
import re
import json
from typing import List, Dict, Any
from datetime import datetime, timedelta

import openai
import dateutil.parser as dp

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY


# ── Common utilities ────────────────────────────────────────────────────

def find_free_days(events: List[Dict[str, Any]], start_date: str, end_date: str) -> List[str]:
    """Return list of ISO dates between start_date and end_date (inclusive) that have no events."""
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
            continue

    return sorted(list(all_dates - busy_dates))


# ── AI functions ────────────────────────────────────────────────────────

def summarize_events(events: List[Dict[str, Any]]) -> str:
    """Use OpenAI to summarize a list of event dicts into a short timeline summary."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")

    prompt_events = []
    for e in events:
        start = e.get("start") or e.get("start_date") or e.get("start_time")
        summary = e.get("summary") or e.get("title") or "(no title)"
        prompt_events.append(f"- {start}: {summary}")

    prompt = (
        "You are a calendar assistant. Given the following events, produce a concise timeline summary "
        "and identify any patterns or clusters in dates.\n\n"
        + "\n".join(prompt_events)
        + "\n\nProvide: 1) short timeline summary (3 sentences max). "
        "2) any repeating patterns (weekly, monthly). "
        "3) likely future dates when similar events may appear (list dates)."
    )

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
        "Given the calendar summary below and the list of past events, predict specific dates "
        f"over the next {months_ahead} months that are most likely to have new events. "
        "Provide output as a JSON array of ISO-8601 dates.\n\n"
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

    try:
        return json.loads(text)
    except Exception:
        dates = re.findall(r"\d{4}-\d{2}-\d{2}", text)
        return dates
