from __future__ import annotations

from typing import Any

from evaluations.eval_policy_rag import evaluate_case, run_eval


def retrieval_metrics(results: list[dict[str, Any]]) -> dict[str, Any]:
    citation_scores = [score["score"] for item in results for score in item.get("scores", []) if score.get("name") == "citation_coverage"]
    tenant_scores = [score["score"] for item in results for score in item.get("scores", []) if score.get("name") == "tenant_leakage"]
    return {
        "case_count": len(results),
        "citation_coverage": round(sum(citation_scores) / len(citation_scores), 3) if citation_scores else 0.0,
        "cross_tenant_leakage_rate": round(1 - (sum(tenant_scores) / len(tenant_scores)), 3) if tenant_scores else 0.0,
    }


__all__ = ["evaluate_case", "retrieval_metrics", "run_eval"]
