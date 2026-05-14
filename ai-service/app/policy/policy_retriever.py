from __future__ import annotations

import re
import unicodedata
from typing import Any

from config import get_settings

from .chromadb_retriever import ChromaPolicyRetriever, ChromaUnavailableError
from .policy_models import PolicyCitation, PolicySearchResult, PolicySource
from .policy_store import LocalPolicyStore
from .retriever_base import BasePolicyRetriever


class KeywordPolicyRetriever(BasePolicyRetriever):
    def __init__(self, store: LocalPolicyStore, *, min_score: float = 0.12) -> None:
        self.store = store
        self.min_score = min_score

    def search(self, *, query: str, tenant_id: int | None, language: str | None = None, limit: int = 3) -> PolicySearchResult:
        terms = _terms(query)
        if not terms:
            return PolicySearchResult(query=query, tenant_id=tenant_id, citations=[])
        citations: list[PolicyCitation] = []
        for source in self.store.list_sources(tenant_id=tenant_id, approved_only=True):
            citation = self._score_source(source, terms)
            if citation and citation.score >= self.min_score:
                citations.append(citation)
        citations.sort(key=lambda item: item.score, reverse=True)
        return PolicySearchResult(query=query, tenant_id=tenant_id, citations=citations[:limit])

    def get_source(self, *, source_id: str, tenant_id: int | None) -> PolicySource | None:
        return self.store.get_source(source_id=source_id, tenant_id=tenant_id)

    def _score_source(self, source: PolicySource, terms: set[str]) -> PolicyCitation | None:
        haystack = _normalize(source.title + "\n" + source.content)
        matched = {term for term in terms if term in haystack}
        if not matched:
            return None
        title_boost = sum(1 for term in matched if term in _normalize(source.title)) * 0.15
        score = min(1.0, (len(matched) / max(len(terms), 1)) + title_boost)
        return PolicyCitation(
            source_id=source.id,
            title=source.title,
            excerpt=_best_excerpt(source.content, matched),
            score=round(score, 3),
            location=source.path_or_url,
        )


class PolicyRetriever(BasePolicyRetriever):
    """Policy retriever router with optional ChromaDB and keyword fallback."""

    def __init__(
        self,
        store: LocalPolicyStore,
        *,
        min_score: float = 0.12,
        settings: Any | None = None,
        chroma_retriever: ChromaPolicyRetriever | None = None,
    ) -> None:
        self.store = store
        self.settings = settings or get_settings()
        self.keyword = KeywordPolicyRetriever(store, min_score=min_score)
        self._chroma = chroma_retriever
        self._chroma_error: str | None = None

    def search(self, *, query: str, tenant_id: int | None, language: str | None = None, limit: int = 3) -> PolicySearchResult:
        if self._should_use_chroma():
            try:
                result = self._get_chroma().search(query=query, tenant_id=tenant_id, language=language, limit=limit)
                if result.citations:
                    return result
            except ChromaUnavailableError as exc:
                self._chroma_error = str(exc)
            except Exception as exc:  # noqa: BLE001 - optional retriever boundary
                self._chroma_error = str(exc)
        return self.keyword.search(query=query, tenant_id=tenant_id, language=language, limit=limit)

    def get_source(self, *, source_id: str, tenant_id: int | None) -> PolicySource | None:
        return self.keyword.get_source(source_id=source_id, tenant_id=tenant_id)

    def health(self) -> dict[str, object]:
        provider = str(getattr(self.settings, "rag_provider", "local_keyword") or "local_keyword")
        return {
            "provider": provider,
            "chroma_enabled": bool(getattr(self.settings, "chroma_enabled", False)),
            "collection_name": getattr(self.settings, "chroma_collection_name", "weentime_policy"),
            "top_k": getattr(self.settings, "chroma_top_k", 5),
            "citation_required": bool(getattr(self.settings, "rag_require_citations", True)),
            "tenant_filter_required": bool(getattr(self.settings, "rag_tenant_filter_required", True)),
            "fallback": "local_keyword",
            "last_chroma_error": self._chroma_error,
        }

    def _should_use_chroma(self) -> bool:
        provider = str(getattr(self.settings, "rag_provider", "local_keyword") or "local_keyword").strip().lower()
        return provider == "chromadb" and bool(getattr(self.settings, "chroma_enabled", False))

    def _get_chroma(self) -> ChromaPolicyRetriever:
        if self._chroma is None:
            self._chroma = ChromaPolicyRetriever(
                self.store,
                persist_dir=getattr(self.settings, "chroma_persist_dir", "./storage/chroma"),
                collection_name=str(getattr(self.settings, "chroma_collection_name", "weentime_policy")),
                embedding_model=str(getattr(self.settings, "chroma_embedding_model", "nomic-embed-text")),
                ollama_base_url=str(getattr(self.settings, "ollama_base_url", "http://localhost:11434")),
                top_k=int(getattr(self.settings, "chroma_top_k", 5)),
            )
        return self._chroma


def _terms(text: str) -> set[str]:
    normalized = _normalize(text)
    stopwords = {
        "quelle", "quelles", "quel", "est", "sont", "pour", "dans", "avec", "this", "that", "what", "the", "can", "are", "une", "des", "les", "mes", "mon", "ma", "policy", "politique", "regle",
        "source", "tenant", "approuve", "approuvee", "approved", "non",
    }
    return {token for token in normalized.split() if len(token) > 2 and token not in stopwords}


def _normalize(text: str) -> str:
    value = unicodedata.normalize("NFKD", text or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.lower()
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip()


def _best_excerpt(content: str, matched_terms: set[str]) -> str:
    paragraphs = [line.strip() for line in content.splitlines() if line.strip()]
    for paragraph in paragraphs:
        normalized = _normalize(paragraph)
        if any(term in normalized for term in matched_terms):
            return paragraph[:420]
    return content.strip()[:420]
