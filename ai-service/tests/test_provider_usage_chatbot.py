from __future__ import annotations

import asyncio

from app.core.copilot_engine import ensure_copilot_services, process_copilot_message
from app.models.agent_models import AgentResponse
from chatbot_test_helpers import make_context, make_state


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
