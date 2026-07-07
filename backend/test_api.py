"""Butler API smoke tests: .venv/bin/pytest backend/test_api.py"""
from fastapi.testclient import TestClient

from backend import frontmatter
from backend.app import app

c = TestClient(app)


def test_frontmatter_roundtrip():
    meta, body = frontmatter.parse("---\ntitle: hi\nn: 3\n---\n\nbody text\n")
    assert meta == {"title": "hi", "n": 3}
    assert body == "body text\n"
    meta2, body2 = frontmatter.parse(frontmatter.dump(meta, body))
    assert (meta2, body2) == (meta, body)
    assert frontmatter.parse("no frontmatter") == ({}, "no frontmatter")


def test_path_traversal_rejected():
    assert c.get("/api/files/read", params={"path": "../../../etc/passwd"}).status_code == 400


def test_file_roundtrip():
    path = "diary/test-roundtrip.md"
    assert c.put("/api/files/write", json={"path": path, "content": "# T\nhello"}).status_code == 200
    assert c.get("/api/files/read", params={"path": path}).json()["content"] == "# T\nhello"
    tree = c.get("/api/files/tree", params={"path": "diary"}).json()
    node = next(n for n in tree if n["path"] == path)
    assert node["title"] == "T"
    assert c.delete("/api/files", params={"path": path}).status_code == 200
    assert c.get("/api/files/read", params={"path": path}).status_code == 404


def test_search_hit_format():
    hits = c.get("/api/search", params={"q": "cherry"}).json()
    assert hits and all({"path", "line", "before", "text", "after"} <= set(h) for h in hits)
    assert any("cherry" in h["text"].lower() for h in hits)


def test_calendar_weekly_repeat():
    entries = c.get("/api/calendar/entries",
                    params={"start": "2026-04-13T00:00:00Z", "end": "2026-04-27T00:00:00Z"}).json()
    sync = [e for e in entries if e["title"] == "Project Phoenix: Weekly Sync"]
    assert [e["start"] for e in sync] == ["2026-04-18T14:00:00Z", "2026-04-25T14:00:00Z"]
    tasks = [e for e in entries if e["type"] == "task"]
    assert tasks and all(isinstance(e["done"], bool) for e in tasks)


def test_calendar_create_and_delete():
    r = c.post("/api/calendar/entries", json={
        "title": "t", "type": "task", "start": "2030-01-02T00:00", "end": "2030-01-02T23:59:59"})
    path = r.json()["path"]
    assert path.startswith("calendar/20300102-")
    got = c.get("/api/calendar/entries",
                params={"start": "2030-01-02T00:00:00Z", "end": "2030-01-03T00:00:00Z"}).json()
    assert any(e["path"] == path and e["done"] is False for e in got)
    c.put("/api/calendar/done", json={"path": path, "done": True})
    assert "done: true" in c.get("/api/files/read", params={"path": path}).json()["content"]
    c.delete("/api/files", params={"path": path})


def test_plugins_rail_order():
    names = [p["name"] for p in c.get("/api/plugins").json()]
    assert names[:3] == ["search", "files", "sync"]
    assert names[-1] == "settings"
