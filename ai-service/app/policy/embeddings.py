from __future__ import annotations

import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)


class SentenceTransformerEmbeddingFunction:
    """Thread-safe, lazily-loaded embedding function for ChromaDB.

    sentence-transformers is imported only when the model is first needed, so the
    AI service can start and be tested without the heavy dependency installed. A
    ``threading.Lock`` guards the one-time load as a second safety net on top of
    the lifespan preload (see ``main.lifespan``).
    """

    _instance: "SentenceTransformerEmbeddingFunction | None" = None
    _instance_lock = threading.Lock()

    def __init__(
        self,
        *,
        model_name: str = "intfloat/multilingual-e5-base",
        device: str = "cpu",
        query_prefix: str = "query: ",
        passage_prefix: str = "passage: ",
    ) -> None:
        self.model_name = model_name
        self.device = device
        self.query_prefix = query_prefix
        self.passage_prefix = passage_prefix
        self._model: Any | None = None
        self._load_error: str | None = None
        self._load_lock = threading.Lock()

    @classmethod
    def get_instance(
        cls,
        *,
        model_name: str | None = None,
        device: str = "cpu",
    ) -> "SentenceTransformerEmbeddingFunction":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls(model_name=model_name or "intfloat/multilingual-e5-base", device=device)
            elif model_name and cls._instance.model_name != model_name:
                logger.warning(
                    "refusing_to_swap_loaded_model current=%s requested=%s",
                    cls._instance.model_name,
                    model_name,
                )
        return cls._instance

    def preload(self) -> bool:
        """Force the model load at a chosen moment (lifespan startup). Idempotent."""
        try:
            _ = self._ensure_model()
            return True
        except Exception as exc:  # noqa: BLE001 - optional dependency boundary
            self._load_error = str(exc)
            logger.error("embedding_preload_failed model=%s error=%s", self.model_name, exc)
            return False

    def name(self) -> str:
        """ChromaDB EmbeddingFunction interface: name() must be a method, not a property."""
        return f"sentence-transformers:{self.model_name}"

    def is_legacy(self) -> bool:
        """Chromadb stores custom functions as legacy config (avoids registry lookups on reopen)."""
        return True

    def get_config(self) -> dict[str, object]:
        return {}

    def __call__(self, input: list[str]) -> list[list[float]]:
        return self.encode_documents(input)

    def embed_query(self, input: list[str]) -> list[list[float]]:
        return self.encode_queries(input)

    def embed_documents(self, input: list[str]) -> list[list[float]]:
        return self.encode_documents(input)

    def encode_queries(self, queries: list[str]) -> list[list[float]]:
        return self.encode([self.query_prefix + (text or "").strip() for text in queries])

    def encode_documents(self, documents: list[str]) -> list[list[float]]:
        return self.encode([self.passage_prefix + (text or "").strip() for text in documents])

    def encode(self, texts: list[str]) -> list[list[float]]:
        model = self._ensure_model()
        vectors = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
        return [value.tolist() for value in vectors]

    def _ensure_model(self) -> Any:
        if self._model is not None:
            return self._model
        with self._load_lock:
            if self._model is None:
                self._model = self._load()
        return self._model

    def _load(self) -> Any:
        try:
            from sentence_transformers import SentenceTransformer
        except Exception as exc:  # noqa: BLE001 - optional dependency
            self._load_error = f"sentence_transformers_unavailable:{exc}"
            raise RuntimeError(self._load_error) from exc
        logger.info("loading_sentence_transformer model=%s device=%s", self.model_name, self.device)
        return SentenceTransformer(self.model_name, device=self.device)


def get_embedding_function(*, model_name: str | None = None, device: str = "cpu") -> SentenceTransformerEmbeddingFunction:
    return SentenceTransformerEmbeddingFunction.get_instance(model_name=model_name, device=device)
