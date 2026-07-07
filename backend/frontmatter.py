"""Split/join YAML frontmatter on markdown text."""
import yaml


def parse(text: str) -> tuple[dict, str]:
    """Return (meta, body). Missing/broken frontmatter -> ({}, text)."""
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            try:
                meta = yaml.safe_load(parts[1]) or {}
                if isinstance(meta, dict):
                    return meta, parts[2].lstrip("\n")
            except yaml.YAMLError:
                pass
    return {}, text


def dump(meta: dict, body: str) -> str:
    if not meta:
        return body
    return "---\n" + yaml.safe_dump(meta, sort_keys=False, allow_unicode=True) + "---\n\n" + body
