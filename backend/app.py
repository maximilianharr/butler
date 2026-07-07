"""Butler backend: core APIs + plugin auto-discovery + static frontend."""
import importlib.util
import json

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import files, search, settings_api, workspace
from .workspace import PLUGINS_DIR, REPO_ROOT, SETTINGS_DIR

workspace.bootstrap()

app = FastAPI(title="Butler")
app.include_router(files.router)
app.include_router(search.router)
app.include_router(settings_api.router)

# plugins own their endpoints: any plugins/<name>/api.py exposing `router` is mounted
for api_file in sorted(PLUGINS_DIR.glob("*/api.py")):
    spec = importlib.util.spec_from_file_location(f"plugins.{api_file.parent.name}.api", api_file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    app.include_router(mod.router)

BASE_ORDER = ["search", "files", "sync"]  # settings always last (frontend/README.md)


@app.get("/api/plugins")
def plugins():
    """Rail order: search, files, sync, other enabled plugins, settings."""
    cfg = json.loads((SETTINGS_DIR / "plugins.json").read_text())
    enabled = {k for entry in cfg["plugins"] for k, v in entry.items() if v}
    others = sorted(
        p.name for p in PLUGINS_DIR.iterdir()
        if p.name in enabled and p.name not in BASE_ORDER and (p / "app" / "index.js").exists()
    )
    names = BASE_ORDER + others + ["settings"]
    return [{"name": n, "icon": f"/plugins/{n}/icon.svg"} for n in names
            if (PLUGINS_DIR / n / "app" / "index.js").exists()]


app.mount("/plugins", StaticFiles(directory=PLUGINS_DIR), name="plugins")
app.mount("/", StaticFiles(directory=REPO_ROOT / "frontend", html=True), name="frontend")
