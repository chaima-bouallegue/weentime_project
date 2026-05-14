from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from .policy_models import PolicySource
from .policy_store import LocalPolicyStore
from .source_registry import iter_approved_sources, iter_indexable_chunks


@dataclass(slots=True)
class IngestionResult:
    files_scanned: int = 0
    approved_sources: int = 0
    prepared_chunks: int = 0
    indexed_chunks: int = 0
    skipped_sources: int = 0
    tenant_id: int | None = None
    indexed_source_ids: list[str] = field(default_factory=list)
    skipped_source_ids: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    dry_run: bool = False


def ingest_approved_sources(retriever: object, store: LocalPolicyStore, *, tenant_id: int) -> IngestionResult:
    """Compatibility wrapper that commits approved LocalPolicyStore sources."""

    return ingest_policy_sources(retriever, store.list_sources(tenant_id=tenant_id, approved_only=True), tenant_id=tenant_id, commit=True)


def ingest_policy_sources(
    retriever: object,
    sources: Iterable[PolicySource],
    *,
    tenant_id: int,
    commit: bool = False,
    warnings: list[str] | None = None,
    files_scanned: int | None = None,
) -> IngestionResult:
    """Prepare or index approved local policy/FAQ sources.

    Live HR tables, payroll rows, uploaded private documents, users, roles, and
    mutable request state are intentionally excluded. `commit=False` is the safe
    dry-run path and never writes to ChromaDB.
    """

    source_list = [source for source in sources if source.tenant_id == int(tenant_id)]
    approved_sources = iter_approved_sources(source_list)
    chunks = iter_indexable_chunks(source_list)
    prepared_source_ids = sorted({str(chunk.metadata.get("source_id")) for chunk in chunks if chunk.metadata.get("source_id")})
    approved_source_ids = {source.source_id for source in approved_sources}
    all_source_ids = {source.id for source in source_list}
    skipped_source_ids = sorted((all_source_ids - approved_source_ids) | (approved_source_ids - set(prepared_source_ids)))
    indexed_count = 0
    if commit and chunks and hasattr(retriever, "index_chunks"):
        indexed_count = int(retriever.index_chunks(chunks) or 0)
    scanned_count = files_scanned if files_scanned is not None else len(source_list)
    skipped_count = max(len(skipped_source_ids), scanned_count - len(approved_sources))
    return IngestionResult(
        files_scanned=scanned_count,
        approved_sources=len(approved_sources),
        prepared_chunks=len(chunks),
        indexed_chunks=indexed_count,
        skipped_sources=skipped_count,
        tenant_id=tenant_id,
        indexed_source_ids=prepared_source_ids if indexed_count or not commit else [],
        skipped_source_ids=skipped_source_ids,
        warnings=list(warnings or []),
        dry_run=not commit,
    )
