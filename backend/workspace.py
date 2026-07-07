"""Workspace root resolution, path safety, sample bootstrap."""
import json
import os
import shutil
from pathlib import Path

from fastapi import HTTPException

REPO_ROOT = Path(__file__).resolve().parent.parent
SETTINGS_DIR = REPO_ROOT / "settings"
PLUGINS_DIR = REPO_ROOT / "plugins"


def root() -> Path:
    user = json.loads((SETTINGS_DIR / "user.json").read_text())
    location = user["workspace"][0]["location"]
    return Path(os.path.expandvars(location)).expanduser()


def safe_path(rel: str) -> Path:
    """Resolve a workspace-relative path, rejecting escapes."""
    p = (root() / rel.lstrip("/")).resolve()
    if not p.is_relative_to(root().resolve()):
        raise HTTPException(400, "path outside workspace")
    return p


def bootstrap() -> None:
    """Create the workspace from plugin sample folders if it doesn't exist."""
    ws = root()
    if ws.exists():
        return
    ws.mkdir(parents=True)
    for plugin in sorted(PLUGINS_DIR.iterdir()):
        for sample in ("sample", "samples"):
            src = plugin / sample
            if src.is_dir():
                shutil.copytree(src, ws / plugin.name)
