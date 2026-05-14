from __future__ import annotations

import pytest

from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.providers.base import LLMProvider
from app.providers.provider_request import ProviderRequest
from app.providers.provider_response import ProviderResponse
from app.providers.result import ProviderHealth
from app.providers.router import ProviderRouter


class FakeSuccessProvider(LLMProvider):
    def __init__(self, text: str = "Je peux reformuler cette demande.") -> None:
        self.text = text

    def provider_name(self) -> str:
        return "fake"

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        return ProviderResponse.ok(self.text, provider_name=self.provider_name(), model="fake-model")

    async def health(self) -> ProviderHealth:
        return ProviderHealth(ok=True, provider_name=self.provider_name(), mode="fake", status="available")


class FakeCrashingProvider(LLMProvider):
    def provider_name(self) -> str:
        return "fake-crash"

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        raise RuntimeError("provider exploded with secret token")

    async def health(self) -> ProviderHealth:
        return ProviderHealth(ok=False, provider_name=self.provider_name(), mode="fake", status="error")


def context() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role="EMPLOYEE",
        entreprise_id=9,
        token="token",
        language="fr",
        metadata={"jwt_verified": True, "request_id": "req-provider-1"},
    )


def request(prompt: str = "Reformule ma demande") -> ProviderRequest:
    return ProviderRequest.build(prompt, context=context(), channel="chat", intent="general.rewrite")


@pytest.mark.asyncio
async def test_provider_router_selects_disabled_provider_by_default() -> None:
    router = ProviderRouter()

    response = await router.generate(request())
    health = await router.health()

    assert router.mode == "disabled"
    assert response.success is False
    assert response.provider_name == "disabled"
    assert response.fallback_reason == "provider_disabled"
    assert health.ok is True
    assert health.status == "disabled"
    assert health.supports_tools is False


@pytest.mark.asyncio
async def test_unsupported_provider_mode_rejected_safely() -> None:
    router = ProviderRouter(mode="llama-on-the-moon")

    response = await router.generate(request())
    health = await router.health()

    assert router.mode == "disabled"
    assert response.success is False
    assert response.error_code == "unsupported_provider_mode"
    assert response.fallback_reason == "provider_disabled"
    assert health.ok is False
    assert "unsupported_provider_mode" in (health.message or "")


@pytest.mark.asyncio
async def test_provider_error_triggers_deterministic_fallback() -> None:
    router = ProviderRouter(mode="ollama", providers={"ollama": FakeCrashingProvider()})

    response = await router.generate_agent_response(request(), context=context(), response_guard=ResponseGuard())

    assert response.type == "error"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "deterministic_fallback"
    assert response.actionResult["fallback_reason"] == "provider_unavailable"
    assert response.actionResult["provider_used"] == "none"


@pytest.mark.asyncio
async def test_response_guard_still_applied_to_provider_output() -> None:
    router = ProviderRouter(mode="ollama", providers={"ollama": FakeSuccessProvider("Il vous reste 99 jours de conge.")})

    response = await router.generate_agent_response(request(), context=context(), response_guard=ResponseGuard())

    assert response.type == "error"
    assert response.actionResult is not None
    assert response.actionResult["fallback_reason"] == "guard_rejected"
    assert response.actionResult["guard_status"] == "hallucinated_hr_value"
    assert "99" not in response.text


@pytest.mark.asyncio
async def test_safe_provider_output_can_be_returned_as_non_authoritative() -> None:
    router = ProviderRouter(mode="ollama", providers={"ollama": FakeSuccessProvider("Je peux vous aider a clarifier la demande.")})

    response = await router.generate_agent_response(request(), context=context(), response_guard=ResponseGuard())

    assert response.type == "answer"
    assert response.intent == "provider.response"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "provider_response"
    assert response.actionResult["authoritative"] is False
    assert response.requiresConfirmation is False
    assert response.toolCalls == []
