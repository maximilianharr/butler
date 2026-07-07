"""PDF: upload + text extraction (pdftotext, tesseract OCR fallback) + thumbnails."""
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, UploadFile
from fastapi.responses import FileResponse

from backend import frontmatter, workspace

router = APIRouter(prefix="/api/pdf")


def _dir():
    return workspace.root() / "pdf"


def extract_text(pdf: Path) -> str:
    text = subprocess.run(["pdftotext", str(pdf), "-"], capture_output=True, text=True, timeout=120).stdout.strip()
    if text:
        return text
    if shutil.which("tesseract") and shutil.which("pdftoppm"):
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["pdftoppm", "-png", "-r", "200", str(pdf), f"{tmp}/p"], timeout=300, check=True)
            pages = []
            for png in sorted(Path(tmp).glob("p*.png")):
                r = subprocess.run(["tesseract", str(png), "-"], capture_output=True, text=True, timeout=300)
                pages.append(r.stdout.strip())
            return "\n\n".join(p for p in pages if p)
    return "(no text layer found and no OCR tool installed — install tesseract-ocr)"


def process(pdf: Path, stamp: str) -> str:
    """Write the markdown twin for a pdf; returns md path relative to workspace."""
    meta = {"time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "file": f"./resources/{pdf.name}"}
    md = _dir() / f"{stamp}.md"
    md.write_text(frontmatter.dump(meta, extract_text(pdf) + "\n"))
    return f"pdf/{md.name}"


@router.get("/list")
def list_pdfs():
    """Recent first: [{stamp, pdf, md}]."""
    pdfs = {p.stem for p in (_dir() / "resources").glob("*.pdf")}
    mds = {p.stem for p in _dir().glob("*.md")}
    out = []
    for stamp in sorted(pdfs | mds, reverse=True):
        out.append({"stamp": stamp,
                    "pdf": f"pdf/resources/{stamp}.pdf" if stamp in pdfs else None,
                    "md": f"pdf/{stamp}.md" if stamp in mds else None})
    return out


@router.post("/upload")
async def upload(file: UploadFile):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    res = _dir() / "resources"
    res.mkdir(parents=True, exist_ok=True)
    pdf = res / f"{stamp}.pdf"
    pdf.write_bytes(await file.read())
    md = process(pdf, stamp)
    return {"pdf": f"pdf/resources/{pdf.name}", "md": md}


@router.post("/process")
def process_all():
    """OCR any pdf dropped into the folder that has no markdown twin yet."""
    done = []
    for p in (_dir() / "resources").glob("*.pdf"):
        if not (_dir() / f"{p.stem}.md").exists():
            done.append(process(p, p.stem))
    return {"processed": done}


@router.get("/thumb")
def thumb(stamp: str):
    """First-page thumbnail, cached next to the pdf."""
    safe = workspace.safe_path(f"pdf/resources/{stamp}.pdf")
    cache = safe.parent / ".thumbs"
    png = cache / f"{stamp}.png"
    if not png.exists() and safe.exists():
        cache.mkdir(exist_ok=True)
        subprocess.run(["pdftoppm", "-png", "-f", "1", "-l", "1", "-scale-to", "300",
                        str(safe), str(cache / stamp)], timeout=60)
        gen = sorted(cache.glob(f"{stamp}-*.png")) or sorted(cache.glob(f"{stamp}*.png"))
        if gen:
            gen[0].rename(png)
    return FileResponse(png) if png.exists() else FileResponse(safe)
