"""Sync router – git operations for workspace synchronization."""

import asyncio
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

_git_lock = asyncio.Lock()


def _workspace() -> Path:
    from ..main import WORKSPACE
    return WORKSPACE


def _run_git(*args: str, check: bool = False) -> subprocess.CompletedProcess:
    """Run a git command in the workspace directory."""
    ws = _workspace()
    return subprocess.run(
        ["git"] + list(args),
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(ws),
    )


@router.get("/status")
async def git_status():
    """Return structured git status information."""
    ws = _workspace()

    # Check if it's a git repo
    result = _run_git("rev-parse", "--is-inside-work-tree")
    if result.returncode != 0:
        return {"is_repo": False, "message": "Workspace is not a git repository"}

    # Branch
    branch = _run_git("rev-parse", "--abbrev-ref", "HEAD")
    branch_name = branch.stdout.strip() if branch.returncode == 0 else "unknown"

    # Status
    status = _run_git("status", "--porcelain", "-uall")
    files: list[dict] = []
    for line in status.stdout.splitlines():
        if len(line) < 4:
            continue
        st = line[:2].strip()
        path = line[3:]
        files.append({"path": path, "status": st})

    # Remote tracking
    has_remote = False
    ahead = 0
    behind = 0
    remote_result = _run_git("rev-parse", "--abbrev-ref", "@{upstream}")
    if remote_result.returncode == 0:
        has_remote = True
        ab = _run_git("rev-list", "--left-right", "--count", "@{upstream}...HEAD")
        if ab.returncode == 0:
            parts = ab.stdout.strip().split()
            if len(parts) == 2:
                behind = int(parts[0])
                ahead = int(parts[1])

    return {
        "is_repo": True,
        "branch": branch_name,
        "has_remote": has_remote,
        "ahead": ahead,
        "behind": behind,
        "files": files,
        "clean": len(files) == 0,
    }


class CommitBody(BaseModel):
    message: str = "Butler sync"


@router.post("/save")
async def git_save(body: CommitBody):
    """Stage all changes and commit."""
    async with _git_lock:
        add = _run_git("add", "-A")
        if add.returncode != 0:
            raise HTTPException(500, f"git add failed: {add.stderr}")

        # Check if there's anything to commit
        diff = _run_git("diff", "--cached", "--quiet")
        if diff.returncode == 0:
            return {"ok": True, "message": "Nothing to commit", "committed": False}

        commit = _run_git("commit", "-m", body.message)
        if commit.returncode != 0:
            raise HTTPException(500, f"git commit failed: {commit.stderr}")

        return {"ok": True, "message": commit.stdout.strip(), "committed": True}


@router.post("/push")
async def git_push():
    """Push to remote."""
    async with _git_lock:
        result = _run_git("push")
        if result.returncode != 0:
            raise HTTPException(500, f"git push failed: {result.stderr}")
        return {"ok": True, "message": result.stdout.strip() or "Pushed successfully"}


@router.post("/pull")
async def git_pull():
    """Pull from remote (rebase to avoid merge commits)."""
    async with _git_lock:
        # Check for uncommitted changes first
        status = _run_git("status", "--porcelain")
        dirty_files = [l for l in status.stdout.splitlines() if l.strip()]
        if dirty_files:
            raise HTTPException(
                409,
                "Cannot pull: workspace has uncommitted changes. Save first.",
            )

        result = _run_git("pull", "--rebase")
        if result.returncode != 0:
            stderr = result.stderr
            if "CONFLICT" in stderr or "conflict" in result.stdout:
                # Abort the rebase so we don't leave the repo in a bad state
                _run_git("rebase", "--abort")
                raise HTTPException(
                    409,
                    "Pull encountered merge conflicts. Rebase aborted. "
                    "Please resolve manually or commit your changes first.",
                )
            raise HTTPException(500, f"git pull failed: {stderr}")

        return {"ok": True, "message": result.stdout.strip() or "Pulled successfully"}
