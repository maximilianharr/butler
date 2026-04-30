#!/usr/bin/env bash
# Butler — Start Script
# Installs Python dependencies and launches the FastAPI backend.
# The backend also serves the frontend static files.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🏠 Butler — Your life in markdown"
echo ""

# ── Install Python Dependencies ──────────────────────────────
echo "📦 Installing dependencies…"
pip install -q -r backend/api/requirements.txt

# ── Ensure workspace exists ──────────────────────────────────
WORKSPACE=$(python -c "
import json, os
cfg = json.load(open('settings/user.json'))
loc = cfg.get('workspace', [{}])[0].get('location', '\${HOME}/ws/butler/content')
print(os.path.expandvars(loc))
")
mkdir -p "$WORKSPACE"
echo "📁 Workspace: $WORKSPACE"

# ── Start FastAPI ────────────────────────────────────────────
echo "🚀 Starting Butler on http://127.0.0.1:8000"
echo ""
exec uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --reload