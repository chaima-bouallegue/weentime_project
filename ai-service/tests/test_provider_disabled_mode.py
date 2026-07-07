from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.context.current_user import CurrentUserContext
from app.core.copilot_engine import ensure_copilot_services
from app.providers import ProviderRequest, ProviderRouter, sanitize_provider_payload, sanitize_provider_text


def context() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        email="user@example.com",
        role="EMPLOYEE",
        entreprise_id=9,
        token="raw-jwt-token",
        language="en",
        metadata={"jwt_verified": True, "request_id": "req-sanitize"},
    )


def test_provider_request_sanitizes_prompt_and_context() -> None:
    raw_prompt = (
        "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEyfQ.signature "
        "api_key=sk-secretsecretsecret postgres://user:pass@localhost/db"
    )

    request = ProviderRequest.build(raw_prompt, context=context(), metadata={"token": "abc", "safe": "value"})
    payload = request.model_dump(mode="json")
    serialized = str(payload)

    assert "Bearer eyJ" not in request.prompt
    assert "sk-secret" not in request.prompt
    assert "postgres://user" not in request.prompt
    assert "raw-jwt-token" not in serialized
    assert "user@example.com" not in serialized
    assert payload["context"]["role"] == "EMPLOYEE"
    assert payload["context"]["tenant_present"] is True
    assert payload["metadata"]["token"] == "[redacted]"
    assert "user_id" not in serialized


def test_sanitize_provider_payload_redacts_nested_secrets() -> None:
    payload = {
        "headers": {"Authorization": "Bearer abc.def.ghi"},
        "database_url": "postgres://user:pass@localhost/db",
        "items": ["token=abc123", {"api_key": "sk-secretsecretsecret"}],
    }

    safe = sanitize_provider_payload(payload)
    serialized = str(safe)

    assert "Bearer abc" not in serialized
    assert "postgres://user" not in serialized
    assert "sk-secret" not in serialized
    assert "token=abc123" not in serialized


def test_sanitize_provider_text_keeps_normal_text() -> None:
    assert sanitize_provider_text("Please summarize this request.") == "Please summarize this request."


def test_provider_router_from_settings_defaults_to_disabled() -> None:
    settings = SimpleNamespace(
        ai_provider_mode="disabled",
        ai_provider_timeout_seconds=20.0,
        ai_provider_model="qwen2.5:3b",
        ai_provider_optional_model="qwen2.5:7b",
    )

    router = ProviderRouter.from_settings(settings)

    assert router.mode == "disabled"
    assert router.default_model == "qwen2.5:3b"
    assert router.optional_model == "qwen2.5:7b"


@pytest.mark.asyncio
async def test_disabled_provider_returns_deterministic_fallback_response() -> None:
    router = ProviderRouter()
    request = ProviderRequest.build("Help me summarize", context=context())

    response = await router.generate_agent_response(request, context=context())

    assert response.type == "error"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "deterministic_fallback"
    assert response.actionResult["fallback_reason"] == "provider_disabled"
    assert response.actionResult["request_id"] == "req-sanitize"


def test_copilot_services_include_disabled_provider_router() -> None:
    state = SimpleNamespace(
        settings=SimpleNamespace(
            backend_timeout_seconds=20.0,
            backend_base_url="http://localhost:8222/api/v1",
            ai_provider_mode="disabled",
            ai_provider_timeout_seconds=20.0,
            ai_provider_model="qwen2.5:3b",
            ai_provider_optional_model="qwen2.5:7b",
        )
    )

    services = ensure_copilot_services(state)

    assert services["provider_router"].mode == "disabled"
    assert state.copilot_provider_router.mode == "disabled"
