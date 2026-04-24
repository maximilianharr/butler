"""Files router – browse, read, write, create, delete, rename files."""

import asyncio
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_write_lock = asyncio.Lock()


def _workspace() -> Path:
    from ..main import WORKSPACE
    return WORKSPACE


def _safe_path(relative: str) -> Path:
    """Resolve *relative* under the workspace and reject escapes."""
    ws = _workspace()
    target = (ws / relative).resolve()
    try:
        target.relative_to(ws)
    except ValueError:
        raise HTTPException(status_code=403, detail="Path escapes workspace")
    return target


def _git_status_map() -> dict[str, str]:
    """Return {relative_path: status_letter} for the workspace git repo."""
    import subprocess

    ws = _workspace()
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain", "-uall"],
            capture_output=True, text=True, timeout=10,
            cwd=str(ws),
        )
        mapping: dict[str, str] = {}
        for line in result.stdout.splitlines():
            if len(line) < 4:
                continue
            status = line[:2].strip()
            path = line[3:]
            mapping[path] = status
        return mapping
    except Exception:
        return {}


def _build_tree(directory: Path, ws: Path, git_map: dict[str, str], depth: int = 0) -> list[dict]:
    """Build a directory tree (one level deep per call for lazy loading)."""
    entries = []
    try:
        children = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        return entries

    for child in children:
        if child.name.startswith("."):
            continue
        rel = child.relative_to(ws).as_posix()
        entry: dict = {
            "name": child.name,
            "path": rel,
            "is_dir": child.is_dir(),
        }
        if child.is_dir():
            if depth < 1:
                entry["children"] = _build_tree(child, ws, git_map, depth + 1)
            else:
                entry["children"] = None  # signal "expandable"
        else:
            git_st = git_map.get(rel, "")
            if "?" in git_st:
                entry["git_status"] = "untracked"
            elif git_st:
                entry["git_status"] = "modified"
            else:
                entry["git_status"] = "clean"

            # Extract first markdown title if .md
            if child.suffix.lower() == ".md":
                try:
                    for line in child.read_text(encoding="utf-8", errors="replace").splitlines():
                        stripped = line.strip()
                        if stripped.startswith("# ") and not stripped.startswith("##"):
                            entry["title"] = stripped[2:].strip()
                            break
                except Exception:
                    pass
        entries.append(entry)
    return entries

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/tree")
async def file_tree(path: Optional[str] = Query(None, description="Subdirectory to list")):
    """Return the directory tree (lazy: one level deep unless root)."""
    ws = _workspace()
    target = _safe_path(path) if path else ws
    if not target.is_dir():
        raise HTTPException(404, "Not a directory")
    git_map = _git_status_map()
    tree = _build_tree(target, ws, git_map, depth=0)
    return {"path": str(target.relative_to(ws)), "children": tree}


@router.get("/read")
async def read_file(path: str = Query(...)):
    """Read a file and return its content."""
    target = _safe_path(path)
    if not target.exists():
        raise HTTPException(404, "File not found")
    if not target.is_file():
        raise HTTPException(400, "Not a file")
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "Binary file – cannot read as text")
    return {"path": path, "content": content}


class WriteBody(BaseModel):
    path: str
    content: str


@router.post("/write")
async def write_file(body: WriteBody):
    """Atomically write content to an existing file."""
    target = _safe_path(body.path)
    if not target.parent.exists():
        raise HTTPException(404, "Parent directory does not exist")
    async with _write_lock:
        tmp = target.with_suffix(target.suffix + ".tmp")
        try:
            tmp.write_text(body.content, encoding="utf-8")
            tmp.replace(target)
        except Exception as exc:
            tmp.unlink(missing_ok=True)
            raise HTTPException(500, str(exc))
    return {"ok": True, "path": body.path}


class CreateBody(BaseModel):
    path: str
    content: str = ""
    is_dir: bool = False


@router.post("/create")
async def create_file(body: CreateBody):
    """Create a new file or directory."""
    target = _safe_path(body.path)
    if target.exists():
        raise HTTPException(409, "Already exists")
    async with _write_lock:
        if body.is_dir:
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(body.content, encoding="utf-8")
    return {"ok": True, "path": body.path}


@router.delete("/delete")
async def delete_file(path: str = Query(...)):
    """Delete a file or directory (cannot delete workspace root)."""
    if not path or path in (".", "/", "\\"):
        raise HTTPException(400, "Cannot delete workspace root")
    target = _safe_path(path)
    if target == _workspace():
        raise HTTPException(400, "Cannot delete workspace root")
    if not target.exists():
        raise HTTPException(404, "Not found")
    async with _write_lock:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
    return {"ok": True}


class RenameBody(BaseModel):
    old_path: str
    new_path: str


@router.post("/rename")
async def rename_file(body: RenameBody):
    """Rename / move a file or directory."""
    src = _safe_path(body.old_path)
    dst = _safe_path(body.new_path)
    if not src.exists():
        raise HTTPException(404, "Source not found")
    if dst.exists():
        raise HTTPException(409, "Destination already exists")
    async with _write_lock:
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)
    return {"ok": True, "old_path": body.old_path, "new_path": body.new_path}


class DuplicateBody(BaseModel):
    path: str


@router.post("/duplicate")
async def duplicate_file(body: DuplicateBody):
    """Duplicate a file or directory, appending '-copy' to the name."""
    src = _safe_path(body.path)
    if not src.exists():
        raise HTTPException(404, "Source not found")
    name = src.stem
    suffix = src.suffix
    dst = src.parent / f"{name}-copy{suffix}"
    counter = 2
    while dst.exists():
        dst = src.parent / f"{name}-copy-{counter}{suffix}"
        counter += 1
    async with _write_lock:
        if src.is_dir():
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    return {"ok": True, "new_path": dst.relative_to(_workspace()).as_posix()}


@router.get("/raw")
async def raw_file(path: str = Query(...)):
    """Serve a raw file from the workspace (images, PDFs, etc.)."""
    from fastapi.responses import FileResponse
    target = _safe_path(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(target)


@router.post("/upload-image")
async def upload_image(
    plugin: str = Query(..., description="Plugin folder name for storing the image"),
    file: UploadFile = File(...),
):
    """Upload an image, store it in the plugin's workspace subfolder."""
    ws = _workspace()

    ext = Path(file.filename or "img.png").suffix or ".png"
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    name = f"{ts}{ext}"
    dest = _safe_path(f"{plugin}/{name}")  # validate BEFORE mkdir
    dest.parent.mkdir(parents=True, exist_ok=True)

    async with _write_lock:
        data = await file.read()
        dest.write_bytes(data)

    rel = dest.relative_to(ws).as_posix()
    return {"ok": True, "path": rel, "filename": name}
