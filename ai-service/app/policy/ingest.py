from __future__ import annotations

from dataclasses import dataclass, field

from .policy_store import LocalPolicyStore
from .source_registry import iter_approved_sources, iter_indexable_chunks


@dataclass(slots=True)
class IngestionResult:
    indexed_chunks: int = 0
    skipped_sources: int = 0
    tenant_id: int | None = None
    indexed_source_ids: list[str] = field(default_factory=list)
    skipped_source_ids: list[str] = field(default_factory=list)


def ingest_approved_sources(retriever: object, store: LocalPolicyStore, *, tenant_id: int) -> IngestionResult:
    """Index approved local policy/FAQ sources into a vector retriever.

    Live HR tables, payroll rows, uploaded private documents, users, roles, and
    mutable request state are intentionally excluded. The retriever is duck-typed
    so tests can exercise ingestion without importing or running ChromaDB.
    """

    sources = store.list_sources(tenant_id=tenant_id, approved_only=True)
    approved_sources = iter_approved_sources(sources)
    chunks = iter_indexable_chunks(sources)
    indexed_source_ids = sorted({str(chunk.metadata.get("source_id")) for chunk in chunks if chunk.metadata.get("source_id")})
    approved_source_ids = {source.source_id for source in approved_sources}
    all_source_ids = {source.id for source in sources}
    skipped_source_ids = sorted((all_source_ids - approved_source_ids) | (approved_source_ids - set(indexed_source_ids)))
    indexed_count = 0
    if chunks and hasattr(retriever, "index_chunks"):
        indexed_count = int(retriever.index_chunks(chunks) or 0)
    return IngestionResult(
        indexed_chunks=indexed_count,
        skipped_sources=len(skipped_source_ids),
        tenant_id=tenant_id,
        indexed_source_ids=indexed_source_ids,
        skipped_source_ids=skipped_source_ids,
    )
