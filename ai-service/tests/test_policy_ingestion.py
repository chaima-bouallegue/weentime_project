from __future__ import annotations

from pathlib import Path

from app.policy.chromadb_retriever import ChromaPolicyRetriever
from app.policy.ingest import ingest_approved_sources
from app.policy.policy_models import PolicySource
from app.policy.policy_store import LocalPolicyStore
from app.policy.source_registry import build_policy_chunks, iter_approved_sources


class FakeCollection:
    def __init__(self) -> None:
        self.upserts: list[dict] = []

    def upsert(self, **kwargs):
        self.upserts.append(kwargs)


class FakeClient:
    def __init__(self, collection: FakeCollection) -> None:
        self.collection = collection

    def get_or_create_collection(self, **kwargs):
        return self.collection


def write_source(path: Path, payload: str) -> None:
    path.write_text(payload, encoding="utf-8")


def test_approved_source_ingested(tmp_path: Path) -> None:
    write_source(
        tmp_path / "policy.md",
        """---
id: leave-policy
tenant_id: 42
title: Leave Policy
language: en
source_type: hr_policy
approved: true
citation_label: Leave Policy
---
Employees must submit leave requests before the planned absence.
""",
    )
    collection = FakeCollection()
    retriever = ChromaPolicyRetriever(LocalPolicyStore(tmp_path), client=FakeClient(collection), embedding_function=object())

    result = ingest_approved_sources(retriever, LocalPolicyStore(tmp_path), tenant_id=42)

    assert result.indexed_chunks == 1
    assert result.indexed_source_ids == ["leave-policy"]
    assert collection.upserts
    upsert = collection.upserts[0]
    assert upsert["ids"] == ["leave-policy:0"]
    assert upsert["metadatas"][0]["tenant_id"] == 42
    assert upsert["metadatas"][0]["approved"] is True
    assert upsert["metadatas"][0]["citation_label"] == "Leave Policy#1"


def test_unapproved_source_skipped(tmp_path: Path) -> None:
    write_source(
        tmp_path / "draft.md",
        """---
id: draft-policy
tenant_id: 42
title: Draft
language: fr
source_type: hr_policy
approved: false
---
Draft content should not be indexed.
""",
    )
    collection = FakeCollection()
    retriever = ChromaPolicyRetriever(LocalPolicyStore(tmp_path), client=FakeClient(collection), embedding_function=object())

    result = ingest_approved_sources(retriever, LocalPolicyStore(tmp_path), tenant_id=42)

    assert result.indexed_chunks == 0
    assert collection.upserts == []


def test_source_registry_requires_approved_policy_metadata() -> None:
    source = PolicySource(
        id="private-contract",
        tenant_id=42,
        title="Private contract",
        source_type="contract",
        path_or_url="contract.txt",
        language="fr",
        approved=True,
        content="This is not approved policy corpus material.",
    )

    assert iter_approved_sources([source]) == []
    assert build_policy_chunks(source) == []


def test_chunk_metadata_contains_required_citation_fields() -> None:
    source = PolicySource(
        id="faq-1",
        tenant_id=42,
        title="FAQ RH",
        source_type="faq",
        path_or_url="faq.md",
        language="fr",
        approved=True,
        content="Question: conge maladie? Reponse: fournir un certificat.",
        metadata={"citation_label": "FAQ RH"},
    )

    chunks = build_policy_chunks(source)

    assert len(chunks) == 1
    metadata = chunks[0].metadata
    assert metadata["source_id"] == "faq-1"
    assert metadata["source_title"] == "FAQ RH"
    assert metadata["chunk_id"] == "faq-1:0"
    assert metadata["citation_label"] == "FAQ RH#1"
    assert metadata["approved"] is True


def test_secret_like_text_is_not_indexed(tmp_path: Path) -> None:
    write_source(
        tmp_path / "secret.md",
        """---
id: secret-policy
tenant_id: 42
title: Secret Policy
language: fr
source_type: hr_policy
approved: true
---
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEyfQ.signature must not be indexed.
""",
    )
    collection = FakeCollection()
    retriever = ChromaPolicyRetriever(LocalPolicyStore(tmp_path), client=FakeClient(collection), embedding_function=object())

    result = ingest_approved_sources(retriever, LocalPolicyStore(tmp_path), tenant_id=42)

    assert result.indexed_chunks == 1
    indexed_text = "\n".join(collection.upserts[0]["documents"])
    assert "Authorization:" not in indexed_text
    assert "Bearer eyJ" not in indexed_text
    assert "[REDACTED]" in indexed_text


def test_tenant_a_ingestion_does_not_include_tenant_b_source(tmp_path: Path) -> None:
    write_source(
        tmp_path / "tenant42.md",
        """---
id: tenant42-policy
tenant_id: 42
title: T42
language: fr
source_type: hr_policy
approved: true
---
Tenant 42 content.
""",
    )
    write_source(
        tmp_path / "tenant7.md",
        """---
id: tenant7-policy
tenant_id: 7
title: T7
language: fr
source_type: hr_policy
approved: true
---
Tenant 7 content.
""",
    )
    collection = FakeCollection()
    retriever = ChromaPolicyRetriever(LocalPolicyStore(tmp_path), client=FakeClient(collection), embedding_function=object())

    result = ingest_approved_sources(retriever, LocalPolicyStore(tmp_path), tenant_id=42)

    assert result.indexed_source_ids == ["tenant42-policy"]
    assert collection.upserts[0]["ids"] == ["tenant42-policy:0"]
