from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from app.policy import LocalPolicyStore, PolicyRetriever
from app.policy.chromadb_retriever import ChromaPolicyRetriever, ChromaUnavailableError
from app.policy.policy_models import PolicySource
from app.policy.source_registry import build_policy_chunks

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "policies"


class FakeCollection:
    def __init__(self, result: dict | None = None) -> None:
        self.result = result or {}
        self.last_query: dict | None = None
        self.upserts: list[dict] = []

    def query(self, **kwargs):
        self.last_query = kwargs
        return self.result

    def upsert(self, **kwargs):
        self.upserts.append(kwargs)


class FakeClient:
    def __init__(self, collection: FakeCollection) -> None:
        self.collection = collection
        self.collection_name: str | None = None
        self.embedding_function = None

    def get_or_create_collection(self, name: str, embedding_function=None):
        self.collection_name = name
        self.embedding_function = embedding_function
        return self.collection


class FailingChroma:
    def search(self, **kwargs):
        raise ChromaUnavailableError("chromadb_not_installed")


def settings(*, provider: str = "local_keyword", enabled: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        rag_provider=provider,
        chroma_enabled=enabled,
        chroma_persist_dir="./storage/chroma-test",
        chroma_collection_name="weentime_policy_test",
        chroma_embedding_model="nomic-embed-text",
        chroma_top_k=5,
        rag_require_citations=True,
        rag_tenant_filter_required=True,
        ollama_base_url="http://localhost:11434",
    )


def test_chroma_disabled_uses_keyword_fallback() -> None:
    retriever = PolicyRetriever(LocalPolicyStore(FIXTURE_DIR), settings=settings(provider="local_keyword", enabled=False))

    result = retriever.search(query="politique conge maladie certificat", tenant_id=42, language="fr")

    assert result.policy_available is True
    assert result.citations[0].source_id == "tenant42-sick-leave"


def test_chroma_unavailable_does_not_crash_and_uses_keyword_fallback() -> None:
    retriever = PolicyRetriever(
        LocalPolicyStore(FIXTURE_DIR),
        settings=settings(provider="chromadb", enabled=True),
        chroma_retriever=FailingChroma(),  # type: ignore[arg-type]
    )

    result = retriever.search(query="politique conge maladie certificat", tenant_id=42, language="fr")

    assert result.policy_available is True
    assert result.citations[0].source_id == "tenant42-sick-leave"
    assert retriever.health()["last_chroma_error"] == "chromadb_not_installed"


def test_chromadb_query_uses_tenant_approved_and_language_filter() -> None:
    collection = FakeCollection(
        {
            "documents": [["Le conge maladie necessite un certificat medical."]],
            "metadatas": [[{"tenant_id": 42, "approved": True, "language": "fr", "source_id": "src1", "source_title": "Policy", "citation_label": "Policy#1"}]],
            "distances": [[0.25]],
        }
    )
    retriever = ChromaPolicyRetriever(LocalPolicyStore(FIXTURE_DIR), client=FakeClient(collection), embedding_function=object())

    result = retriever.search(query="conge maladie", tenant_id=42, language="fr", limit=3)

    assert result.policy_available is True
    assert collection.last_query is not None
    assert collection.last_query["where"] == {
        "$and": [
            {"tenant_id": {"$eq": 42}},
            {"approved": {"$eq": True}},
            {"language": {"$eq": "fr"}},
        ]
    }
    assert result.citations[0].source_id == "src1"
    assert result.citations[0].title == "Policy"
    assert result.citations[0].chunk_id is None


def test_chromadb_result_post_filter_blocks_cross_tenant_and_unapproved_sources() -> None:
    collection = FakeCollection(
        {
            "documents": [["Wrong tenant", "Unapproved", "Allowed"]],
            "metadatas": [[
                {"tenant_id": 7, "approved": True, "language": "fr", "source_id": "wrong", "source_title": "Wrong"},
                {"tenant_id": 42, "approved": False, "language": "fr", "source_id": "unapproved", "source_title": "No"},
                {"tenant_id": 42, "approved": True, "language": "fr", "source_id": "allowed", "source_title": "Allowed"},
            ]],
            "distances": [[0.1, 0.1, 0.1]],
        }
    )
    retriever = ChromaPolicyRetriever(LocalPolicyStore(FIXTURE_DIR), client=FakeClient(collection), embedding_function=object())

    result = retriever.search(query="policy", tenant_id=42, language="fr", limit=5)

    assert [citation.source_id for citation in result.citations] == ["allowed"]


def test_ingestion_contract_rejects_live_hr_or_private_source_types() -> None:
    source = PolicySource(
        id="payroll-live-row",
        tenant_id=42,
        title="Payroll row",
        source_type="payroll",
        path_or_url="db://payroll",
        language="fr",
        approved=True,
        content="Sensitive payroll value",
    )

    assert build_policy_chunks(source) == []


def test_ingestion_redacts_jwt_before_embedding_payload() -> None:
    source = PolicySource(
        id="approved-policy",
        tenant_id=42,
        title="Approved policy",
        source_type="hr_policy",
        path_or_url="approved.md",
        language="fr",
        approved=True,
        content="Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEyfQ.signature must not be indexed.",
    )
    collection = FakeCollection()
    retriever = ChromaPolicyRetriever(LocalPolicyStore(FIXTURE_DIR), client=FakeClient(collection), embedding_function=object())

    indexed = retriever.index_chunks(build_policy_chunks(source))

    assert indexed == 1
    payload_text = "\n".join(collection.upserts[0]["documents"])
    assert "Bearer eyJ" not in payload_text
    assert "Authorization:" not in payload_text
    assert "[REDACTED]" in payload_text


def test_citations_include_source_title_and_chunk_location() -> None:
    collection = FakeCollection(
        {
            "documents": [["Approved FAQ answer"]],
            "metadatas": [[{"tenant_id": 42, "approved": True, "language": "en", "source_id": "faq1", "source_title": "FAQ", "chunk_id": "faq1:0", "citation_label": "FAQ#1"}]],
            "distances": [[0.5]],
        }
    )
    retriever = ChromaPolicyRetriever(LocalPolicyStore(FIXTURE_DIR), client=FakeClient(collection), embedding_function=object())

    result = retriever.search(query="faq", tenant_id=42, language="en", limit=1)

    citation = result.citations[0]
    assert citation.source_id == "faq1"
    assert citation.title == "FAQ"
    assert citation.location == "FAQ#1"
    assert citation.chunk_id == "faq1:0"
    assert citation.citation_label == "FAQ#1"
    assert citation.excerpt == "Approved FAQ answer"
