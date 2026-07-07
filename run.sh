#!/usr/bin/env bash
# Butler: ./run.sh          -> start server
#         ./run.sh build    -> rebuild the editor bundle (needs node)
set -e
cd "$(dirname "$0")"

if [ "$1" = "build" ]; then
    npm install --no-audit --no-fund
    npx esbuild plugins/editor/app/editor.js --bundle --format=esm \
        --outfile=frontend/vendor/editor.js --minify
    exit 0
fi

[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q fastapi 'uvicorn[standard]' pyyaml python-multipart
exec .venv/bin/uvicorn backend.app:app --host 0.0.0.0 --port 8000
