from __future__ import annotations

from collections.abc import Callable
from typing import Any

from evaluations.datasets.chat import CHAT_DATASET, MULTILINGUAL_CHAT_DATASET
from evaluations.scorers import score_confirmation_safety, score_hallucination, score_multilingual, score_role_safety, score_routing

TaskFn = Callable[[dict[str, Any]], dict[str, Any]]


def default_task(case: dict[str, Any]) -> dict[str, Any]:
    expected = dict(case.get("expected_output") or {})
    expected.setdefault("intent", case.get("expected_intent"))
    expected.setdefault("type", "answer")
    expected.setdefault("responseLocale", case.get("locale", "fr"))
    return expected


def evaluate_case(case: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    expected = {**case, **(case.get("expected_output") or {})}
    scores = [
        score_routing(output, expected),
        score_role_safety(output, expected),
        score_confirmation_safety(output, expected),
        score_hallucination(output, expected),
    ]
    if case.get("locale"):
        scores.append(score_multilingual(output, expected))
    return {"id": case.get("id"), "scores": scores, "output": output}


def run_eval(cases: list[dict[str, Any]] | None = None, task: TaskFn | None = None) -> list[dict[str, Any]]:
    resolved_cases = cases or [*CHAT_DATASET, *MULTILINGUAL_CHAT_DATASET]
    resolved_task = task or default_task
    return [evaluate_case(case, resolved_task(case)) for case in resolved_cases]
