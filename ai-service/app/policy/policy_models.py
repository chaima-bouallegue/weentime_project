from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(slots=True)
class PolicySource:
    id: str
    tenant_id: int | None
    title: str
    source_type: str
    path_or_url: str
    language: str
    approved: bool
    updated_at: str | None = None
    content: str = ""
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class PolicyCitation:
    source_id: str
    title: str
    excerpt: str
    score: float
    location: str | None = None
    chunk_id: str | None = None
    citation_label: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "sourceId": self.source_id,
            "title": self.title,
            "excerpt": self.excerpt,
            "score": self.score,
            "location": self.location,
            "chunkId": self.chunk_id,
            "citationLabel": self.citation_label,
        }


@dataclass(slots=True)
class PolicySearchResult:
    query: str
    tenant_id: int | None
    citations: list[PolicyCitation]
    provider: str = "local_keyword"
    fallback_used: bool = False
    top_k: int | None = None
    tenant_filter_applied: bool = False
    error_type: str | None = None
    error_message: str | None = None
    generated_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def policy_available(self) -> bool:
        return bool(self.citations)
