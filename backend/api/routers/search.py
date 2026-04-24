"""Search router – full-text search across workspace markdown files."""

import os
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()


def _workspace() -> Path:
    from ..main import WORKSPACE
    return WORKSPACE


@router.get("")
async def search_files(
    q: str = Query(..., min_length=1, description="Search query"),
    path: Optional[str] = Query(None, description="Subdirectory to scope search"),
    max_results: int = Query(200, ge=1, le=1000),
):
    """Search markdown files for *q* and return matches with context."""
    ws = _workspace()
    search_root = ws
    if path:
        search_root = (ws / path).resolve()
        try:
            search_root.relative_to(ws)
        except ValueError:
            raise HTTPException(403, "Path escapes workspace")

    if not search_root.is_dir():
        raise HTTPException(404, "Search directory not found")

    results: list[dict] = []

    # Try ripgrep first (fast), fall back to Python
    rg = _try_ripgrep(q, search_root, ws, max_results)
    if rg is not None:
        return {"query": q, "results": rg}

    # Python fallback – walk markdown files
    for root, _dirs, filenames in os.walk(search_root):
        # Skip hidden directories
        _dirs[:] = [d for d in _dirs if not d.startswith(".")]
        for fname in filenames:
            if not fname.lower().endswith(".md"):
                continue
            fpath = Path(root) / fname
            try:
                lines = fpath.read_text(encoding="utf-8", errors="replace").splitlines()
            except Exception:
                continue
            for i, line in enumerate(lines):
                if q.lower() in line.lower():
                    ctx_before = lines[i - 1] if i > 0 else ""
                    ctx_after = lines[i + 1] if i < len(lines) - 1 else ""
                    results.append({
                        "file": str(fpath.relative_to(ws).as_posix()),
                        "line": i + 1,
                        "text": line,
                        "context_before": ctx_before,
                        "context_after": ctx_after,
                    })
                    if len(results) >= max_results:
                        return {"query": q, "results": results}

    return {"query": q, "results": results}


def _try_ripgrep(q: str, search_root: Path, ws: Path, limit: int) -> Optional[list[dict]]:
    """Try to use ``rg`` (ripgrep) for fast searching."""
    try:
        proc = subprocess.run(
            ["rg", "--json", "--max-count", "5", "-i", "--glob", "*.md", q, str(search_root)],
            capture_output=True, text=True, timeout=15,
        )
    except FileNotFoundError:
        return None
    except Exception:
        return None

    import json as _json
    results: list[dict] = []
    for raw_line in proc.stdout.splitlines():
        try:
            obj = _json.loads(raw_line)
        except Exception:
            continue
        if obj.get("type") != "match":
            continue
        data = obj["data"]
        fpath = Path(data["path"]["text"])
        try:
            rel = fpath.relative_to(ws).as_posix()
        except ValueError:
            rel = fpath.name
        line_number = data["line_number"]
        text = data["lines"]["text"].rstrip("\n")
        results.append({
            "file": rel,
            "line": line_number,
            "text": text,
            "context_before": "",
            "context_after": "",
        })
        if len(results) >= limit:
            break

    # If rg found nothing but ran fine, return empty list
    if proc.returncode in (0, 1):
        return results
    return None
