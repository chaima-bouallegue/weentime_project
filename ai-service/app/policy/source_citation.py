from __future__ import annotations

from .policy_models import PolicyCitation


def citations_to_dicts(citations: list[PolicyCitation]) -> list[dict[str, object]]:
    return [citation.to_dict() for citation in citations]
