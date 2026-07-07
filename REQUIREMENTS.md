# Requirements

## Infrastructure
- Runs as a plain local process for now (`uvicorn`), no containers yet.
- Podman packaging is deferred until the app itself works — no speculative infra.

## Persistence
- No database. Markdown files on disk are the only source of truth.
- Content lives in a **separate git repository**, outside the app repo (not nested).
- Workspace path is configured via `settings/user.json`.
- Each plugin has its own folder in the content repo, named after the plugin.

## Frontend
- Vanilla JS, native ES modules. No bundler, no framework, no build step.

## Plugin ↔ core contract
- Convention-based auto-discovery — core has no hardcoded knowledge of individual plugins.
- Backend: each plugin folder has an `api.py` exporting a FastAPI `router`. Core imports it via `importlib` for each name enabled in `settings/plugins.json` and mounts it at `/api/<name>`.
- Frontend: each plugin folder has a `frontend/index.js` exporting `mount(container)`. Core dynamically `import()`s it when the plugin's icon is selected.
- Adding/removing a plugin never requires editing core code — only a folder and a `settings/plugins.json` toggle.

## MVP scope
- Plugins to build: `diary`, `files`, `calendar`, `search`.
- Base plugins needed: `editor`, `settings`.
- Fully deferred, no stubs or placeholder icons: `sync`, `llm`.

## Auth
- Single-user. No login, no sessions, no per-user workspace roots.

## Search
- Live scan of workspace files per query. No persistent index.
- Add an index only if vault size makes live scan measurably slow.

## Serving
- One FastAPI process serves both `/api/*` routers and the static frontend, same origin, no CORS.

## Editor
- Full WYSIWYM from the start (not deferred to a plain-textarea v0).
- Hand-rolled on native `contenteditable` + Selection API — no rich-text/WYSIWYG library, since the spec's toggle-on-select behavior (raw syntax visible but styled, collapses to rendered form only when cursor leaves) doesn't match any existing library's model.
- Markdown parser + serializer is hand-rolled for the fixed syntax subset actually used: headings, bold/italic, links, images, `[[wiki-links]]`, fenced code blocks. Needed because round-tripping (edited DOM → exact markdown text) isn't something a render-only library provides anyway.

## Calendar
- Entries are markdown files with YAML frontmatter (`title`, `start`/`end` or `date`, `type: event|task`, `group`, `repeat`, `done`, `alert`, `participants`) plus a markdown body.
- Recurring events (`repeat: weekly` etc.) are expanded into occurrences by the backend for a queried date range (`GET /api/calendar/events?start=...&end=...`). Frontend only renders what it's given.

## Files
- Tree view of the workspace with expand/collapse and title extraction from the first `#` heading.
- Git status coloring (new/modified) dropped from scope entirely.
