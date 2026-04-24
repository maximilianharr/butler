"""Settings router – read and write JSON settings files."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


def _settings_dir() -> Path:
    from ..main import SETTINGS_DIR
    return SETTINGS_DIR


def _safe_category(category: str) -> Path:
    """Resolve a settings category to a JSON file, safely."""
    if "/" in category or "\\" in category or ".." in category:
        raise HTTPException(400, "Invalid category name")
    path = (_settings_dir() / f"{category}.json").resolve()
    if not str(path).startswith(str(_settings_dir().resolve())):
        raise HTTPException(403, "Path escapes settings directory")
    return path


@router.get("/categories")
async def list_categories():
    """List all available settings categories (JSON files)."""
    sd = _settings_dir()
    cats = []
    for f in sorted(sd.iterdir()):
        if f.suffix == ".json" and f.is_file():
            cats.append(f.stem)
    return {"categories": cats}


@router.get("/{category}")
async def get_settings(category: str):
    """Read a settings category."""
    path = _safe_category(category)
    if not path.exists():
        raise HTTPException(404, f"Settings category '{category}' not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(500, f"Invalid JSON in {category}.json: {exc}")
    return {"category": category, "data": data}


class UpdateBody(BaseModel):
    data: dict


@router.put("/{category}")
async def update_settings(category: str, body: UpdateBody):
    """Write/update a settings category."""
    path = _safe_category(category)
    tmp = path.with_suffix(".json.tmp")
    try:
        tmp.write_text(
            json.dumps(body.data, indent=4, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        tmp.replace(path)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        raise HTTPException(500, str(exc))
    return {"ok": True, "category": category}
