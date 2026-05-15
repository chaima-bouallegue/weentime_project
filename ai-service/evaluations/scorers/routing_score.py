from __future__ import annotations

from typing import Any

from .common import score_result


def score_routing(output: Any, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    expected = expected or {}
    expected_intent = str(expected.get("expected_intent") or "").lower()
    actual = str(output.get("intent") if isinstance(output, dict) else "").lower()
    if not expected_intent:
        return score_result("routing", 1.0, actual_intent=actual)
    score = 1.0 if actual == expected_intent or actual.startswith(expected_intent) or expected_intent.startswith(actual) else 0.0
    return score_result("routing", score, expected_intent=expected_intent, actual_intent=actual)
