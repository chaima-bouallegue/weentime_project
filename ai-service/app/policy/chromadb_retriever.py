from __future__ import annotations

from pathlib import Path
from typing import Any

from .policy_models import PolicyCitation, PolicySearchResult, PolicySource
from .policy_store import LocalPolicyStore
from .source_registry import PolicyChunk


class ChromaUnavailableError(RuntimeError):
    pass


class ChromaPolicyRetriever:
    """Optional tenant-scoped ChromaDB retriever for approved policy sources.

    ChromaDB and its embedding function are imported lazily so the AI service can
    start and test without Chroma installed. Runtime callers should catch failures
    and fall back to the local keyword retriever.
    """

    def __init__(
        self,
        store: LocalPolicyStore,
        *,
        persist_dir: str | Path = "./storage/chroma",
        collection_name: str = "weentime_policy",
        embedding_model: str = "nomic-embed-text",
        ollama_base_url: str = "http://localhost:11434",
        top_k: int = 5,
        client: Any | None = None,
        collection: Any | None = None,
        embedding_function: Any | None = None,
    ) -> None:
        self.store = store
        self.persist_dir = Path(persist_dir)
        self.collection_name = collection_name or "weentime_policy"
        self.embedding_model = embedding_model or "nomic-embed-text"
        self.ollama_base_url = (ollama_base_url or "http://localhost:11434").rstrip("/")
        self.top_k = max(1, int(top_k or 5))
        self._client = client
        self._collection = collection
        self._embedding_function = embedding_function
        self._available_error: str | None = None

    @property
    def available_error(self) -> str | None:
        return self._available_error

    def is_available(self) -> bool:
        try:
            self._get_collection()
            return True
        except Exception as exc:  # noqa: BLE001 - optional dependency boundary
            self._available_error = str(exc)
            return False

    def search(self, *, query: str, tenant_id: int | None, language: str | None = None, limit: int = 5) -> PolicySearchResult:
        if tenant_id is None:
            return PolicySearchResult(query=query, tenant_id=tenant_id, citations=[])
        collection = self._get_collection()
        where = _tenant_where(tenant_id=tenant_id, language=language)
        try:
            result = collection.query(
                query_texts=[query],
                n_results=max(1, int(limit or self.top_k)),
                where=where,
                include=["documents", "metadatas", "distances"],
            )
        except Exception as exc:  # noqa: BLE001 - vector store is optional
            raise ChromaUnavailableError(str(exc)) from exc
        citations = _citations_from_query_result(result, tenant_id=tenant_id, language=language)
        return PolicySearchResult(query=query, tenant_id=tenant_id, citations=citations[:limit])

    def get_source(self, *, source_id: str, tenant_id: int | None) -> PolicySource | None:
        return self.store.get_source(source_id=source_id, tenant_id=tenant_id)

    def index_chunks(self, chunks: list[PolicyChunk]) -> int:
        safe_chunks = [chunk for chunk in chunks if _metadata_is_safe(chunk.metadata)]
        if not safe_chunks:
            return 0
        collection = self._get_collection()
        collection.upsert(
            ids=[chunk.id for chunk in safe_chunks],
            documents=[chunk.text for chunk in safe_chunks],
            metadatas=[chunk.metadata for chunk in safe_chunks],
        )
        return len(safe_chunks)

    def _get_collection(self) -> Any:
        if self._collection is not None:
            return self._collection
        if self._client is None:
            chromadb = _import_chromadb()
            self.persist_dir.mkdir(parents=True, exist_ok=True)
            self._client = chromadb.PersistentClient(path=str(self.persist_dir))
        kwargs: dict[str, Any] = {"name": self.collection_name}
        embedding_function = self._embedding_function or self._build_embedding_function()
        if embedding_function is not None:
            kwargs["embedding_function"] = embedding_function
        try:
            self._collection = self._client.get_or_create_collection(**kwargs)
        except TypeError:
            self._collection = self._client.get_or_create_collection(self.collection_name)
        return self._collection

    def _build_embedding_function(self) -> Any | None:
        if self._embedding_function is not None:
            return self._embedding_function
        try:
            from chromadb.utils.embedding_functions import OllamaEmbeddingFunction
        except Exception as exc:  # noqa: BLE001 - optional dependency
            self._available_error = f"ollama_embedding_function_unavailable:{exc}"
            raise ChromaUnavailableError(self._available_error) from exc
        url = f"{self.ollama_base_url}/api/embeddings"
        self._embedding_function = OllamaEmbeddingFunction(url=url, model_name=self.embedding_model)
        return self._embedding_function


def _import_chromadb() -> Any:
    try:
        import chromadb  # type: ignore[import-not-found]
    except Exception as exc:  # noqa: BLE001 - optional dependency
        raise ChromaUnavailableError("chromadb_not_installed") from exc
    return chromadb


def _tenant_where(*, tenant_id: int, language: str | None) -> dict[str, Any]:
    filters: list[dict[str, Any]] = [
        {"tenant_id": {"$eq": int(tenant_id)}},
        {"approved": {"$eq": True}},
    ]
    if language:
        filters.append({"language": {"$eq": str(language).lower()}})
    return {"$and": filters}


def _citations_from_query_result(result: dict[str, Any], *, tenant_id: int, language: str | None) -> list[PolicyCitation]:
    documents = _first_list(result.get("documents"))
    metadatas = _first_list(result.get("metadatas"))
    distances = _first_list(result.get("distances"))
    citations: list[PolicyCitation] = []
    for index, document in enumerate(documents):
        metadata = metadatas[index] if index < len(metadatas) and isinstance(metadatas[index], dict) else {}
        if not _metadata_matches(metadata, tenant_id=tenant_id, language=language):
            continue
        distance = distances[index] if index < len(distances) else None
        score = _distance_to_score(distance)
        title = str(metadata.get("source_title") or metadata.get("title") or "Source RH")
        source_id = str(metadata.get("source_id") or metadata.get("sourceId") or metadata.get("chunk_id") or "")
        if not source_id:
            continue
        citations.append(
            PolicyCitation(
                source_id=source_id,
                title=title,
                excerpt=str(document or "").strip()[:420],
                score=score,
                location=str(metadata.get("citation_label") or metadata.get("source_location") or "") or None,
            )
        )
    citations.sort(key=lambda item: item.score, reverse=True)
    return citations


def _first_list(value: Any) -> list[Any]:
    if isinstance(value, list) and value and isinstance(value[0], list):
        return value[0]
    if isinstance(value, list):
        return value
    return []


def _metadata_matches(metadata: dict[str, Any], *, tenant_id: int, language: str | None) -> bool:
    try:
        if int(metadata.get("tenant_id")) != int(tenant_id):
            return False
    except (TypeError, ValueError):
        return False
    if metadata.get("approved") is not True:
        return False
    if language and str(metadata.get("language") or "").lower() != str(language).lower():
        return False
    return True


def _metadata_is_safe(metadata: dict[str, Any]) -> bool:
    return metadata.get("approved") is True and metadata.get("tenant_id") is not None and bool(metadata.get("source_id"))


def _distance_to_score(distance: Any) -> float:
    try:
        value = float(distance)
    except (TypeError, ValueError):
        return 0.5
    if value < 0:
        return 0.0
    return round(1.0 / (1.0 + value), 3)
