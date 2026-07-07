"""Read/write the JSON files in settings/."""
import json

from fastapi import APIRouter, Body, HTTPException

from .workspace import SETTINGS_DIR

router = APIRouter(prefix="/api/settings")


@router.get("")
def all_settings():
    return {p.stem: json.loads(p.read_text()) for p in sorted(SETTINGS_DIR.glob("*.json"))}


@router.put("/{name}")
def save(name: str, data: dict = Body(...)):
    if "/" in name or name.startswith("."):
        raise HTTPException(400, "bad name")
    p = SETTINGS_DIR / f"{name}.json"
    if not p.exists():
        raise HTTPException(404, "unknown settings category")
    p.write_text(json.dumps(data, indent=4) + "\n")
    return {"ok": True}
