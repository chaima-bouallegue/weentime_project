from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .chunking import chunk_text, redact_sensitive_text
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
    "fixture",
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


@dataclass(slots=True)
class ApprovedPolicySource:
    source_id: str
    tenant_id: int
    title: str
    language: str
    source_type: str
    approved: bool
    path: str
    citation_label: str
    content: str


@dataclass(slots=True)
class PolicyChunk:
    id: str
    text: str
    metadata: dict[str, object]


def approved_source_from_policy_source(source: PolicySource) -> ApprovedPolicySource | None:
    if not is_indexable_policy_source(source):
        return None
    assert source.tenant_id is not None  # guarded by is_indexable_policy_source
    source_id = str(source.id).strip()
    title = str(source.title or source_id).strip()
    path = str(source.path_or_url or source.metadata.get("path") or source_id).strip()
    return ApprovedPolicySource(
        source_id=source_id,
        tenant_id=int(source.tenant_id),
        title=title,
        language=(source.language or "fr").lower(),
        source_type=(source.source_type or "hr_policy").lower(),
        approved=True,
        path=path,
        citation_label=str(source.metadata.get("citation_label") or title).strip(),
        content=source.content or "",
    )


def is_indexable_policy_source(source: PolicySource) -> bool:
    source_type = (source.source_type or "").strip().lower()
    if not source.approved or source.tenant_id is None:
        return False
    if source_type in FORBIDDEN_SOURCE_TYPES:
        return False
    if source_type not in ALLOWED_SOURCE_TYPES:
        return False
    suffix = Path(str(source.path_or_url or "")).suffix.lower()
    if suffix and suffix not in {".md", ".txt", ".json", ".pdf"}:
        return False
    return bool((source.content or "").strip())


def build_policy_chunks(source: PolicySource, *, max_chars: int = 900, overlap_chars: int = 120) -> list[PolicyChunk]:
    approved_source = approved_source_from_policy_source(source)
    if approved_source is None:
        return []
    chunks: list[PolicyChunk] = []
    for chunk in chunk_text(approved_source.content, max_chars=max_chars, overlap_chars=overlap_chars):
        chunk_id = f"{approved_source.source_id}:{chunk.index}"
        citation_label = f"{approved_source.citation_label}#{chunk.index + 1}"
        chunks.append(
            PolicyChunk(
                id=chunk_id,
                text=chunk.text,
                metadata={
                    "tenant_id": approved_source.tenant_id,
                    "source_id": approved_source.source_id,
                    "source_title": approved_source.title,
                    "source_type": approved_source.source_type,
                    "source_location": approved_source.path,
                    "language": approved_source.language,
                    "approved": True,
                    "chunk_id": chunk_id,
                    "chunk_index": chunk.index,
                    "citation_label": citation_label,
                },
            )
        )
    return chunks


def iter_approved_sources(sources: Iterable[PolicySource]) -> list[ApprovedPolicySource]:
    approved: list[ApprovedPolicySource] = []
    for source in sources:
        item = approved_source_from_policy_source(source)
        if item is not None:
            approved.append(item)
    return approved


def iter_indexable_chunks(sources: Iterable[PolicySource]) -> list[PolicyChunk]:
    chunks: list[PolicyChunk] = []
    for source in sources:
        chunks.extend(build_policy_chunks(source))
    return chunks
