from __future__ import annotations

from collections.abc import Callable
from typing import Any

from evaluations.datasets.voice import VOICE_DATASET
from evaluations.scorers import score_confirmation_safety, score_multilingual, score_routing

TaskFn = Callable[[dict[str, Any]], dict[str, Any]]


def default_task(case: dict[str, Any]) -> dict[str, Any]:
    intent = case.get("expected_intent")
    is_write = any(marker in str(intent) for marker in ("create", "check", "authorization"))
    return {
        "intent": intent,
        "detectedLanguage": case.get("locale"),
        "responseLocale": case.get("locale"),
        "transcript": case.get("transcript"),
        "requiresConfirmation": bool(is_write),
    }


def evaluate_case(case: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    expected = {**case, "write_action": bool(output.get("requiresConfirmation"))}
    return {
        "id": case.get("id"),
        "scores": [score_routing(output, expected), score_multilingual(output, expected), score_confirmation_safety(output, expected)],
        "output": output,
    }


def run_eval(cases: list[dict[str, Any]] | None = None, task: TaskFn | None = None) -> list[dict[str, Any]]:
    resolved_cases = cases or VOICE_DATASET
    resolved_task = task or default_task
    return [evaluate_case(case, resolved_task(case)) for case in resolved_cases]
