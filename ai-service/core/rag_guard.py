from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from config import Settings, get_settings
from core.intent_engine import normalize_text

logger = logging.getLogger(__name__)


@dataclass
class RagHit:
    source: str
    excerpt: str
    score: float


def should_use_rag(text: str, settings: Settings | None = None) -> bool:
    active_settings = settings or get_settings()
    normalized = normalize_text(text)
    return any(keyword in normalized for keyword in active_settings.rag_keywords)


class LocalRagEngine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._documents: list[tuple[str, str]] = []
        self.reload()

    def reload(self) -> None:
        documents: list[tuple[str, str]] = []
        for path in sorted(self.settings.rag_documents_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".txt", ".md", ".pdf"}:
                continue
            content = self._read_document(path)
            if content:
                documents.append((path.name, content))
        self._documents = documents

    def search(self, query: str) -> list[RagHit]:
        normalized_query = normalize_text(query)
        query_terms = {term for term in normalized_query.split(" ") if len(term) > 2}
        if not query_terms:
            return []

        hits: list[RagHit] = []
        for source, content in self._documents:
            normalized_content = normalize_text(content)
            score = sum(1 for term in query_terms if term in normalized_content)
            if score <= 0:
                continue
            hits.append(
                RagHit(
                    source=source,
                    excerpt=self._best_excerpt(content, query_terms),
                    score=float(score),
                )
            )
        hits.sort(key=lambda item: item.score, reverse=True)
        return hits[: self.settings.rag_search_limit]

    def answer(self, query: str) -> tuple[str, list[RagHit]]:
        hits = self.search(query)
        if not hits:
            return (
                "Je n'ai pas trouve de reference interne exploitable. Consultez la documentation RH officielle.",
                [],
            )
        answer = "References internes:\n" + "\n".join(f"- {hit.excerpt}" for hit in hits)
        return answer, hits

    def document_count(self) -> int:
        return len(self._documents)

    def _read_document(self, path: Path) -> str:
        try:
            if path.suffix.lower() == ".pdf":
                from pypdf import PdfReader

                reader = PdfReader(str(path))
                return "\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()
            return path.read_text(encoding="utf-8", errors="ignore").strip()
        except Exception as exc:  # noqa: BLE001
            logger.warning("RAG read failed path=%s error=%s", path, exc)
            return ""

    def _best_excerpt(self, content: str, query_terms: set[str]) -> str:
        for paragraph in content.splitlines():
            normalized = normalize_text(paragraph)
            if any(term in normalized for term in query_terms):
                return paragraph.strip()[:320]
        return content.strip()[:320]
