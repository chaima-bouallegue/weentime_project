from __future__ import annotations

from pathlib import Path

import pytest

from app.policy.chromadb_retriever import ChromaPolicyRetriever
from app.policy.policy_store import LocalPolicyStore

chromadb = pytest.importorskip("chromadb")


def _retriever(tmp_path: Path, collection, client) -> ChromaPolicyRetriever:
    return ChromaPolicyRetriever(LocalPolicyStore(tmp_path), collection=collection, client=client)


def test_tenant_a_never_returns_tenant_b_chunk_with_real_chroma(tmp_path: Path) -> None:
    client = chromadb.EphemeralClient()
    collection = client.create_collection(name="iso_a_vs_b", embedding_function=None)
    collection.add(
        ids=["a:0", "b:0"],
        embeddings=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        metadatas=[
            {"entreprise_id": 1, "approved": True, "source_id": "a", "source_title": "Tenant A"},
            {"entreprise_id": 99, "approved": True, "source_id": "b", "source_title": "Tenant B"},
        ],
    )
    retriever = _retriever(tmp_path, collection, client)

    result = retriever.search(
        query="tenant A content",
        tenant_id=1,
        limit=3,
        query_embeddings=[[1.0, 0.0, 0.0]],
    )

    assert result.tenant_id == 1
    assert [citation.source_id for citation in result.citations] == ["a"]


def test_score_threshold_filters_low_similarity_chunks_with_real_chroma(tmp_path: Path) -> None:
    client = chromadb.EphemeralClient()
    collection = client.create_collection(name="iso_threshold", embedding_function=None)
    collection.add(
        ids=["a:0", "far:0"],
        embeddings=[[1.0, 0.0, 0.0], [0.0, 0.0, 1.0]],
        metadatas=[
            {"entreprise_id": 1, "approved": True, "source_id": "a", "source_title": "Close"},
            {"entreprise_id": 1, "approved": True, "source_id": "far", "source_title": "Far"},
        ],
    )
    retriever = _retriever(tmp_path, collection, client)

    result = retriever.search(
        query="matching chunk",
        tenant_id=1,
        limit=3,
        query_embeddings=[[1.0, 0.0, 0.0]],
    )

    assert [citation.source_id for citation in result.citations] == ["a"]
    assert all(citation.score >= 0.7 for citation in result.citations)
