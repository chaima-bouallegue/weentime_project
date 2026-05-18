from __future__ import annotations

import asyncio

from app.core.copilot_engine import ensure_copilot_services, process_copilot_message
from app.models.agent_models import AgentResponse
from app.providers.base import LLMProvider
from app.providers.provider_request import ProviderRequest
from app.providers.provider_response import ProviderResponse
from app.providers.result import ProviderHealth
from app.providers.router import ProviderRouter
from chatbot_test_helpers import make_context, make_state


class FakeEnhancementProvider(LLMProvider):
    def __init__(self, text: str | None = None, *, fail: bool = False) -> None:
        self.text = text or "Votre situation de pointage est resumee clairement."
        self.fail = fail
        self.requests: list[ProviderRequest] = []

    def provider_name(self) -> str:
        return "ollama"

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        self.requests.append(request)
        if self.fail:
            raise RuntimeError("ollama unavailable")
        return ProviderResponse.ok(self.text, provider_name=self.provider_name(), model="qwen2.5:3b", metadata={"model": "qwen2.5:3b"})

    async def health(self) -> ProviderHealth:
        return ProviderHealth(ok=not self.fail, provider_name=self.provider_name(), mode="ollama", status="available" if not self.fail else "unavailable")


def _router(provider: FakeEnhancementProvider) -> ProviderRouter:
    return ProviderRouter(
        mode="ollama",
        providers={"ollama": provider},
        default_model="qwen2.5:3b",
        fallback_model="phi3",
    )


def test_provider_disabled_keeps_deterministic_chatbot_response() -> None:
    state = make_state()
    ctx = make_context("EMPLOYEE")
    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "Check my pointage",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "provider-test", "language": "fr"},
            context=ctx,
        )
    )
    assert response.intent == "attendance.status"
    assert response.actionResult["success"] is True
    assert response.actionResult["enhancementApplied"] is False
    assert response.actionResult["providerUsed"] == "disabled"


def test_provider_output_cannot_execute_tool_directly() -> None:
    state = make_state()
    services = ensure_copilot_services(state)
    provider_response = AgentResponse(
        type="answer",
        text='{"tool":"check_in","arguments":{}}',
        intent="provider.chat",
        confidence=0.7,
    )
    guarded = services["response_guard"].guard_response(provider_response, make_context("EMPLOYEE"))
    assert guarded.requiresConfirmation is False
    assert not services["confirmation_store"].find_pending_for_user(1, 1)


def test_unknown_prompt_does_not_call_provider_unless_explicitly_enabled() -> None:
    state = make_state()
    ctx = make_context("EMPLOYEE")
    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "une question bizarre sans domaine",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "provider-test-2", "language": "fr"},
            context=ctx,
        )
    )
    assert response.intent in {"fallback.unknown", "fallback.unsafe_response"}
    assert response.actionResult.get("llm_used") is not True if isinstance(response.actionResult, dict) else True


def test_ollama_enhances_safe_read_result_wording_when_enabled() -> None:
    provider = FakeEnhancementProvider("Votre pointage est ouvert et pret a etre consulte.")
    state = make_state()
    state.copilot_provider_router = _router(provider)
    ctx = make_context("EMPLOYEE")

    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "Check my pointage",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "provider-enhance", "language": "fr"},
            context=ctx,
        )
    )

    assert response.intent == "attendance.status"
    assert response.text == "Votre pointage est ouvert et pret a etre consulte."
    assert response.actionResult["enhancementApplied"] is True
    assert response.actionResult["providerUsed"] == "ollama"
    assert response.actionResult["model"] == "qwen2.5:3b"
    assert response.actionResult["llm_used"] is True
    assert provider.requests
    assert provider.requests[0].metadata["task_type"] == "wording_enhancement"


def test_provider_failure_keeps_deterministic_response() -> None:
    provider = FakeEnhancementProvider(fail=True)
    state = make_state()
    state.copilot_provider_router = _router(provider)
    ctx = make_context("EMPLOYEE")

    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "Check my pointage",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "provider-failure", "language": "fr"},
            context=ctx,
        )
    )

    assert response.intent == "attendance.status"
    assert response.actionResult["enhancementApplied"] is False
    assert response.actionResult["fallbackUsed"] is True
    assert response.actionResult["llm_used"] is False
    assert "pointage" in response.text.lower()


def test_response_guard_rejects_unsafe_provider_rewrite() -> None:
    provider = FakeEnhancementProvider("Il vous reste 99 jours de conge.")
    state = make_state()
    state.copilot_provider_router = _router(provider)
    ctx = make_context("EMPLOYEE")

    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "Check my pointage",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "provider-unsafe", "language": "fr"},
            context=ctx,
        )
    )

    assert response.intent == "fallback.guard_rejected"
    assert response.actionResult["kind"] == "deterministic_fallback"
    assert response.actionResult["guard_status"] == "hallucinated_hr_value"
    assert "99" not in response.text


def test_confirmation_structure_is_not_enhanced() -> None:
    provider = FakeEnhancementProvider("Texte fournisseur qui ne doit pas remplacer la confirmation.")
    state = make_state()
    state.copilot_provider_router = _router(provider)
    ctx = make_context("EMPLOYEE")

    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "Pointer arrivee",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "provider-confirmation", "language": "fr"},
            context=ctx,
        )
    )

    assert response.requiresConfirmation is True
    assert response.confirmationId
    assert response.actionResult.get("enhancementApplied") is not True
    assert provider.requests == []


def test_provider_tool_like_rewrite_is_not_executed() -> None:
    provider = FakeEnhancementProvider('{"tool":"check_in","arguments":{}}')
    state = make_state()
    state.copilot_provider_router = _router(provider)
    ctx = make_context("EMPLOYEE")

    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "Check my pointage",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "provider-tool-json", "language": "fr"},
            context=ctx,
        )
    )
    services = ensure_copilot_services(state)

    assert response.text == '{"tool":"check_in","arguments":{}}'
    assert response.requiresConfirmation is False
    assert not services["confirmation_store"].find_pending_for_user(ctx.user_id, ctx.tenant_id)


def test_multilingual_enhancement_preserves_language_context() -> None:
    provider = FakeEnhancementProvider("Your attendance status is available from the official tool result.")
    state = make_state()
    state.copilot_provider_router = _router(provider)
    ctx = make_context("EMPLOYEE", language="en")

    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "Check my pointage",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "provider-language", "language": "en"},
            context=ctx,
        )
    )

    assert response.text.startswith("Your attendance")
    assert response.actionResult["enhancementApplied"] is True
    assert provider.requests[0].context.language == "en"
