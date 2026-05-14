from __future__ import annotations

from dataclasses import dataclass

from .policy_store import LocalPolicyStore
from .source_registry import iter_indexable_chunks


@dataclass(slots=True)
class IngestionResult:
    indexed_chunks: int = 0
    skipped_sources: int = 0
    tenant_id: int | None = None


def ingest_approved_sources(retriever: object, store: LocalPolicyStore, *, tenant_id: int) -> IngestionResult:
    """Index approved local policy/FAQ sources into a vector retriever.

    The retriever is intentionally duck-typed so tests can use a fake vector store
    without importing ChromaDB. Live HR tables and private documents are never read
    here; only LocalPolicyStore sources already marked as approved are considered.
    """

    sources = store.list_sources(tenant_id=tenant_id, approved_only=True)
    chunks = iter_indexable_chunks(sources)
    skipped = max(0, len(sources) - len({str(chunk.metadata.get("source_id")) for chunk in chunks}))
    if chunks and hasattr(retriever, "index_chunks"):
        retriever.index_chunks(chunks)
    return IngestionResult(indexed_chunks=len(chunks), skipped_sources=skipped, tenant_id=tenant_id)
