# Backend

The backend provides the base functionality and api endpoints for the plugins.
It runs as a single FastAPI process (via `uvicorn`), serving both the `/api/*` plugin routers and the static frontend from the same origin. There is no database — markdown files in the workspace are the only source of truth. Podman packaging is planned for later, once the app itself works.
