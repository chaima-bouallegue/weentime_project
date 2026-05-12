from __future__ import annotations

import builtins

import pytest
from fastapi.testclient import TestClient

import main
from app.observability import braintrust_client
from app.observability.redaction import redact_headers, redact_value
from app.observability.tracing import log_error, log_event, start_span
from config import get_settings


@pytest.fixture(autouse=True)
def clear_braintrust_state():
    yield
    get_settings.cache_clear()
    braintrust_client.reset_braintrust_cache_for_tests()


def reset_settings(monkeypatch, *, enabled: str = "false", api_key: str | None = None) -> None:
    monkeypatch.setenv("BRAINTRUST_ENABLED", enabled)
    monkeypatch.setenv("BRAINTRUST_PROJECT_NAME", "WeenTime AI Gateway")
    monkeypatch.setenv("BRAINTRUST_PROJECT_ID", "e97b0a4a-65e4-4a75-9863-95de9f83139c")
    monkeypatch.setenv("BRAINTRUST_ENV", "local")
    if api_key is None:
        monkeypatch.delenv("BRAINTRUST_API_KEY", raising=False)
    else:
        monkeypatch.setenv("BRAINTRUST_API_KEY", api_key)
    get_settings.cache_clear()
    braintrust_client.reset_braintrust_cache_for_tests()


def test_braintrust_disabled_mode_does_not_crash(monkeypatch) -> None:
    reset_settings(monkeypatch, enabled="false")

    assert braintrust_client.init_braintrust() is None
    assert braintrust_client.is_braintrust_enabled() is False
    braintrust_client.flush_braintrust()


def test_braintrust_enabled_without_key_disables_safely(monkeypatch) -> None:
    reset_settings(monkeypatch, enabled="true", api_key=None)

    assert braintrust_client.init_braintrust() is None
    status = braintrust_client.get_braintrust_status()

    assert status["enabled"] is True
    assert status["configured"] is False
    assert status["last_error"] == "missing_api_key"


def test_redaction_removes_authorization_jwt_and_api_key(monkeypatch) -> None:
    reset_settings(monkeypatch, api_key="bt-secret-key")
    token = "Bearer abcdefghij.abcdefghij.abcdefghij"
    redacted = redact_headers({"Authorization": token, "x-api-key": "secret", "email": "person@example.com"})

    assert redacted["Authorization"] == "[redacted]"
    assert redacted["x-api-key"] == "[redacted]"
    assert redacted["email"] == "[redacted-email]"
    assert redact_value("abcdefghij.abcdefghij.abcdefghij", log_inputs=True) == "[redacted-jwt]"
    assert redact_value("key=bt-secret-key", log_inputs=True) == "key=[redacted-braintrust-api-key]"


def test_health_deep_includes_braintrust_status(monkeypatch) -> None:
    reset_settings(monkeypatch, enabled="false")

    with TestClient(main.app) as client:
        response = client.get("/health/deep")

    body = response.json()
    assert response.status_code == 200
    assert "braintrust" in body["data"]
    assert {"enabled", "configured", "project_name", "project_id", "env", "sdk_available", "last_test_event_status"} <= set(
        body["data"]["braintrust"]
    )


def test_debug_braintrust_test_event_exists_only_in_local_dev(monkeypatch) -> None:
    reset_settings(monkeypatch, enabled="false")

    with TestClient(main.app) as client:
        response = client.post("/debug/braintrust/test-event")
        original_env = client.app.state.settings.app_env
        original_braintrust_env = client.app.state.settings.braintrust_env
        client.app.state.settings.app_env = "production"
        client.app.state.settings.braintrust_env = "production"
        prod_response = client.post("/debug/braintrust/test-event")
        client.app.state.settings.app_env = original_env
        client.app.state.settings.braintrust_env = original_braintrust_env

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert prod_response.status_code == 404


def test_tracing_helpers_do_not_crash_when_sdk_unavailable(monkeypatch) -> None:
    reset_settings(monkeypatch, enabled="true", api_key="test-key")
    original_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "braintrust":
            raise ImportError("missing braintrust")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    with start_span("test.span", {"Authorization": "Bearer abcdefghij.abcdefghij.abcdefghij"}):
        log_event("test.event", input="person@example.com", metadata={"api_key": "secret"})
    log_error("test.error", RuntimeError("boom"), {"jwt": "abcdefghij.abcdefghij.abcdefghij"})

    status = braintrust_client.get_braintrust_status()
    assert status["sdk_available"] is False
