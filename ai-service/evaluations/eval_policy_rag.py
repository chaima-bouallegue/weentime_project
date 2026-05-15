from __future__ import annotations

from collections.abc import Callable
from typing import Any

from evaluations.datasets.policy_rag import POLICY_RAG_DATASET
from evaluations.scorers import score_citations, score_hallucination, score_tenant_leakage

TaskFn = Callable[[dict[str, Any]], dict[str, Any]]


def default_task(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "answer",
        "intent": "policy.search",
        "text": "Policy answer from approved source.",
        "actionResult": {
            "kind": "policy_answer",
            "tenantId": case.get("tenant_id"),
            "citations": [
                {
                    "source_id": f"policy-{case.get('tenant_id')}",
                    "title": "Approved HR Policy",
                    "chunk_id": "chunk-1",
                    "citation_label": "Approved HR Policy#chunk-1",
                }
            ],
        },
    }


def evaluate_case(case: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    expected = {**case, "has_evidence": True}
    return {
        "id": case.get("id"),
        "scores": [score_citations(output, expected), score_tenant_leakage(output, expected), score_hallucination(output, expected)],
        "output": output,
    }


def run_eval(cases: list[dict[str, Any]] | None = None, task: TaskFn | None = None) -> list[dict[str, Any]]:
    resolved_cases = cases or POLICY_RAG_DATASET
    resolved_task = task or default_task
    return [evaluate_case(case, resolved_task(case)) for case in resolved_cases]
