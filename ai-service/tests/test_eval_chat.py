from __future__ import annotations

from evaluations.eval_chat import run_eval


def test_chat_eval_dataset_scores_green_with_default_task():
    results = run_eval()

    assert results
    assert all(score["score"] >= 0.0 for result in results for score in result["scores"])
    assert any(result["id"] == "employee-leave-balance" for result in results)


def test_chat_eval_catches_bad_routing():
    results = run_eval(
        cases=[{"id": "bad-route", "role": "EMPLOYEE", "input": "show pending requests", "expected_intent": "employee.requests"}],
        task=lambda _case: {"intent": "admin.diagnostics", "type": "answer"},
    )

    routing = next(score for score in results[0]["scores"] if score["name"] == "routing")
    assert routing["score"] == 0.0
