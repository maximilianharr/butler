"""Flipcard: card pairs (flipcard-N-question.md / flipcard-N-answer.md) with topics."""
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import frontmatter, workspace

router = APIRouter(prefix="/api/flipcard")


def _dir():
    return workspace.root() / "flipcard"


def _cards() -> dict[int, dict]:
    cards = {}
    for p in sorted(_dir().glob("flipcard-*-*.md")):
        m = re.match(r"flipcard-(\d+)-(question|answer)\.md", p.name)
        if not m:
            continue
        meta, body = frontmatter.parse(p.read_text())
        card = cards.setdefault(int(m[1]), {"id": int(m[1])})
        card[m[2]] = body.strip()
        card["topic"] = meta.get("topic", "")
    return cards


@router.get("/cards")
def cards():
    return sorted(_cards().values(), key=lambda c: c["id"])


@router.get("/topics")
def topics():
    return sorted({c["topic"] for c in _cards().values() if c.get("topic")})


class NewCard(BaseModel):
    topic: str
    question: str
    answer: str


@router.post("/cards")
def create(card: NewCard):
    d = _dir()
    d.mkdir(exist_ok=True)
    next_id = max(_cards().keys(), default=0) + 1
    for kind, body in (("question", card.question), ("answer", card.answer)):
        text = frontmatter.dump({"topic": card.topic}, body.strip() + "\n")
        (d / f"flipcard-{next_id}-{kind}.md").write_text(text)
    return {"id": next_id}


class Rename(BaseModel):
    old: str
    new: str


@router.post("/topics/rename")
def rename(r: Rename):
    if not r.new.strip():
        raise HTTPException(400, "empty topic")
    changed = 0
    for p in _dir().glob("flipcard-*-*.md"):
        meta, body = frontmatter.parse(p.read_text())
        if meta.get("topic") == r.old:
            meta["topic"] = r.new
            p.write_text(frontmatter.dump(meta, body))
            changed += 1
    return {"changed": changed}
