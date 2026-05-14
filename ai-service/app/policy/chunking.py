from __future__ import annotations

import re
from dataclasses import dataclass

_SECRET_PATTERNS = (
    re.compile(r"authorization\s*:\s*bearer\s+[^\s]+", re.IGNORECASE),
    re.compile(r"bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", re.IGNORECASE),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{12,}|bt_[A-Za-z0-9_-]{12,})\b"),
    re.compile(r"\b(?:JWT_SECRET|AI_JWT_SECRET|BRAINTRUST_API_KEY|OPENAI_API_KEY|DATABASE_URL)\s*[:=]\s*[^\s]+", re.IGNORECASE),
    re.compile(r"\b(?:api[_-]?key|password|passwd|pwd)\s*[:=]\s*[^\s]+", re.IGNORECASE),
    re.compile(r"\b(?:postgresql|postgres|mysql|mariadb|mongodb)://[^\s]+", re.IGNORECASE),
)


@dataclass(slots=True)
class TextChunk:
    index: int
    text: str


def chunk_text(content: str, *, max_chars: int = 900, overlap_chars: int = 120) -> list[TextChunk]:
    clean = redact_sensitive_text(content or "").strip()
    if not clean:
        return []
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", clean) if part.strip()]
    if not paragraphs:
        paragraphs = [clean]

    raw_chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if not current:
            current = paragraph
            continue
        if len(current) + 2 + len(paragraph) <= max_chars:
            current = f"{current}\n\n{paragraph}"
        else:
            raw_chunks.append(current)
            current = paragraph
    if current:
        raw_chunks.append(current)

    expanded: list[str] = []
    for chunk in raw_chunks:
        if len(chunk) <= max_chars:
            expanded.append(chunk)
            continue
        start = 0
        step = max(1, max_chars - overlap_chars)
        while start < len(chunk):
            expanded.append(chunk[start : start + max_chars])
            start += step

    return [TextChunk(index=index, text=chunk.strip()) for index, chunk in enumerate(expanded) if chunk.strip()]


def redact_sensitive_text(text: str) -> str:
    value = text or ""
    for pattern in _SECRET_PATTERNS:
        value = pattern.sub("[REDACTED]", value)
    return value
