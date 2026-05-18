from __future__ import annotations

from typing import Any

from .policy_models import PolicyCitation


def citations_to_dicts(citations: list[PolicyCitation]) -> list[dict[str, object]]:
    return [citation.to_dict() for citation in citations]


def valid_citation_dicts(citations: list[dict[str, Any]] | list[Any] | None) -> list[dict[str, Any]]:
    """Return only citations that can be safely shown as policy authority."""

    valid: list[dict[str, Any]] = []
    for item in citations or []:
        if not isinstance(item, dict):
            continue
        normalized = normalize_citation_dict(item)
        if is_valid_citation_dict(normalized):
            valid.append(normalized)
    return valid


def is_valid_citation_dict(citation: dict[str, Any] | None) -> bool:
    if not isinstance(citation, dict):
        return False
    source_id = str(citation.get("sourceId") or citation.get("source_id") or "").strip()
    title = str(citation.get("title") or "").strip()
    locator = str(
        citation.get("chunkId")
        or citation.get("chunk_id")
        or citation.get("citationLabel")
        or citation.get("citation_label")
        or citation.get("location")
        or ""
    ).strip()
    return bool(source_id and title and locator)


def normalize_citation_dict(citation: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(citation)
    if "sourceId" not in normalized and "source_id" in normalized:
        normalized["sourceId"] = normalized["source_id"]
    if "chunkId" not in normalized and "chunk_id" in normalized:
        normalized["chunkId"] = normalized["chunk_id"]
    if "citationLabel" not in normalized and "citation_label" in normalized:
        normalized["citationLabel"] = normalized["citation_label"]
    return normalized
