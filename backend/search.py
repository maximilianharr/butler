"""Fast markdown search via ripgrep."""
import subprocess

from fastapi import APIRouter

from . import workspace

router = APIRouter(prefix="/api/search")

MAX_HITS = 100


def _rg(q: str, root) -> list[tuple[str, int]]:
    out = subprocess.run(
        ["rg", "-niF", "--no-heading", "--with-filename", "--line-number",
         "-g", "*.md", "--", q, "."],
        capture_output=True, text=True, cwd=root, timeout=10,
    ).stdout
    hits = []
    for line in out.splitlines()[:MAX_HITS]:
        path, num, _ = line.split(":", 2)
        hits.append((path.lstrip("./"), int(num)))
    return hits


def _python_scan(q: str, root) -> list[tuple[str, int]]:
    # ponytail: fallback if ripgrep is missing; O(all files) but workspaces are small
    q = q.lower()
    hits = []
    for p in sorted(root.rglob("*.md")):
        for i, line in enumerate(p.read_text(errors="replace").splitlines(), 1):
            if q in line.lower():
                hits.append((str(p.relative_to(root)), i))
                if len(hits) >= MAX_HITS:
                    return hits
    return hits


@router.get("")
def search(q: str):
    if not q.strip():
        return []
    root = workspace.root()
    try:
        hits = _rg(q, root)
    except OSError:
        hits = _python_scan(q, root)
    results = []
    for path, num in hits:
        lines = (root / path).read_text(errors="replace").splitlines()
        results.append({
            "path": path,
            "line": num,
            "before": lines[num - 2] if num >= 2 else "",
            "text": lines[num - 1] if num - 1 < len(lines) else "",
            "after": lines[num] if num < len(lines) else "",
        })
    return results
