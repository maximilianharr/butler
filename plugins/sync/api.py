"""Sync: save workspace to git and push to remote."""
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter

from backend import workspace

router = APIRouter(prefix="/api/sync")


def _git(*args) -> str:
    r = subprocess.run(["git", "-C", str(workspace.root()), *args],
                       capture_output=True, text=True, timeout=60)
    return (r.stdout + r.stderr).strip()


@router.get("/status")
def status():
    return {"status": _git("status", "--short", "--branch")}


@router.post("")
def sync():
    out = [_git("add", "-A")]
    out.append(_git("commit", "-m", f"butler sync {datetime.now(timezone.utc).isoformat(timespec='seconds')}"))
    out.append(_git("push"))
    return {"output": "\n".join(o for o in out if o)}
