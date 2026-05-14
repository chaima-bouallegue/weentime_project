from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from .policy_models import PolicySource

ALLOWED_SOURCE_TYPES = {
    "hr_policy",
    "hr_policy_markdown",
    "policy",
    "policy_markdown",
    "faq",
    "faq_markdown",
    "approved_text",
    "approved_markdown",
    "pdf_extracted_text",
}

FORBIDDEN_SOURCE_TYPES = {
    "employee",
    "employee_profile",
    "payroll",
    "salary",
    "private_document",
    "contract",
    "leave_balance",
    "attendance",
    "pointage",
    "request_status",
    "approval",
    "user",
    "role",
}

_SECRET_PATTERNS = (
    re.compile(r"authorization\s*:\s*bearer\s+[^\s]+", re.IGNORECASE),
    re.compile(r"bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", re.IGNORECASE),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{12,}|bt_[A-Za-z0-9_-]{12,})\b"),
    re.compile(r"\b(?:JWT_SECRET|AI_JWT_SECRET|BRAINTRUST_API_KEY|OPENAI_API_KEY|DATABASE_URL)\s*[:=]\s*[^\s]+", re.IGNORECASE),
)


@dataclass(slots=True)
class PolicyChunk:
    id: str
    text: str
    metadata: dict[str, object]


def is_indexable_policy_source(source: PolicySource) -> bool:
    source_type = (source.source_type or "").strip().lower()
    if not source.approved or source.tenant_id is None:
        return False
    if source_type in FORBIDDEN_SOURCE_TYPES:
        return False
    return source_type in ALLOWED_SOURCE_TYPES


def build_policy_chunks(source: PolicySource, *, max_chars: int = 900, overlap_chars: int = 120) -> list[PolicyChunk]:
    if not is_indexable_policy_source(source):
        return []
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", source.content or "") if part.strip()]
    if not paragraphs:
        paragraphs = [source.content.strip()] if source.content.strip() else []

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

    chunks: list[PolicyChunk] = []
    for index, chunk in enumerate(expanded):
        chunk_id = f"{source.id}:{index}"
        citation_label = f"{source.title}#{index + 1}"
        chunks.append(
            PolicyChunk(
                id=chunk_id,
                text=redact_sensitive_text(chunk.strip()),
                metadata={
                    "tenant_id": int(source.tenant_id),
                    "source_id": source.id,
                    "source_title": source.title,
                    "source_type": source.source_type,
                    "source_location": source.path_or_url,
                    "language": (source.language or "fr").lower(),
                    "approved": True,
                    "chunk_id": chunk_id,
                    "citation_label": citation_label,
                },
            )
        )
    return chunks


def redact_sensitive_text(text: str) -> str:
    value = text or ""
    for pattern in _SECRET_PATTERNS:
        value = pattern.sub("[REDACTED]", value)
    return value


def iter_indexable_chunks(sources: Iterable[PolicySource]) -> list[PolicyChunk]:
    chunks: list[PolicyChunk] = []
    for source in sources:
        chunks.extend(build_policy_chunks(source))
    return chunks
