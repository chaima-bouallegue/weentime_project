from __future__ import annotations

from evaluations.eval_rag import retrieval_metrics, run_eval
from evaluations.eval_policy_rag import evaluate_case


def test_rag_eval_requires_citations():
    result = evaluate_case({"id": "rag", "tenant_id": 9, "requires_citations": True}, {"text": "answer", "actionResult": {}})

    citation = next(score for score in result["scores"] if score["name"] == "citation_coverage")
    assert citation["score"] == 0.0


def test_rag_eval_metrics_include_tenant_leakage_rate():
    results = run_eval()
    metrics = retrieval_metrics(results)

    assert metrics["case_count"] == len(results)
    assert metrics["citation_coverage"] == 1.0
    assert metrics["cross_tenant_leakage_rate"] == 0.0
