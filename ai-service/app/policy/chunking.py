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


@dataclass(slots=True)
class StructuredChunk:
    index: int
    text: str
    section_title: str = ""
    page_number: int | None = None


def chunk_by_tokens(content: str, *, max_tokens: int = 500, overlap_tokens: int = 50) -> list[StructuredChunk]:
    """Word-based approximate token chunking with structural metadata.

    Uses a simple word count as a token proxy (no tokenizer download). Sections
    are tracked from Markdown headings and explicit ``page N`` markers so the
    embedding metadata can carry structure.
    """
    clean = redact_sensitive_text(content or "").strip()
    if not clean:
        return []
    units: list[tuple[str, str, int | None]] = []
    current_section = ""
    current_page: int | None = None
    for raw_line in clean.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        heading = re.match(r"^#{1,6}\s+(.+)$", line)
        if heading:
            current_section = heading.group(1).strip()
            continue
        page = re.search(r"\b(?:page|p\.?)\s*(\d{1,4})\b", line, re.IGNORECASE)
        if page:
            current_page = int(page.group(1))
            continue
        units.append((line, current_section, current_page))
    if not units:
        return []

    chunks: list[StructuredChunk] = []
    index = 0
    current: list[str] = []
    count = 0
    current_section = units[0][1]
    current_page = units[0][2]
    for line, section, page in units:
        if section:
            current_section = section
        if page is not None:
            current_page = page
        if count and count + 1 > max_tokens and current:
            chunks.append(
                StructuredChunk(
                    index=index,
                    text="\n".join(current).strip(),
                    section_title=current_section,
                    page_number=current_page,
                )
            )
            index += 1
            overlap = _tail_words(current, overlap_tokens)
            current = [overlap] if overlap else []
            count = len(overlap.split()) if overlap else 0
        current.append(line)
        count += len(line.split())
    if current:
        chunks.append(
            StructuredChunk(
                index=index,
                text="\n".join(current).strip(),
                section_title=current_section,
                page_number=current_page,
            )
        )
    return [chunk for chunk in chunks if chunk.text.strip()]


def _tail_words(lines: list[str], max_words: int) -> str:
    words: list[str] = []
    for line in reversed(lines):
        line_words = line.split()
        if words and len(words) + len(line_words) > max_words:
            break
        words = line_words + words
    return " ".join(words)


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
