from __future__ import annotations

from pathlib import Path

from app.policy import LocalPolicyStore, PolicyRetriever

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "policies"


def make_retriever() -> PolicyRetriever:
    return PolicyRetriever(LocalPolicyStore(FIXTURE_DIR))


def test_search_uses_approved_tenant_source() -> None:
    result = make_retriever().search(query="politique conge maladie certificat", tenant_id=42, language="fr")

    assert result.policy_available is True
    assert result.citations[0].source_id == "tenant42-sick-leave"
    assert "certificat" in result.citations[0].excerpt.lower()


def test_missing_source_returns_no_citations() -> None:
    result = make_retriever().search(query="regle parking velo", tenant_id=42, language="fr")

    assert result.policy_available is False
    assert result.citations == []


def test_unapproved_source_is_ignored() -> None:
    result = make_retriever().search(query="regle secrete non approuvee", tenant_id=42, language="fr")

    assert result.policy_available is False


def test_cross_tenant_source_is_ignored() -> None:
    result = make_retriever().search(query="source autre tenant confidentielle", tenant_id=42, language="fr")

    assert result.policy_available is False


def test_tenantless_context_returns_no_sources() -> None:
    result = make_retriever().search(query="conge maladie", tenant_id=None, language="fr")

    assert result.policy_available is False


def test_citation_metadata_is_returned() -> None:
    result = make_retriever().search(query="remote work manager approval", tenant_id=42, language="en")

    assert result.policy_available is True
    citation = result.citations[0]
    assert citation.source_id == "tenant42-remote-friday"
    assert citation.title == "Remote work policy"
    assert citation.location == "tenant42_remote_work.json"
    assert 0 < citation.score <= 1
