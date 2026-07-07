"""Calendar: frontmatter-driven entries (YYYYMMDD-n.md) with repeat expansion."""
import json
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import frontmatter, workspace

router = APIRouter(prefix="/api/calendar")


def _dir():
    d = workspace.root() / "calendar"
    d.mkdir(exist_ok=True)
    return d


def _parse_ts(v) -> datetime | None:
    if not v or v == "None":
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    # naive timestamps are UTC by convention (plugins/README.md)
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _shift(dt: datetime, repeat: str, n: int) -> datetime:
    if repeat == "daily":
        return dt + timedelta(days=n)
    if repeat == "weekly":
        return dt + timedelta(weeks=n)
    if repeat == "monthly":
        m = dt.month - 1 + n
        try:
            return dt.replace(year=dt.year + m // 12, month=m % 12 + 1)
        except ValueError:
            return dt.replace(year=dt.year + m // 12, month=m % 12 + 1, day=28)
    if repeat == "yearly":
        return dt.replace(year=dt.year + n)
    return dt


@router.get("/entries")
def entries(start: str, end: str):
    """All entry occurrences overlapping [start, end), repeats expanded."""
    lo, hi = _parse_ts(start), _parse_ts(end)
    if not lo or not hi:
        raise HTTPException(400, "bad start/end")
    out = []
    for p in sorted(_dir().glob("*.md")):
        meta, body = frontmatter.parse(p.read_text())
        s = _parse_ts(meta.get("start") or meta.get("date"))
        if not s:
            continue
        e = _parse_ts(meta.get("end")) or s + timedelta(hours=1)
        repeat = str(meta.get("repeat") or "").lower()
        base = {
            "path": f"calendar/{p.name}",
            "title": meta.get("title", p.stem),
            "type": meta.get("type", "event"),
            "group": meta.get("group") or "blue",
            "location": None if meta.get("location") in (None, "None") else meta.get("location"),
            "participants": meta.get("participants") if isinstance(meta.get("participants"), list) else [],
            "repeat": repeat or None,
            "done": meta.get("done") if isinstance(meta.get("done"), bool) else None,
            "body": body.strip(),
        }
        if repeat in ("daily", "weekly", "monthly", "yearly"):
            n = 0
            while True:
                s_n, e_n = _shift(s, repeat, n), _shift(e, repeat, n)
                if s_n >= hi:
                    break
                if e_n > lo:
                    out.append({**base, "start": _iso(s_n), "end": _iso(e_n), "occurrence": n})
                n += 1
                if n > 1000:  # ponytail: hard stop against runaway ranges
                    break
        elif e > lo and s < hi:
            out.append({**base, "start": _iso(s), "end": _iso(e), "occurrence": 0})
    return sorted(out, key=lambda x: x["start"])


class Entry(BaseModel):
    title: str
    type: str = "event"
    start: str
    end: str
    group: str = "blue"
    location: str | None = None
    repeat: str | None = None
    participants: list[str] = []
    body: str = ""
    path: str | None = None  # set -> update existing file


@router.post("/entries")
def save(entry: Entry):
    s = _parse_ts(entry.start)
    if not s:
        raise HTTPException(400, "bad start time")
    meta = {"title": entry.title}
    if entry.type == "task":
        meta["date"] = _iso(s)
    else:
        meta["start"] = _iso(s)
    meta.update({
        "end": _iso(_parse_ts(entry.end) or s + timedelta(hours=1)),
        "type": entry.type,
        "group": entry.group,
        "location": entry.location,
        "repeat": entry.repeat,
        "done": False if entry.type == "task" else None,
        "participants": entry.participants or None,
    })
    if entry.path:
        p = workspace.safe_path(entry.path)
        if not p.is_file():
            raise HTTPException(404, "entry not found")
        old_meta, _ = frontmatter.parse(p.read_text())
        if isinstance(old_meta.get("done"), bool):
            meta["done"] = old_meta["done"]
    else:
        day = s.strftime("%Y%m%d")
        used = {int(m[1]) for f in _dir().glob(f"{day}-*.md")
                if (m := re.match(rf"{day}-(\d+)\.md", f.name))}
        n = next(i for i in range(1, 1000) if i not in used)
        p = _dir() / f"{day}-{n}.md"
    p.write_text(frontmatter.dump(meta, entry.body.strip() + "\n"))
    return {"path": f"calendar/{p.name}"}


class Done(BaseModel):
    path: str
    done: bool


@router.put("/done")
def set_done(d: Done):
    p = workspace.safe_path(d.path)
    if not p.is_file():
        raise HTTPException(404, "entry not found")
    meta, body = frontmatter.parse(p.read_text())
    meta["done"] = d.done
    p.write_text(frontmatter.dump(meta, body))
    return {"ok": True}


# group color labels (double-click a group in the filter dropdown to describe it)
@router.get("/groups")
def groups():
    f = _dir() / "groups.json"
    return json.loads(f.read_text()) if f.exists() else {}


@router.put("/groups")
def save_groups(labels: dict):
    (_dir() / "groups.json").write_text(json.dumps(labels, indent=2))
    return {"ok": True}
