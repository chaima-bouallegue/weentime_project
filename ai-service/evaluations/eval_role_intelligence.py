from __future__ import annotations

from collections.abc import Callable
from typing import Any

from evaluations.datasets.chat import ROLE_INTELLIGENCE_DATASET
from evaluations.scorers import score_hallucination, score_role_safety, score_routing

TaskFn = Callable[[dict[str, Any]], dict[str, Any]]


def default_task(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "intent": case.get("expected_intent"),
        "type": "answer",
        "actionResult": {
            "kind": "role_intelligence_digest",
            "role": case.get("role"),
            "sections": [{"title": section} for section in case.get("expected_sections", [])],
            "priorities": [],
        },
    }


def evaluate_case(case: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    expected = {**case, "authoritative_source": "tool"}
    return {
        "id": case.get("id"),
        "scores": [score_routing(output, expected), score_role_safety(output, expected), score_hallucination(output, expected)],
        "output": output,
    }


def run_eval(cases: list[dict[str, Any]] | None = None, task: TaskFn | None = None) -> list[dict[str, Any]]:
    resolved_cases = cases or ROLE_INTELLIGENCE_DATASET
    resolved_task = task or default_task
    return [evaluate_case(case, resolved_task(case)) for case in resolved_cases]
