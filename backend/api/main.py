"""Butler – FastAPI backend.

Serves the REST API for all plugins and mounts the frontend
static files so a single ``uvicorn`` process is enough during
development (no Nginx required).
"""

import json
import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routers import files, search, settings, sync

# ---------------------------------------------------------------------------
# Workspace resolution
# ---------------------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parents[2]          # …/butler
SETTINGS_DIR = ROOT_DIR / "settings"
FRONTEND_DIR = ROOT_DIR / "frontend"
PLUGINS_DIR = ROOT_DIR / "plugins"


def resolve_workspace() -> Path:
    """Return the workspace directory from ``settings/user.json``."""
    try:
        user_cfg = SETTINGS_DIR / "user.json"
        if user_cfg.exists():
            data = json.loads(user_cfg.read_text(encoding="utf-8"))
            locations = data.get("workspace", [])
            if locations:
                raw = locations[0].get("location", "")
                expanded = os.path.expandvars(raw)
                return Path(expanded).expanduser().resolve()
    except Exception:
        pass
    # Fallback: <butler>/content
    return (ROOT_DIR / "content").resolve()


# Expose as module-level so routers can import it.
WORKSPACE: Path = resolve_workspace()

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure the workspace directory exists on startup."""
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="Butler",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API routers -----------------------------------------------------------
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])

# --- Plugin metadata -------------------------------------------------------

@app.get("/api/plugins")
async def list_plugins():
    """Return the list of available plugins with their enabled state."""
    plugins_cfg = SETTINGS_DIR / "plugins.json"
    enabled: dict[str, bool] = {}
    if plugins_cfg.exists():
        data = json.loads(plugins_cfg.read_text(encoding="utf-8"))
        for entry in data.get("plugins", []):
            for name, state in entry.items():
                enabled[name] = state

    result = []
    for child in sorted(PLUGINS_DIR.iterdir()):
        if child.is_dir() and not child.name.startswith("."):
            icon_path = child / "icon.svg"
            result.append({
                "name": child.name,
                "enabled": enabled.get(child.name, False),
                "has_icon": icon_path.exists(),
            })
    return result


@app.get("/api/plugins/{name}/icon")
async def plugin_icon(name: str):
    """Return the SVG icon content for a plugin."""
    from fastapi.responses import Response

    icon = PLUGINS_DIR / name / "icon.svg"
    if not icon.exists():
        return Response(status_code=404)
    return Response(
        content=icon.read_bytes(),
        media_type="image/svg+xml",
    )


# --- Static files (frontend) – must be last --------------------------------
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
