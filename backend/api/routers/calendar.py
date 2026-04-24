"""Butler — Calendar API router.

CRUD operations for calendar events stored as dated markdown files
with YAML frontmatter in the workspace ``calendar/`` folder.
"""

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()

_SAFE_FN = re.compile(r'^[A-Za-z0-9._-]+\.md$')


def _cal_dir():
    from ..main import WORKSPACE
    d = WORKSPACE / "calendar"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_filename(filename: str) -> Path:
    """Validate filename is a safe basename inside calendar dir."""
    if not _SAFE_FN.match(filename):
        raise HTTPException(400, "Invalid filename")
    cal = _cal_dir()
    target = (cal / filename).resolve()
    if not str(target).startswith(str(cal.resolve())):
        raise HTTPException(400, "Path traversal blocked")
    return target


def _parse_event(p: Path) -> dict:
    """Parse a calendar markdown file into a dict with frontmatter + body."""
    text = p.read_text(encoding="utf-8")
    fm = {}
    body = text

    # Extract YAML frontmatter between --- fences
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)", text, re.DOTALL)
    if m:
        try:
            fm = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            fm = {}
        body = m.group(2)

    fm["filename"] = p.name
    fm["body"] = body.strip()
    # Normalise dates to ISO strings
    for key in ("start", "end", "date"):
        val = fm.get(key)
        if isinstance(val, datetime):
            fm[key] = val.isoformat()
        elif val is not None:
            fm[key] = str(val)

    return fm


def _event_to_md(data: dict) -> str:
    """Serialize an event dict back to frontmatter markdown."""
    body = data.pop("body", "")
    data.pop("filename", None)

    # Build ordered frontmatter dict
    field_order = [
        "title", "start", "end", "date", "duration", "type", "group",
        "location", "repeat", "done", "alert", "participants",
    ]
    fm = {}
    for key in field_order:
        if key in data:
            fm[key] = data[key]

    fm_yaml = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True, default_flow_style=False).rstrip("\n")
    parts = [f"---\n{fm_yaml}\n---", ""]
    if body:
        parts.append(body)
        parts.append("")
    return "\n".join(parts)


# ─── Endpoints ───────────────────────────────────────────────


@router.get("/events")
async def list_events(
    start: Optional[str] = Query(None, description="ISO date/datetime — inclusive lower bound"),
    end: Optional[str] = Query(None, description="ISO date/datetime — exclusive upper bound"),
):
    """List calendar events, optionally filtered by date range."""
    cal = _cal_dir()

    events = []
    for p in sorted(cal.glob("*.md")):
        ev = _parse_event(p)
        # Date-range filter
        ev_start = ev.get("start") or ev.get("date")
        if ev_start and start:
            if str(ev_start) < start:
                continue
        if ev_start and end:
            if str(ev_start) >= end:
                continue
        events.append(ev)

    return {"events": events}


class EventBody(BaseModel):
    title: str
    type: str = "event"
    start: Optional[str] = None
    end: Optional[str] = None
    date: Optional[str] = None
    duration: Optional[str] = None
    group: str = "blue"
    location: Optional[str] = None
    repeat: Optional[str] = None
    done: Optional[bool] = None
    alert: Optional[list] = None
    participants: Optional[list] = None
    body: str = ""


@router.post("/events")
async def create_event(event: EventBody):
    """Create a new calendar event as a markdown file."""
    cal = _cal_dir()

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")[:18]
    filename = f"{ts}.md"
    dest = cal / filename

    data = event.model_dump()
    md = _event_to_md(data)
    dest.write_text(md, encoding="utf-8")

    return {"ok": True, "filename": filename}


@router.put("/events/{filename}")
async def update_event(filename: str, event: EventBody):
    """Update an existing calendar event."""
    target = _safe_filename(filename)
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "Event not found")

    data = event.model_dump()
    md = _event_to_md(data)
    target.write_text(md, encoding="utf-8")

    return {"ok": True, "filename": filename}


@router.delete("/events/{filename}")
async def delete_event(filename: str):
    """Delete a calendar event."""
    target = _safe_filename(filename)
    if not target.exists():
        raise HTTPException(404, "Event not found")
    target.unlink()
    return {"ok": True}


@router.get("/groups")
async def list_groups():
    """Return distinct group colors used across events."""
    cal = _cal_dir()
    groups = set()
    for p in cal.glob("*.md"):
        ev = _parse_event(p)
        g = ev.get("group")
        if g:
            groups.add(g)
    return {"groups": sorted(groups)}
