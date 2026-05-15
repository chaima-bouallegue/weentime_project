from __future__ import annotations

from app.observability.braintrust_logger import log_observation
from app.observability.metrics import reset_metrics_for_tests, snapshot_metrics
from app.observability.redaction import redact_value
from app.observability.request_trace import trace_request_lifecycle


def test_log_observation_records_safe_metric_without_secret(monkeypatch):
    reset_metrics_for_tests()
    monkeypatch.setattr("app.observability.braintrust_logger.get_braintrust_logger", lambda: None)

    log_observation(
        "provider.test",
        input={"authorization": "Bearer abc.def.ghi", "prompt": "hello"},
        output={"text": "safe"},
        metadata={"database_url": "postgresql://user:pass@localhost/db"},
        metrics={"latency": 12},
    )

    snapshot = snapshot_metrics()
    assert any(key.startswith("braintrust.observation") for key in snapshot["counters"])
    assert "postgresql://" not in str(snapshot)
    assert "Bearer abc" not in str(snapshot)


def test_request_trace_records_lifecycle_metric():
    reset_metrics_for_tests()
    trace = trace_request_lifecycle(endpoint="/v2/chat", status_code=200, latency_ms=12.5, request_id="req-1")

    assert trace.to_dict()["request_id"] == "req-1"
    snapshot = snapshot_metrics()
    assert any(key.startswith("request.lifecycle") for key in snapshot["counters"])


def test_redaction_blocks_db_urls_and_secret_assignments():
    redacted = redact_value("DATABASE_URL=postgresql://user:pass@localhost/db password=secret", log_inputs=True)

    assert "postgresql://" not in redacted
    assert "secret" not in redacted
