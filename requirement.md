# Butler — Requirements Specification

> Your life in markdown.

This document describes all implemented features, their expected behavior, and the system architecture. It serves as the ground truth for future development iterations.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Markdown Editor](#2-markdown-editor)
3. [Tab System](#3-tab-system)
4. [File Browser](#4-file-browser)
5. [Search](#5-search)
6. [Zettelkasten Plugin](#6-zettelkasten-plugin)
7. [Calendar Plugin](#7-calendar-plugin)
8. [Recipes Plugin](#8-recipes-plugin)
9. [Diary Plugin](#9-diary-plugin)
10. [Settings](#10-settings)
11. [Sync](#11-sync)
12. [Theming & Appearance](#12-theming--appearance)
13. [Keyboard Shortcuts](#13-keyboard-shortcuts)
14. [Known Limitations](#14-known-limitations)
15. [Unimplemented Plugins](#15-unimplemented-plugins)

---

## 1. Architecture

### 1.1 Overview

Butler is a personal knowledge management tool that stores everything as **markdown files** in a workspace directory. It consists of:

- **Backend**: FastAPI (Python) served by Uvicorn. Provides a REST API and serves frontend static files. No separate web server (Nginx) is needed in development.
- **Frontend**: Vanilla HTML/CSS/JavaScript with no build step. All JS is ES modules loaded directly by the browser. CodeMirror 6 is loaded from CDN (esm.sh).
- **Plugin system**: Extensible architecture where each feature is a self-contained plugin.

### 1.2 Directory Layout

```
butler/
├── backend/api/              # FastAPI application
│   ├── main.py               # App entry, mounts routers + static files
│   ├── requirements.txt      # Python dependencies
│   └── routers/              # One file per API domain
│       ├── calendar.py
│       ├── files.py
│       ├── search.py
│       ├── settings.py
│       └── sync.py
├── frontend/
│   ├── index.html            # Single-page app shell
│   ├── css/app.css           # All application styles
│   ├── js/
│   │   ├── app.js            # Core: plugin manager, tabs, navigation, theme
│   │   └── plugins/          # One JS module per plugin
│   └── themes/               # CSS variable files (dark.css, bright.css)
├── content/                  # Default workspace (user's markdown files)
├── plugins/                  # Plugin README descriptions + sample data
├── settings/                 # JSON configuration files
│   ├── appearance.json
│   ├── plugins.json
│   ├── shortkeys.json
│   └── user.json
└── run.sh                    # Startup script
```

### 1.3 Startup

```bash
./run.sh
```

This installs Python dependencies, resolves the workspace from `settings/user.json`, and starts Uvicorn on `http://127.0.0.1:8000` with `--reload`.

On Windows with conda:
```powershell
$env:NO_PROXY="*"
& C:\Users\<user>\.conda\envs\butler_env\python.exe -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8001
```

### 1.4 Plugin System

**Plugin types:**

| Type | Behavior | Examples |
|------|----------|---------|
| `panel` | Renders in the collapsible side panel. The main editor area remains visible. | search, files, zettelkasten, diary |
| `full` | Takes over the entire main content area. | calendar, recipes, settings, sync |
| `internal` | Not shown in the sidebar. Managed by the tab system. | editor |

**Plugin lifecycle:**
- Each plugin is an ES module in `frontend/js/plugins/` that exports a default object with: `{ name, type, label, icon, init(container, butler), activate(), deactivate() }`
- Plugins are registered in `app.js` via `registerPlugin(name, modulePath)` which dynamically imports the module.
- The `butler` API object is passed to every plugin's `init()`: `{ api, toast, state, getPlugin(name), openFile(path, opts), onTabDirtyChange, toggleTheme, refreshFileTree }`

**Sidebar order:**
```
Top:    search, files, zettelkasten, calendar, recipes, diary
Bottom: sync, settings
```

### 1.5 REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/files/tree?path=...` | Recursive file tree (optional path filter) |
| `GET` | `/api/files/read?path=...` | Read text file content (returns 400 for binary) |
| `GET` | `/api/files/raw?path=...` | Serve raw file (images, PDFs — FileResponse) |
| `POST` | `/api/files/write` | `{ path, content }` — save/create file |
| `POST` | `/api/files/create` | `{ path, content }` — create new (409 if exists) |
| `DELETE` | `/api/files/delete?path=...` | Delete file or folder |
| `POST` | `/api/files/rename` | `{ old_path, new_path }` — rename/move |
| `POST` | `/api/files/duplicate` | `{ path }` — creates `-copy` sibling |
| `POST` | `/api/files/upload-image` | Multipart upload → timestamped filename |
| `GET` | `/api/calendar/events?start=&end=` | Events overlapping the date range |
| `POST` | `/api/calendar/events` | Create calendar event |
| `PUT` | `/api/calendar/events/{id}` | Update calendar event |
| `DELETE` | `/api/calendar/events/{id}` | Delete calendar event |
| `GET` | `/api/search?q=...` | Full-text search with line context |
| `GET` | `/api/settings/{category}` | Read JSON settings file |
| `PUT` | `/api/settings/{category}` | Update JSON settings file |
| `GET` | `/api/sync/status` | Git status of workspace |
| `POST` | `/api/sync/save` | `git add -A && git commit` |
| `POST` | `/api/sync/push` | `git push` |
| `POST` | `/api/sync/pull` | `git pull` |
| `GET` | `/api/themes` | List available theme names |
| `GET` | `/api/plugins` | List plugin metadata + enabled state |
| `GET` | `/api/plugins/{name}/icon` | Plugin SVG icon |

### 1.6 Workspace Resolution

The workspace path is read from `settings/user.json`:
```json
{
  "workspace": [
    {"location": "${HOME}/ws/butler/content"}
  ]
}
```
Environment variables are expanded. Fallback: `<butler>/content`.

---

## 2. Markdown Editor

The editor is the core of Butler. It uses **CodeMirror 6** loaded from esm.sh CDN (10 packages). It behaves similarly to Zettlr or Obsidian — a WYSIWYM (What You See Is What You Mean) editor that shows markdown syntax but with visual enhancements.

### 2.1 CDN Modules

All CodeMirror modules must load from the **same CDN** (esm.sh) without version pins to avoid duplicate `@codemirror/state` instances:
- `codemirror`, `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`
- `@codemirror/language`, `@codemirror/commands`, `@codemirror/search`
- `@lezer/highlight`, `@codemirror/language-data`, `@codemirror/autocomplete`

### 2.2 Inline Image Preview

- **Syntax**: `![alt text](path/to/image.png)` or `![](./relative.jpg)`
- **Behavior**: A block widget is rendered **below** the markdown line showing the image preview.
- **Supported formats**: png, jpg, jpeg, gif, svg, webp, bmp, ico
- **Path resolution**: Relative paths resolve against the current file's directory via `/api/files/raw?path=...`
- **HTTP URLs**: Displayed directly (`<img src="https://...">`)
- **Double-click**: Opens the image in a dedicated image viewer tab.
- **Error handling**: If image fails to load, the preview hides silently (`display: none`).
- **Implementation**: Uses `StateField` (NOT `ViewPlugin`) per CM6 block decoration rules.

### 2.3 File Attachment Decorations

- **Syntax**: `[label](path/to/file.pdf)` — standard markdown link where the file is NOT an image.
- **Behavior**: An inline paperclip (📎) icon widget with the filename is rendered after the link text.
- **Excluded from attachment treatment**: Image extensions (png, jpg, jpeg, gif, svg, webp, bmp, ico) — these get image previews instead.
- **HTTP URLs**: Not treated as attachments (only local files).
- **Double-click**: Opens the raw file URL in a new browser tab.

### 2.4 Clickable Links

- **Ctrl+Click** (or Cmd+Click on Mac) on a link opens it:
  - HTTP/HTTPS URLs → new browser tab
  - `.md` files → opened in Butler editor (resolved relative to current file)
- Without Ctrl held, clicking a link positions the cursor normally.

### 2.5 Frontmatter Fold

- **Detection**: File must start with `---` on line 1, closed by another `---` on a subsequent line.
- **Default state**: Collapsed. Shows a single line: `▸ show frontmatter`.
- **Click to expand**: Shows full frontmatter content with `▾ hide frontmatter` button above it.
- **Font**: Frontmatter uses the **same font family and size** as the document body (not monospace, not smaller).

### 2.6 Clipboard Paste Handler

When the user pastes (Ctrl+V):

1. **Image blob** (e.g., screenshot from clipboard):
   - A resize popup appears showing the image preview with width/height fields.
   - Width and height are linked (maintain aspect ratio) — click the 🔗 icon to unlock.
   - Two buttons: "Keep original" and "Resize & insert".
   - The image is uploaded via `/api/files/upload-image` to the current file's directory.
   - Inserts `![](filename.ext)` at the cursor position.

2. **URL text** (e.g., `https://example.com/page`):
   - If the URL ends with an image extension → inserts `![](URL)`
   - Otherwise → inserts `[URL](URL)`

3. **Regular text**: Default paste behavior (no interception).

### 2.7 `[[` Zettelkasten Autocomplete

- **Trigger**: Typing `[[` activates the autocomplete dropdown.
- **Source**: File list from the zettelkasten plugin's `getFiles()` API.
- **Matching**: Filters files whose label or name contains the typed query (case-insensitive).
- **Selection**: Inserts `[[display/name]]` format (without `.md` extension).
- **Prerequisite**: The zettelkasten plugin must have been opened at least once to populate its file list.

### 2.8 Editor Toolbar

A row of 4 icon buttons rendered above the editor area:

| Button | Icon | Action |
|--------|------|--------|
| Insert Link | 🔗 chain | Inserts `[link text](https://)` at cursor |
| Attach File | 📎 paperclip | Opens file picker dialog, uploads file, inserts `[filename](uploaded_name)` |
| Insert Image | 🖼️ frame | Opens image picker dialog, uploads image, inserts `![filename](uploaded_name)` |
| Insert Recording | ⏺️ circles | Inserts `[🎙️ recording](recording.mp3)` at cursor |

### 2.9 Code Syntax Highlighting

- Code blocks (` ```python `, ` ```bash `, etc.) get language-specific syntax highlighting.
- Powered by `@codemirror/language-data` which provides language support for common languages.
- The `codeLanguages` option is set to `cm.languages` from the language-data package.

### 2.10 Editor Behavior

- **Tab key**: Inserts 2 spaces (not 1, not a tab character). Configured via `indentUnit.of('  ')`.
- **Line wrapping**: Enabled — long lines wrap visually without horizontal scrolling.
- **Line numbers**: Shown in the left gutter.
- **Active line highlight**: Current line has a subtle background color.
- **Search**: Ctrl+F opens the built-in CodeMirror search panel within the editor.
- **Save**: Ctrl+S saves the current file. A `●` dot indicator shows unsaved (dirty) state in the tab.
- **Content margins**: Left/right padding is compact (`4px 8px`) for more editing space.
- **List items** (`- `): Not collapsible/expandable. The `foldGutter` extension is intentionally excluded to prevent list-item fold toggles.

### 2.11 Per-Tab State

Each open file maintains its own:
- `editorState`: Full CodeMirror state (document, cursor position, selection, undo history)
- `scrollTop`: Vertical scroll position
- `dirty`: Whether the file has unsaved changes

Switching tabs preserves and restores all of these.

---

## 3. Tab System

### 3.1 Tab Bar

- Located at the top of the main content area.
- Each open `.md` or image file gets a tab showing the filename.
- Active tab has a brighter background color (uses theme's `--bg-3` variable) instead of an underline.
- Dirty (unsaved) tabs show a `●` indicator.
- Each tab has an `×` close button on the right.

### 3.2 Tab Scrolling

- When tabs overflow the available width, `‹` and `›` arrow buttons appear on the left and right edges.
- Clicking an arrow scrolls the tab strip by 120px with smooth animation.
- Arrow visibility is managed by a `ResizeObserver` (module-scoped, disconnected on re-render to prevent memory leaks).
- Arrows are hidden when there is no overflow.

### 3.3 Preview Tabs

- **Single-click** on a file in the file tree or zettelkasten panel opens a **preview tab**:
  - The tab name is shown in *italic*.
  - Only one preview tab exists at a time — clicking another file replaces it.
- **Double-click** on a file (in file tree, tab bar, or zettelkasten) **pins** the tab:
  - The tab name becomes normal (non-italic).
  - The tab persists until explicitly closed.
- **Editing** a file (any document change) automatically pins its preview tab.

### 3.4 Tab Context Menu

Right-click on a tab shows a context menu with:

| Action | Behavior |
|--------|----------|
| Close | Close this tab (confirm if dirty) |
| Close Others | Close all tabs except this one (confirm if any dirty) |
| Close All | Close all tabs (confirm if any dirty) |
| Open File Location | Open the Files panel and highlight/reveal this file in the tree |

The context menu closes on Escape or clicking outside.

### 3.5 Unsaved Changes Guard

- When closing a dirty tab, a confirmation dialog appears: `"filename" has unsaved changes. Close anyway?`
- When closing the browser with dirty tabs, the `beforeunload` event fires a "leave page?" confirmation.

---

## 4. File Browser

- **Type**: Panel plugin (renders in the left side panel).
- **Default**: Opens automatically on app startup.
- **Shows**: Recursive tree of the workspace directory.
- **Toggle**: Ctrl+B or clicking the Files icon in the activity bar.
- **Folder expand**: Click a folder to expand/collapse. Children are loaded lazily on first expand.

### 4.1 File Tree Context Menu

Right-click on any file or folder shows:

| Action | Behavior |
|--------|----------|
| Rename | Replaces the name with an inline text input. For files, the name (without extension) is pre-selected. Enter to confirm, Escape to cancel. |
| Duplicate | Creates a `-copy` sibling file via the API. |
| Delete | Confirmation prompt, then deletes via the API. |

### 4.2 File Opening

- **Single-click**: Opens file as a preview tab (italic, replaceable).
- **Double-click**: Opens file as a pinned tab (permanent).
- **Image files**: Opened in a dedicated image viewer (not the editor).

### 4.3 Reveal File

When triggered from the tab context menu ("Open File Location"):
- Switches to the Files panel if not active.
- Expands all ancestor directories.
- Scrolls to and highlights the target file.

---

## 5. Search

- **Type**: Panel plugin (renders in the left side panel).
- **Trigger**: Ctrl+Shift+F or clicking the Search icon.
- **Input**: Text field with debounced search (250ms delay, minimum 2 characters).
- **Results**: Grouped by file, showing:
  - Filename and line number
  - Context lines before and after the match
  - The matching line with the query highlighted in `<mark>` tags
- **Click result**: Opens the file in the editor.
- **Layout**: Compact — result divs shrink to fit their content. No excess vertical whitespace. Blank lines in search results are preserved (not skipped).

---

## 6. Zettelkasten Plugin

- **Type**: Panel plugin.
- **Shows**: Only the `zettelkasten/` folder tree (not the full workspace).
- **Icon**: Card index box icon in the activity bar.

### 6.1 File Tree

- Same tree-view interaction as the Files plugin (expand/collapse folders, single/double-click files).
- No context menu (rename/delete/duplicate are in the Files plugin only).

### 6.2 New Note

- `+ New` button at the top.
- Prompts for a note title via `prompt()`.
- Creates `zettelkasten/{slug}.md` where `slug` is the lowercased, hyphenated title.
- File content: `# {title}\n\n`
- Opens the new note in a pinned tab.

### 6.3 File List API

- `getFiles()` returns an array of `{ name, path, label }` for all files in the zettelkasten tree.
- Used by the editor's `[[` autocomplete.
- The list is rebuilt incrementally when folders are expanded (to avoid clearing the list).

---

## 7. Calendar Plugin

- **Type**: Full plugin (takes over the main area).
- **Data storage**: Markdown files with YAML frontmatter in `content/calendar/`.
- **Views**: Month, Week, Day — switchable via header buttons.

### 7.1 Event Types

| Field | Meetings | Tasks |
|-------|----------|-------|
| `type` | `meeting` | `task` |
| `title` | Required | Required |
| `start` | Date+time | Date only |
| `end` | Date+time | Date only |
| `group` | Color category | Color category |
| `status` | — | `pending` or `done` |

### 7.2 Month View

- Grid of 6 weeks × 7 days (Mon–Sun).
- Events appear as colored chips in their day cells.
- **Multi-day events**: Span across all days from start to end.
  - CSS classes: `cal-span-start`, `cal-span-mid`, `cal-span-end`
  - At week boundaries: `cal-span-week-break` (end of row) and `cal-span-week-cont` (start of next row)
  - Only cosmetic per-cell styling — no lane assignment algorithm for overlapping multi-day events.

### 7.3 Drag and Drop

- **Left-click and hold** on a calendar event chip initiates drag.
- **Drop on another date** updates the event's start date (and end date, maintaining the same duration).
- Feedback: Ghost chip follows the cursor; drop target highlights.

### 7.4 Context Menus

- **Right-click on a date** → `['New Meeting', 'New Task']` → opens creation popup.
- **Right-click on an existing event** → `['Edit', 'View', 'Delete']` → respective actions.

### 7.5 Event Popups

- Creation/edit popups show fields appropriate to the event type.
- **Close**: ESC key or `×` button on the top right.
- **Date change rule**: When a task's start date changes, its end date automatically updates to match. Same for meetings.

### 7.6 Group Filtering

- Dropdown showing all color groups with checkboxes.
- Click a group to show/hide its events.
- **Right-click on a color group name** → inline rename to set a custom label for that category (stored in `settings/calendar.json`).

### 7.7 Mini Calendar

- Date picker dropdown for quick navigation.
- **Selected day** gets accent-color highlight styling.

### 7.8 Backend Filter

- The `/api/calendar/events?start=&end=` endpoint uses **overlap logic**: returns events where `eventStart < end AND eventEnd >= start`.
- This ensures multi-day events that started before the current view window still appear.

---

## 8. Recipes Plugin

- **Type**: Full plugin.
- **Data storage**: Markdown files in `content/recipes/` with YAML frontmatter.

### 8.1 Recipe Format

```markdown
---
ingredients: flour, sugar, eggs
persons: 4
---
Preheat oven to 180°C.
---
Mix dry ingredients.
---
Bake for 30 minutes.
```

- Steps are separated by `---` on their own line (parsed via `/^---$/m` regex).
- Leading/trailing `---` separators produce empty strings that get filtered out (no raw `---` shown).

### 8.2 Recipe View

- **Ingredient bar** at the top showing ingredients and persons count.
- **Step tiles** below — click a tile to expand it in a popup with full content.

### 8.3 New Recipe Popup

- **Themed popup** matching the selected CSS theme (not a plain browser dialog).
- Fields: Title, Persons
- **Ingredients**: Each ingredient has two fields (name + amount). `+ Add Ingredient` button adds a new row.
- **Steps**: Each step has a textarea. `+ Add Step` button adds a new step.
- **Enter key**: In ingredient/step fields, Enter creates a new row and focuses it. Shift+Enter in step textarea inserts a newline.

---

## 9. Diary Plugin

- **Type**: Panel plugin.
- **Data storage**: Markdown files in `content/diary/` named `YYYYMMDDHHMMSS.md` or `YYYYMMDDHHMMSSmmm.md` (UTC timestamp).
- **Position**: Icon is in the **top section** of the activity bar (not bottom).

### 9.1 Entry List

- Entries sorted newest-first.
- **Title display**: Shows the first `# heading` from the file content instead of the date-based filename. Falls back to formatted date if no heading found.
- Titles are loaded asynchronously with a `renderSeq` guard to prevent stale DOM updates if the panel re-renders.

### 9.2 New Entry

- `+ New Entry` button creates a diary file with current UTC timestamp.
- Default content: YAML frontmatter with `date` field + empty body.
- Opens the new entry in the editor immediately.

---

## 10. Settings

- **Type**: Full plugin.
- **JSON files**: `appearance.json`, `plugins.json`, `shortkeys.json`, `user.json`
- Each setting category is displayed with appropriate UI controls (not raw JSON).

### 10.1 Appearance Settings

| Field | Type | Description |
|-------|------|-------------|
| `theme` | Dropdown | Select from available themes in `frontend/themes/` (e.g., "dark", "bright") |
| `font-size` | Text | Base font size (e.g., "20px") |
| `zoom-level` | Text/Slider | Zoom percentage (50–200%). Font size scales proportionally: `14px × zoom/100`. |
| `time-format` | Dropdown | "24h" or "12h" |

### 10.2 Plugin Settings

- Each plugin listed from `plugins.json` has a **toggle switch** (on/off).
- Toggle width is compact (not full-width).

### 10.3 Shortkeys Settings

- Each shortkey from `shortkeys.json` has its own input field.
- Plugin-specific shortcuts are grouped under their plugin name.

### 10.4 User Settings

- Workspace location and other user preferences from `user.json`.
- Displayed as editable fields (not raw JSON).

---

## 11. Sync

- **Type**: Full plugin.
- **Features**: Git-based synchronization.
  - View current git status (modified, untracked, staged files).
  - Commit changes (git add + commit with message).
  - Push to remote.
  - Pull from remote.

---

## 12. Theming & Appearance

### 12.1 Theme System

- Themes are CSS files in `frontend/themes/` that define CSS custom properties (variables).
- The active theme is set via `settings/appearance.json` → `{ "theme": "dark" }`.
- The `data-theme` attribute on `<html>` loads the corresponding theme file.
- Available themes: `dark.css`, `bright.css` (extensible — any `.css` file in the themes folder is auto-discovered).

### 12.2 CSS Variables (examples)

- `--bg-1`, `--bg-2`, `--bg-3`: Background levels (darkest to lightest in dark theme)
- `--text-1`, `--text-2`, `--text-3`: Text colors (primary, secondary, tertiary)
- `--accent`, `--accent-bg`, `--accent-bg-strong`: Accent color and backgrounds
- `--border`: Border color
- `--ff-heading`, `--ff-body`, `--ff-mono`: Font families
- `--fs-base`: Base font size (scaled by zoom level)

### 12.3 Zoom Level

- Controlled via `zoom-level` in `appearance.json` (e.g., "80%", "100%", "120%").
- Implemented as: `--fs-base = 14px × (zoom / 100)`.
- All font sizes in the app reference `--fs-base` or are relative to it, so changing zoom affects the entire UI proportionally.

### 12.4 Fonts

- **Heading font** (Fraunces): Used for h1–h3 headings in the editor.
- **Body font** (Plus Jakarta Sans): Used for all other text including frontmatter.
- **Mono font** (JetBrains Mono): Used for inline code and code blocks.
- Loaded from Google Fonts CDN.

---

## 13. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+F` | Open/toggle Search panel |
| `Ctrl+B` | Open/toggle Files panel |
| `Ctrl+S` | Save current file |
| `Ctrl+F` | Open in-editor search (CodeMirror native) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo (CodeMirror native) |
| `Ctrl+Click` on link | Open link (URL in new tab, .md in editor) |
| `Escape` | Close context menus, close calendar popups |
| `Tab` | Insert 2 spaces in editor |

Plugin-specific shortcuts (from `shortkeys.json`):
- `Ctrl+Shift+C`: Calendar
- `Ctrl+Shift+Z`: Zettelkasten
- `Ctrl+J`: Focus mode

---

## 14. Known Limitations

1. **Multi-day calendar spans are cosmetic only**: No lane-assignment algorithm. Multi-day events in the same week may visually overlap since there is no slot allocation across cells.
2. **Diary N+1 fetch**: Each diary entry makes a separate HTTP request to extract its title. Works but may be slow with hundreds of entries. A backend batch endpoint could optimize this.
3. **`[[` autocomplete requires zettelkasten plugin loaded**: The autocomplete returns no results if the zettelkasten icon hasn't been clicked (which triggers `init` → `loadTree` → populates `allFiles`).
4. **Backend changes require server restart**: Python router changes (e.g., calendar overlap filter) need Uvicorn to restart to take effect. Frontend JS changes are served live.
5. **No offline support**: Requires the backend server to be running.
6. **Browser-only `prompt()`**: The zettelkasten "New Note" dialog uses the browser's native `prompt()` — could be themed like the recipe creation popup.

---

## 15. Unimplemented Plugins

The following plugins have README descriptions in the `plugins/` folder but are **not yet implemented**:

- **dossier**: Personal dossier/profile system
- **flipcard**: Flashcard learning tool
- **inbox**: Incoming items / quick capture
- **llm**: LLM integration for AI assistance
- **pdf**: PDF extraction and viewing
- **presentations**: Presentation/slideshow tool

These are planned for future development iterations. Each has a `README.md` in its `plugins/` subfolder describing the intended behavior.