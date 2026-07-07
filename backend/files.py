"""Core file API over the markdown workspace."""
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import workspace

router = APIRouter(prefix="/api/files")

HIDDEN = {".git"}


def git_status() -> dict[str, str]:
    """Map workspace-relative path -> 'new' | 'modified'."""
    ws = str(workspace.root())
    try:
        # paths in porcelain output are repo-root-relative; strip the prefix
        # in case the workspace is a subdirectory of the repo
        prefix = subprocess.run(
            ["git", "-C", ws, "rev-parse", "--show-prefix"],
            capture_output=True, text=True, timeout=10,
        ).stdout.strip()
        out = subprocess.run(
            ["git", "-C", ws, "status", "--porcelain", "."],
            capture_output=True, text=True, timeout=10,
        ).stdout
    except OSError:
        return {}
    status = {}
    for line in out.splitlines():
        code, path = line[:2], line[3:].strip().strip('"')
        path = path.removeprefix(prefix).rstrip("/")
        status[path] = "new" if code == "??" else "modified"
    return status


def _status_for(rel: str, status: dict[str, str]) -> str | None:
    # untracked dirs appear once in porcelain output; inherit for children
    parts = rel.split("/")
    for i in range(len(parts), 0, -1):
        s = status.get("/".join(parts[:i]))
        if s:
            return s
    return None


def _md_title(path) -> str | None:
    try:
        for line in path.read_text(errors="replace").splitlines()[:50]:
            if line.startswith("# "):
                return line[2:].strip()
    except OSError:
        pass
    return None


def _tree(dir_path, rel: str, status: dict[str, str]) -> list[dict]:
    items = []
    for p in sorted(dir_path.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        if p.name in HIDDEN:
            continue
        child_rel = f"{rel}/{p.name}" if rel else p.name
        node = {"name": p.name, "path": child_rel}
        if p.is_dir():
            node["children"] = _tree(p, child_rel, status)
        else:
            node["status"] = _status_for(child_rel, status)
            if p.suffix == ".md":
                node["title"] = _md_title(p)
        items.append(node)
    return items


@router.get("/tree")
def tree(path: str = ""):
    base = workspace.safe_path(path)
    if not base.is_dir():
        raise HTTPException(404, "not a directory")
    return _tree(base, path.strip("/"), git_status())


@router.get("/read")
def read(path: str):
    p = workspace.safe_path(path)
    if not p.is_file():
        raise HTTPException(404, "not found")
    return {"path": path, "content": p.read_text(errors="replace")}


class WriteBody(BaseModel):
    path: str
    content: str


@router.put("/write")
def write(body: WriteBody):
    p = workspace.safe_path(body.path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(body.content)
    return {"ok": True}


@router.post("/upload")
async def upload(file: UploadFile, dir: str = ""):
    ext = ("." + file.filename.rsplit(".", 1)[1]) if file.filename and "." in file.filename else ""
    name = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + ext
    p = workspace.safe_path(f"{dir}/{name}")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(await file.read())
    return {"path": f"{dir.strip('/')}/{name}".lstrip("/"), "name": name}


@router.get("/raw")
def raw(path: str):
    p = workspace.safe_path(path)
    if not p.is_file():
        raise HTTPException(404, "not found")
    return FileResponse(p)


@router.delete("")
def delete(path: str):
    p = workspace.safe_path(path)
    if not p.is_file():
        raise HTTPException(404, "not found")
    p.unlink()
    return {"ok": True}
