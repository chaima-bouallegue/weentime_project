from __future__ import annotations

import httpx
import pytest

from app.observability import braintrust_client
from app.providers.ollama_provider import OllamaProvider
from app.providers.provider_request import ProviderRequest
from app.context.current_user import CurrentUserContext
from config import get_settings


class FakeBraintrustLogger:
    def __init__(self) -> None:
        self.events: list[dict] = []

    def log(self, **payload):
        self.events.append(payload)
        return "event-1"


def _context() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role="EMPLOYEE",
        entreprise_id=9,
        language="fr",
        metadata={"jwt_verified": True, "request_id": "req-trace"},
    )


def test_log_ai_interaction_emits_required_facets(monkeypatch) -> None:
    fake = FakeBraintrustLogger()
    monkeypatch.setattr(braintrust_client, "get_braintrust_logger", lambda: fake)

    logged = braintrust_client.log_ai_interaction(
        input_text="Bonjour",
        output_text="Bonjour, comment puis-je aider ?",
        provider="ollama",
        model="qwen2.5:3b",
        module="chatbot_text",
        role="EMPLOYEE",
        intent="system.greeting",
        language="fr",
        tenant_id=9,
        company_id=9,
        user_id=12,
        latency_ms=14.2,
        endpoint="/v2/chat",
        request_id="req-trace",
        channel="text",
    )

    assert logged is True
    event = fake.events[0]
    assert event["input"]["text"] == "Bonjour"
    assert event["output"]["text"].startswith("Bonjour")
    assert event["metadata"]["provider"] == "ollama"
    assert event["metadata"]["model"] == "qwen2.5:3b"
    assert event["metadata"]["module"] == "chatbot_text"
    assert event["metadata"]["role"] == "EMPLOYEE"
    assert event["metadata"]["intent"] == "system.greeting"
    assert event["metadata"]["language"] == "fr"
    assert event["metadata"]["tenant_id"] == "9"
    assert event["metadata"]["status"] == "success"
    assert event["metadata"]["environment"]
    assert event["metadata"]["endpoint"] == "/v2/chat"
    assert event["metadata"]["request_id"] == "req-trace"
    assert event["metrics"]["latency_ms"] == 14.2


def test_log_error_interaction_redacts_secrets(monkeypatch) -> None:
    fake = FakeBraintrustLogger()
    monkeypatch.setattr(braintrust_client, "get_braintrust_logger", lambda: fake)

    braintrust_client.log_error_interaction(
        input_text="Authorization: Bearer abcdefghij.abcdefghij.abcdefghij api_key=sk-secretsecretsecret",
        module="chatbot_text",
        error=RuntimeError("password=secret"),
        model="qwen2.5:3b",
        endpoint="/v2/chat",
    )

    serialized = str(fake.events[0])
    assert "abcdefghij.abcdefghij.abcdefghij" not in serialized
    assert "sk-secretsecretsecret" not in serialized
    assert "password=secret" not in serialized
    assert fake.events[0]["metadata"]["status"] == "error"
    assert fake.events[0]["metadata"]["error_type"] == "RuntimeError"


def test_braintrust_startup_logs_report_readiness_without_key(monkeypatch) -> None:
    monkeypatch.setenv("BRAINTRUST_ENABLED", "true")
    monkeypatch.setenv("BRAINTRUST_PROJECT", "WeenTime AI Copilot")
    monkeypatch.setenv("BRAINTRUST_PROJECT_ID", "project-test")
    monkeypatch.setenv("BRAINTRUST_ENV", "development")
    monkeypatch.delenv("BRAINTRUST_API_KEY", raising=False)
    get_settings.cache_clear()
    braintrust_client.reset_braintrust_cache_for_tests()
    messages: list[str] = []
    monkeypatch.setattr(
        braintrust_client.logger,
        "info",
        lambda message, *args: messages.append(message % args if args else message),
    )

    assert braintrust_client.init_braintrust() is None

    output = "\n".join(messages)
    assert "Braintrust enabled: true" in output
    assert "Braintrust project id: project-test" in output
    assert "Braintrust project: WeenTime AI Copilot" in output
    assert "Braintrust env: development" in output
    assert "Braintrust SDK available:" in output
    assert "Braintrust tracing ready: false" in output

    get_settings.cache_clear()
    braintrust_client.reset_braintrust_cache_for_tests()


def test_braintrust_disabled_does_not_load_sdk(monkeypatch) -> None:
    monkeypatch.setenv("BRAINTRUST_ENABLED", "false")
    monkeypatch.setenv("BRAINTRUST_API_KEY", "unused-test-key")
    get_settings.cache_clear()
    braintrust_client.reset_braintrust_cache_for_tests()
    monkeypatch.setattr(
        braintrust_client,
        "_load_braintrust_sdk",
        lambda: pytest.fail("SDK must not be loaded when Braintrust is disabled"),
    )

    assert braintrust_client.init_braintrust() is None

    get_settings.cache_clear()
    braintrust_client.reset_braintrust_cache_for_tests()


@pytest.mark.asyncio
async def test_mocked_ollama_call_traces_model_latency_and_status(monkeypatch) -> None:
    traced: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": "Reponse tracee."}})

    monkeypatch.setattr(
        "app.providers.ollama_provider.log_ollama_interaction",
        lambda **payload: traced.append(payload) or True,
    )
    provider = OllamaProvider(
        base_url="http://ollama.test",
        model="qwen2.5:3b",
        transport=httpx.MockTransport(handler),
    )
    request = ProviderRequest.build(
        "Explique cette demande",
        context=_context(),
        channel="chat",
        intent="general.explain",
    )

    response = await provider.generate(request)

    assert response.success is True
    assert len(traced) == 1
    assert traced[0]["model"] == "qwen2.5:3b"
    assert traced[0]["status"] == "success"
    assert traced[0]["latency_ms"] >= 0
    assert traced[0]["endpoint"] == "/api/chat"
    assert traced[0]["fallback_used"] is False


@pytest.mark.asyncio
async def test_mocked_ollama_timeout_traces_error(monkeypatch) -> None:
    traced: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("too slow", request=request)

    monkeypatch.setattr(
        "app.providers.ollama_provider.log_ollama_interaction",
        lambda **payload: traced.append(payload) or True,
    )
    provider = OllamaProvider(transport=httpx.MockTransport(handler))

    response = await provider.generate(
        ProviderRequest.build(
            "Bonjour",
            context=_context(),
            channel="voice",
            intent="voice.greeting",
        )
    )

    assert response.success is False
    assert traced[0]["status"] == "error"
    assert traced[0]["timeout"] is True
    assert traced[0]["error_type"] == "TimeoutException"
