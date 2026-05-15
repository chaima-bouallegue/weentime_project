from __future__ import annotations

import re
from typing import Any

from .common import score_result, text_from_output

_SUSPICIOUS_PATTERNS = (
    re.compile(r"\b(?:\d{2,3})\s*(?:days?|jours?)\b", re.IGNORECASE),
    re.compile(r"\b(?:all|tous)\s+(?:requests|demandes)\s+(?:approved|approuve)", re.IGNORECASE),
    re.compile(r"\b(?:\d+)\s+(?:unread|non\s+lus?|mentions?)\b", re.IGNORECASE),
    re.compile(r"\b(?:redis|provider|rag|braintrust)\s+(?:is\s+)?(?:healthy|ok|enabled)\b", re.IGNORECASE),
)


def score_hallucination(output: Any, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    text = text_from_output(output)
    expected = expected or {}
    authoritative = expected.get("authoritative_source") or expected.get("has_evidence")
    hits = [pattern.pattern for pattern in _SUSPICIOUS_PATTERNS if pattern.search(text)]
    if hits and not authoritative:
        return score_result("hallucination", 0.0, suspicious_patterns=hits)
    return score_result("hallucination", 1.0, suspicious_patterns=hits)
