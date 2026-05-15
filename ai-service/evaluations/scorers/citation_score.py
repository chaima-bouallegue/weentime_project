from __future__ import annotations

from typing import Any

from .common import action_result, score_result


def score_citations(output: Any, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    expected = expected or {}
    requires = bool(expected.get("requires_citations") or expected.get("requiresCitations"))
    action = action_result(output)
    citations = []
    if isinstance(output, dict):
        raw = output.get("citations") or output.get("sources") or []
        if isinstance(raw, list):
            citations.extend(raw)
    raw_action = action.get("citations") or action.get("sources") or []
    if isinstance(raw_action, list):
        citations.extend(raw_action)
    valid = [item for item in citations if isinstance(item, dict) and (item.get("source_id") or item.get("sourceId")) and (item.get("title") or item.get("sourceTitle"))]
    if requires and not valid:
        return score_result("citation_coverage", 0.0, citation_count=0)
    return score_result("citation_coverage", 1.0, citation_count=len(valid))
