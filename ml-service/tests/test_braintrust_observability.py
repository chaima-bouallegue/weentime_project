"""Braintrust tracing must be private, optional, and failure-tolerant."""
from __future__ import annotations

from types import SimpleNamespace

from app.observability import braintrust_client, tracing
from app.observability.redaction import redact_value


class _FakeSpan:
    def __init__(self) -> None:
        self.events: list[dict] = []
        self.ended = False

    def log(self, **event) -> None:
        self.events.append(event)

    def end(self) -> None:
        self.ended = True


class _FakeLogger:
    def __init__(self) -> None:
        self.starts: list[dict] = []
        self.span = _FakeSpan()

    def start_span(self, **event):
        self.starts.append(event)
        return self.span


def _trace_settings(**overrides):
    values = {
        "braintrust_sample_rate": 1.0,
        "braintrust_env": "test",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_redaction_removes_tokens_email_names_and_pseudonymizes_ids():
    raw = {
        "authorization": "Bearer abcdefghij.abcdefghij.abcdefghij",
        "employeeId": 42,
        "employeeName": "Jane Doe",
        "email": "jane@example.com",
        "message": "token=secret-value email jane@example.com",
    }

    safe = redact_value(raw)

    assert safe["authorization"] == "[redacted]"
    assert safe["employeeId"].startswith("anon_")
    assert safe["employeeId"] != "42"
    assert safe["employeeName"] == "[redacted-personal-data]"
    assert safe["email"] == "[redacted-personal-data]"
    assert "secret-value" not in safe["message"]
    assert "jane@example.com" not in safe["message"]


def test_decorator_logs_only_safe_aggregate_data(monkeypatch):
    fake_logger = _FakeLogger()
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setattr(tracing, "get_settings", lambda: _trace_settings())
    monkeypatch.setattr(tracing, "get_braintrust_logger", lambda: fake_logger)

    @tracing.traced_ml_endpoint("/api/ml/anomalies/dashboard")
    def endpoint(employee_id: int, authorization: str):
        return SimpleNamespace(
            success=True,
            backend_status="ok",
            scope="GLOBAL",
            total_anomalies=4,
            critical=1,
            high=2,
            medium=1,
            low=0,
            raw_records_count=12,
            parsed_records_count=12,
            employee_name="Must Not Be Logged",
        )

    result = endpoint(
        employee_id=42,
        authorization="Bearer abcdefghij.abcdefghij.abcdefghij",
    )

    assert result.total_anomalies == 4
    assert fake_logger.starts[0]["input"]["employee_id"].startswith("anon_")
    assert "authorization" not in fake_logger.starts[0]["input"]
    event = fake_logger.span.events[0]
    assert event["output"]["total_anomalies"] == 4
    assert "employee_name" not in event["output"]
    assert fake_logger.span.ended is True


def test_tracing_failure_never_breaks_endpoint(monkeypatch):
    class _BrokenLogger:
        def start_span(self, **event):
            raise RuntimeError("offline")

    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setattr(tracing, "get_settings", lambda: _trace_settings())
    monkeypatch.setattr(tracing, "get_braintrust_logger", lambda: _BrokenLogger())

    @tracing.traced_ml_endpoint("/api/ml/forecast/dashboard")
    def endpoint():
        return "still-running"

    assert endpoint() == "still-running"


def test_braintrust_disabled_is_a_clean_noop(monkeypatch):
    settings = SimpleNamespace(
        braintrust_enabled=False,
        braintrust_api_key="not-used",
        braintrust_project_id="project",
        braintrust_project_name="Project",
        braintrust_env="test",
    )
    monkeypatch.setattr(braintrust_client, "get_settings", lambda: settings)
    braintrust_client.reset_braintrust_for_tests()
    try:
        assert braintrust_client.init_braintrust() is None
    finally:
        braintrust_client.reset_braintrust_for_tests()
