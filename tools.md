# Butler — Development Tools & Verification Process

This document describes the tools, commands, and processes used during development to verify code correctness and prevent regressions.

---

## Table of Contents

1. [Development Environment](#1-development-environment)
2. [Server Management](#2-server-management)
3. [Syntax Verification](#3-syntax-verification)
4. [IDE Diagnostics](#4-ide-diagnostics)
5. [HTTP Smoke Tests](#5-http-smoke-tests)
6. [Adversarial Code Review](#6-adversarial-code-review)
7. [Verification Workflow](#7-verification-workflow)
8. [Common Gotchas](#8-common-gotchas)

---

## 1. Development Environment

| Component | Detail |
|-----------|--------|
| OS | Windows 11 |
| Python | 3.11 (conda env: `butler_env`) |
| Node.js | v22.18.0 (used for JS syntax checking only — not for the app) |
| Git branch | `feature/ai-test-01` |
| Editor | VS Code with Copilot |
| Backend server | Uvicorn on port 8001 (or 8000 via `run.sh`) |

### Conda Environment Activation

```powershell
# Python binary path
C:\Users\ham5st\.conda\envs\butler_env\python.exe

# Running python commands
& C:\Users\ham5st\.conda\envs\butler_env\python.exe -c "print('hello')"
```

### Windows Proxy Bypass

On corporate Windows machines, localhost requests may be routed through a proxy. Always set:

```powershell
$env:NO_PROXY="*"
```

And when using `curl`:

```powershell
curl.exe --noproxy "*" http://127.0.0.1:8001/api/files/tree
```

---

## 2. Server Management

### Starting the Server

```powershell
cd C:\Users\ham5st\ws\butler
$env:NO_PROXY="*"
& C:\Users\ham5st\.conda\envs\butler_env\python.exe -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8001
```

- Frontend JS changes take effect immediately (static files served live).
- Backend Python changes require a server restart.
- Use `--reload` flag during development for auto-restart on Python changes.

### Checking if Server is Running

```powershell
curl.exe --noproxy "*" -s -o $null -w "%{http_code}" http://127.0.0.1:8001/
```

Returns `200` if the server is up.

### Stopping the Server

```powershell
# Find the process
Get-Process -Name python* | Where-Object { $_.CommandLine -like '*uvicorn*' }
# Or stop by PID
Stop-Process -Id <PID>
```

---

## 3. Syntax Verification

### JavaScript (ES Modules)

All frontend JS files are ES modules. Node.js can check their syntax without executing them:

```powershell
Get-Content frontend\js\app.js | node --check --input-type=module
Get-Content frontend\js\plugins\editor.js | node --check --input-type=module
Get-Content frontend\js\plugins\calendar.js | node --check --input-type=module
Get-Content frontend\js\plugins\zettelkasten.js | node --check --input-type=module
Get-Content frontend\js\plugins\recipes.js | node --check --input-type=module
Get-Content frontend\js\plugins\diary.js | node --check --input-type=module
Get-Content frontend\js\plugins\files.js | node --check --input-type=module
Get-Content frontend\js\plugins\search.js | node --check --input-type=module
Get-Content frontend\js\plugins\settings.js | node --check --input-type=module
Get-Content frontend\js\plugins\sync.js | node --check --input-type=module
```

**Exit code 0** = valid syntax. Any other exit code indicates a parse error.

**Important**: This checks syntax only, not runtime correctness. CDN imports (esm.sh) are not resolved by Node.

### Python

```powershell
& C:\Users\ham5st\.conda\envs\butler_env\python.exe -c "import py_compile; py_compile.compile(r'backend\api\main.py', doraise=True)"
& C:\Users\ham5st\.conda\envs\butler_env\python.exe -c "import py_compile; py_compile.compile(r'backend\api\routers\calendar.py', doraise=True)"
& C:\Users\ham5st\.conda\envs\butler_env\python.exe -c "import py_compile; py_compile.compile(r'backend\api\routers\files.py', doraise=True)"
& C:\Users\ham5st\.conda\envs\butler_env\python.exe -c "import py_compile; py_compile.compile(r'backend\api\routers\search.py', doraise=True)"
& C:\Users\ham5st\.conda\envs\butler_env\python.exe -c "import py_compile; py_compile.compile(r'backend\api\routers\settings.py', doraise=True)"
& C:\Users\ham5st\.conda\envs\butler_env\python.exe -c "import py_compile; py_compile.compile(r'backend\api\routers\sync.py', doraise=True)"
```

**`doraise=True`** ensures a `py_compile.PyCompileError` is raised on syntax errors instead of silent failure.

---

## 4. IDE Diagnostics

VS Code diagnostics are checked via the `ide-get_diagnostics` tool during the Copilot development workflow. This captures:

- **Errors**: TypeScript/JS parse errors, Python import errors, etc.
- **Warnings**: Unused variables, unreachable code, etc.
- **Hints**: Style suggestions

### When to Check

1. **Baseline**: Before making any code changes (establishes pre-existing issues).
2. **After changes**: After every implementation step to catch regressions immediately.
3. **Per file**: Diagnostics are checked for every modified file AND files that import modified files.

### Interpreting Results

- **Zero diagnostics on changed files** = pass
- **Pre-existing diagnostics** on unchanged files are noted but not counted as failures
- **New diagnostics** introduced by changes must be fixed before presenting code

---

## 5. HTTP Smoke Tests

After making changes to frontend files, verify they are served correctly by the running server:

### Check File Serving (HTTP 200)

```powershell
# Check all modified JS files serve with 200
curl.exe --noproxy "*" -s -o $null -w "%{http_code}" http://127.0.0.1:8001/js/app.js
curl.exe --noproxy "*" -s -o $null -w "%{http_code}" http://127.0.0.1:8001/js/plugins/editor.js
curl.exe --noproxy "*" -s -o $null -w "%{http_code}" http://127.0.0.1:8001/js/plugins/calendar.js
curl.exe --noproxy "*" -s -o $null -w "%{http_code}" http://127.0.0.1:8001/js/plugins/zettelkasten.js
curl.exe --noproxy "*" -s -o $null -w "%{http_code}" http://127.0.0.1:8001/css/app.css
```

### Check API Endpoints

```powershell
# File tree
curl.exe --noproxy "*" -s http://127.0.0.1:8001/api/files/tree | Select-Object -First 1

# Settings
curl.exe --noproxy "*" -s http://127.0.0.1:8001/api/settings/appearance

# Themes list
curl.exe --noproxy "*" -s http://127.0.0.1:8001/api/themes

# Calendar events (with date range)
curl.exe --noproxy "*" -s "http://127.0.0.1:8001/api/calendar/events?start=2026-04-01&end=2026-04-30"

# Search
curl.exe --noproxy "*" -s "http://127.0.0.1:8001/api/search?q=test"
```

### Check New Files Exist

```powershell
# Verify a newly created file is served
curl.exe --noproxy "*" -s -o $null -w "%{http_code}" http://127.0.0.1:8001/js/plugins/zettelkasten.js
# Expected: 200
```

---

## 6. Adversarial Code Review

For medium and large tasks, an adversarial review process is used where independent AI models review the staged changes.

### Setup

```powershell
# Stage all changes so reviewers can see them
git add -A
```

### Review Prompt (sent to each model)

```
Review the staged changes via `git --no-pager diff --staged`.
Files changed: {list_of_files}.
Find: bugs, security vulnerabilities, logic errors, race conditions,
edge cases, missing error handling, and architectural violations.
Ignore: style, formatting, naming preferences.
For each issue: what the bug is, why it matters, and the fix.
If nothing wrong, say so.
```

### Model Configuration

| Task Size | Models Used |
|-----------|------------|
| Medium (no 🔴 files) | 1 reviewer: `gpt-5.3-codex` |
| Large (or 🔴 files) | 3 reviewers in parallel: `gpt-5.3-codex`, `claude-opus-4.6`, `claude-sonnet-4.5` |

### Severity Classification

| Level | Description | Action |
|-------|-------------|--------|
| HIGH | Bugs that cause runtime errors, data loss, or broken functionality | Must fix before presenting |
| MEDIUM | Memory leaks, race conditions, edge cases | Should fix |
| LOW | Minor improvements, potential optimizations | Note for future |

### Examples of Issues Caught in This Project

1. **HIGH — `allFiles = []` permanent clear** (found by GPT-5.3 + Opus 4.6): The zettelkasten `toggleDir` function was setting `allFiles = []` on folder expand without rebuilding the list, permanently breaking `[[` autocomplete. Fixed with incremental rebuild using `collectFiles()`.

2. **MEDIUM — `ResizeObserver` leak** (found by GPT-5.3): `renderTabBar()` created a new `ResizeObserver` on every call without disconnecting previous ones. Fixed by hoisting to a module-level `tabStripObserver` variable that gets disconnected before recreation.

3. **LOW — Diary render race condition** (found by Sonnet 4.5 + Opus 4.6): Async `fetchTitle` calls could update detached DOM elements if the diary panel re-rendered during loading. Fixed with a `renderSeq` counter guard.

---

## 7. Verification Workflow

The full verification process (called "Anvil Loop") used during development:

### Step-by-Step Process

```
1. BASELINE CAPTURE
   ├── IDE diagnostics on files to be changed
   ├── JS syntax check (node --check)
   ├── Python syntax check (py_compile)
   └── HTTP smoke tests (if server running)

2. IMPLEMENT CHANGES
   ├── Read neighboring code first
   ├── Follow existing patterns
   └── Make surgical changes

3. POST-CHANGE VERIFICATION
   ├── IDE diagnostics on ALL changed files
   ├── JS syntax check on changed files
   ├── Python syntax check on changed files
   ├── HTTP smoke tests (200 status on served files)
   └── If no runtime signal from above → Tier 3 (import/load test)

4. ADVERSARIAL REVIEW
   ├── git add -A (stage changes)
   ├── Launch 1-3 code-review agents
   ├── Fix any HIGH/MEDIUM issues found
   └── Re-run verification if fixes were made

5. EVIDENCE BUNDLE
   └── SQL ledger of all checks, results, and reviewer verdicts
```

### Verification Ledger (SQL)

All verification steps are recorded in a SQL database to prevent hallucinated verification:

```sql
CREATE TABLE IF NOT EXISTS anvil_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('baseline', 'after', 'review')),
    check_name TEXT NOT NULL,
    tool TEXT NOT NULL,
    command TEXT,
    exit_code INTEGER,
    output_snippet TEXT,
    passed INTEGER NOT NULL CHECK(passed IN (0, 1)),
    ts DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Each check is an INSERT. The evidence bundle at the end is a SELECT query — not prose claims.

---

## 8. Common Gotchas

Patterns that have caused bugs in this project and should be watched for in future development:

### 8.1 CodeMirror 6: StateField vs ViewPlugin

**Rule**: Block decorations (images, frontmatter fold) MUST use `StateField.define()` with `provide: f => EditorView.decorations.from(f)`. Using `ViewPlugin` for block decorations causes:
```
Block decorations may not be specified via plugins
```

### 8.2 CodeMirror 6: Duplicate Module Instances

All CM6 modules must come from the **same CDN origin** (esm.sh). Mixing CDNs or using different version pins causes:
```
Unrecognized extension value in extension set ([object Object]).
This sometimes happens because multiple instances of @codemirror/state are loaded.
```

### 8.3 insertAdjacentHTML Missing Parentheses

When converting `innerHTML +=` to `insertAdjacentHTML('beforeend', ...)`, always verify the closing `)` is present. A missing paren causes a cryptic runtime error at a later point in the file.

### 8.4 Module-Level Observers/Listeners

`ResizeObserver`, `MutationObserver`, and event listeners created inside render functions must be:
- Stored in a module-level variable
- Disconnected/removed before recreation
- Otherwise they accumulate as memory leaks

### 8.5 Async Render Race Conditions

When a panel renders asynchronously (e.g., diary loading titles):
- Use a `renderSeq` counter
- Increment before each render
- Guard async callbacks: `if (seq !== renderSeq) return;`

### 8.6 Backend Calendar Overlap Filter

The calendar API must check event OVERLAP with the requested window, not just whether the event starts within it:
```python
# Correct: eventStart < windowEnd AND eventEnd >= windowStart
# Incorrect: windowStart <= eventStart <= windowEnd
```
Otherwise multi-day events that started before the current view disappear.

### 8.7 Windows Development

- Use `$env:NO_PROXY="*"` before any localhost HTTP calls
- Use `curl.exe` (not `curl` which may be an alias for `Invoke-WebRequest`)
- Python binary: `& C:\Users\ham5st\.conda\envs\butler_env\python.exe`
- JS syntax check: `Get-Content file.js | node --check --input-type=module`