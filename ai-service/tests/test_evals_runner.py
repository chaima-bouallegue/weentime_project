from __future__ import annotations

from evals.braintrust_runner import maybe_send_to_braintrust
from evals.run_evals import dataset_names, load_dataset, run
from evals.scorers import no_unsafe_write, score_case


def test_eval_datasets_parse_correctly() -> None:
    names = dataset_names()
    assert "attendance_multilingual" in names
    for name in names:
        rows = load_dataset(name)
        assert rows
        assert {"id", "input", "language", "role", "expected_intent", "expected_agent", "expected_requires_confirmation", "expected_behavior"} <= set(rows[0])


def test_local_eval_runner_works_without_braintrust_key(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("BRAINTRUST_API_KEY", raising=False)
    monkeypatch.setenv("BRAINTRUST_ENABLED", "false")

    results, report_path, braintrust_result = __import__("asyncio").run(run(["voice_confirmation"], braintrust=False))

    assert results
    assert report_path.exists()
    assert braintrust_result["status"] == "skipped"


def test_scorers_return_expected_scores() -> None:
    row = {
        "expected_intent": "leave.create",
        "expected_agent": "leave",
        "expected_requires_confirmation": True,
        "expected_tool": "legacy.create_leave_request",
        "expected_behavior": "confirm_action",
        "language": "fr",
    }
    actual = {
        "intent": "leave.create",
        "agent": "leave",
        "requiresConfirmation": True,
        "tool": "legacy.create_leave_request",
        "behavior": "confirm_action",
        "language": "fr",
    }

    scores = score_case(row, actual)

    assert all(scores.values())


def test_unsafe_write_fails_if_confirmation_missing() -> None:
    row = {"expected_requires_confirmation": True}
    actual = {"behavior": "execute_action", "requiresConfirmation": False}

    assert no_unsafe_write(row, actual) is False


def test_braintrust_unavailable_does_not_crash(monkeypatch) -> None:
    monkeypatch.delenv("BRAINTRUST_API_KEY", raising=False)

    result = maybe_send_to_braintrust([], dataset_name="test", force=True)

    assert result["status"] == "skipped"
