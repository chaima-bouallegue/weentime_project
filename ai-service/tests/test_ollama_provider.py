from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import pytest

from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.providers.ollama_provider import OllamaProvider
from app.providers.provider_request import ProviderRequest
from app.providers.router import ProviderRouter
from config import Settings


def context() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        email="user@example.com",
        role="EMPLOYEE",
        entreprise_id=9,
        token="raw-jwt-token",
        language="fr",
        metadata={"jwt_verified": True, "request_id": "req-ollama"},
    )


def provider_request(prompt: str = "Explique ma demande") -> ProviderRequest:
    return ProviderRequest.build(prompt, context=context(), channel="chat", intent="general.explain")


def settings(mode: str = "ollama") -> SimpleNamespace:
    return SimpleNamespace(
        ai_provider_mode=mode,
        ai_provider_timeout_seconds=20.0,
        ai_provider_model="qwen2.5:3b",
        ai_provider_optional_model="qwen2.5:7b",
        ai_local_device="cpu",
        ollama_base_url="http://ollama.test",
        ollama_model="qwen2.5:3b",
        ollama_fallback_model="",
        ollama_timeout_seconds=20.0,
        ollama_max_tokens=512,
        ollama_temperature=0.2,
    )


@pytest.mark.asyncio
async def test_ollama_provider_calls_expected_chat_url() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["payload"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(200, json={"message": {"content": "Bonjour, je peux reformuler."}, "done": True})

    provider = OllamaProvider(base_url="http://ollama.test", transport=httpx.MockTransport(handler))

    response = await provider.generate(provider_request())

    assert response.success is True
    assert response.provider_name == "ollama"
    assert response.model == "qwen2.5:3b"
    assert response.text == "Bonjour, je peux reformuler."
    assert captured["path"] == "/api/chat"
    payload = captured["payload"]
    assert isinstance(payload, dict)
    assert payload["model"] == "qwen2.5:3b"
    assert payload["stream"] is False
    assert payload["options"]["num_predict"] == 512
    assert payload["options"]["temperature"] == 0.2


@pytest.mark.asyncio
async def test_ollama_connection_error_triggers_deterministic_fallback() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    provider = OllamaProvider(transport=httpx.MockTransport(handler))
    router = ProviderRouter(mode="ollama", providers={"ollama": provider})

    response = await router.generate_agent_response(provider_request(), context=context(), response_guard=ResponseGuard())

    assert response.type == "error"
    assert response.actionResult is not None
    assert response.actionResult["fallback_reason"] == "provider_unavailable"
    assert response.actionResult["provider_used"] == "none"


@pytest.mark.asyncio
async def test_ollama_timeout_triggers_deterministic_fallback() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("too slow", request=request)

    provider = OllamaProvider(transport=httpx.MockTransport(handler))
    router = ProviderRouter(mode="ollama", providers={"ollama": provider})

    response = await router.generate_agent_response(provider_request(), context=context(), response_guard=ResponseGuard())

    assert response.type == "error"
    assert response.actionResult is not None
    assert response.actionResult["fallback_reason"] == "provider_timeout"


@pytest.mark.asyncio
async def test_ollama_invalid_json_triggers_deterministic_fallback() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not-json")

    provider = OllamaProvider(transport=httpx.MockTransport(handler))
    router = ProviderRouter(mode="ollama", providers={"ollama": provider})

    response = await router.generate_agent_response(provider_request(), context=context(), response_guard=ResponseGuard())

    assert response.type == "error"
    assert response.actionResult is not None
    assert response.actionResult["fallback_reason"] == "provider_invalid_output"


@pytest.mark.asyncio
async def test_ollama_empty_response_triggers_deterministic_fallback() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": ""}, "done": True})

    provider = OllamaProvider(transport=httpx.MockTransport(handler))
    router = ProviderRouter(mode="ollama", providers={"ollama": provider})

    response = await router.generate_agent_response(provider_request(), context=context(), response_guard=ResponseGuard())

    assert response.type == "error"
    assert response.actionResult is not None
    assert response.actionResult["fallback_reason"] == "provider_invalid_output"


@pytest.mark.asyncio
async def test_ollama_request_payload_does_not_include_jwt_or_secrets() -> None:
    captured: dict[str, object] = {}
    raw_prompt = (
        "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEyfQ.signature "
        "api_key=sk-secretsecretsecret"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        captured["payload_text"] = request.content.decode("utf-8")
        return httpx.Response(200, json={"message": {"content": "Texte nettoye."}})

    provider = OllamaProvider(transport=httpx.MockTransport(handler))

    response = await provider.generate(provider_request(raw_prompt))

    payload_text = str(captured["payload_text"])
    assert response.success is True
    assert "Bearer eyJ" not in payload_text
    assert "sk-secret" not in payload_text
    assert "raw-jwt-token" not in payload_text
    assert "user@example.com" not in payload_text
    assert "user_id" not in payload_text


def test_settings_default_to_disabled_cpu_qwen3b(monkeypatch) -> None:
    monkeypatch.delenv("AI_PROVIDER_MODE", raising=False)
    monkeypatch.delenv("OLLAMA_MODEL", raising=False)
    monkeypatch.delenv("OLLAMA_FALLBACK_MODEL", raising=False)
    monkeypatch.delenv("AI_LOCAL_DEVICE", raising=False)

    current = Settings()

    assert current.ai_provider_mode == "disabled"
    assert current.ollama_model == "qwen2.5:3b"
    assert current.ollama_fallback_model == ""
    assert current.ai_local_device == "cpu"


def test_provider_router_registers_ollama_only_when_mode_ollama() -> None:
    disabled = ProviderRouter.from_settings(settings(mode="disabled"))
    ollama = ProviderRouter.from_settings(settings(mode="ollama"))

    assert disabled.mode == "disabled"
    assert disabled.selected_provider().provider_name() == "disabled"
    assert ollama.mode == "ollama"
    assert ollama.selected_provider().provider_name() == "ollama"


@pytest.mark.asyncio
async def test_ollama_provider_output_passes_through_response_guard() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": "Il vous reste 99 jours de conge."}})

    provider = OllamaProvider(transport=httpx.MockTransport(handler))
    router = ProviderRouter(mode="ollama", providers={"ollama": provider})

    response = await router.generate_agent_response(provider_request(), context=context(), response_guard=ResponseGuard())

    assert response.type == "error"
    assert response.actionResult is not None
    assert response.actionResult["fallback_reason"] == "guard_rejected"
    assert response.actionResult["guard_status"] == "hallucinated_hr_value"


@pytest.mark.asyncio
async def test_tool_like_json_from_ollama_is_text_not_executed() -> None:
    tool_like = '{"tool":"leave.create_request","arguments":{"start_date":"tomorrow"}}'

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": tool_like}})

    provider = OllamaProvider(transport=httpx.MockTransport(handler))
    router = ProviderRouter(mode="ollama", providers={"ollama": provider})

    response = await router.generate_agent_response(provider_request(), context=context(), response_guard=ResponseGuard())

    assert response.type == "answer"
    assert response.text == tool_like
    assert response.toolCalls == []
    assert response.requiresConfirmation is False
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "provider_response"
    assert response.actionResult["authoritative"] is False
