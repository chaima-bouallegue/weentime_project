from __future__ import annotations

import asyncio

from chatbot_test_helpers import ChatbotFakeBackend, make_context_with_metadata, make_state
from app.agents.hr_policy_agent import HRPolicyAgent, POLICY_UNAVAILABLE_TEXT
from app.core.copilot_engine import process_copilot_message
from app.guards.response_guard import ResponseGuard
from app.models.agent_models import AgentResponse
from app.policy import LocalPolicyStore, PolicyRetriever
from app.tools.audit import ToolAuditLogger
from app.tools.executor import ToolExecutor
from app.tools.policy_tools import register_policy_tools
from app.tools.registry import ToolRegistry


async def _send(message: str, *, backend: ChatbotFakeBackend | None = None, role: str = "EMPLOYEE", language: str = "fr", session_id: str = "ml-memory"):
    state = make_state(backend)
    ctx = make_context_with_metadata(role, language=language, conversation_id=session_id)
    response = await process_copilot_message(
        ctx.user_id,
        message,
        None,
        ctx.role,
        metadata={"app_state": state, "session_id": session_id, "conversation_id": session_id, "language": language},
        context=ctx,
    )
    return response, state, backend or state.copilot_backend_client


def _policy_agent() -> HRPolicyAgent:
    registry = ToolRegistry()
    retriever = PolicyRetriever(LocalPolicyStore("tests/fixtures/policies"))
    register_policy_tools(registry, retriever)
    return HRPolicyAgent(ToolExecutor(registry, ToolAuditLogger()))


def test_multilingual_telework_followups_keep_language_and_slots() -> None:
    state = make_state()
    ctx = make_context_with_metadata("EMPLOYEE", language="tn", conversation_id="tn-telework")
    first = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "nheb teletravail",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "tn-telework", "conversation_id": "tn-telework", "language": "tn"},
            context=ctx,
        )
    )
    second = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "ghodwa",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "tn-telework", "conversation_id": "tn-telework", "language": "tn"},
            context=ctx,
        )
    )

    assert first.type == "ask"
    assert first.actionResult["pendingFlow"]["language"] == "tn"
    assert second.type == "confirm_action"
    assert second.actionResult["pendingFlow"]["filledSlots"]["start_date"]


def test_leave_balance_uses_toolregistry_not_rag() -> None:
    backend = ChatbotFakeBackend()
    response, _, used_backend = asyncio.run(_send("Check my leave balance", backend=backend, language="en"))

    assert response.intent.startswith("leave.")
    assert any(call[1] == "/rh/solde-conges/me/all" for call in used_backend.calls)
    assert not any("policy" in str(call).lower() for call in used_backend.calls)


def test_pointage_status_uses_toolregistry_not_llm() -> None:
    backend = ChatbotFakeBackend()
    response, state, used_backend = asyncio.run(_send("Did I check in?", backend=backend, language="en"))

    assert response.intent in {"attendance.status", "attendance.personal_status"}
    assert any(call[1] == "/presence/me/today" for call in used_backend.calls)
    assert response.actionResult.get("llm_used") is False
    assert getattr(state.settings, "ai_provider_mode") == "disabled"


def test_missing_backend_tool_returns_capability_unavailable() -> None:
    response, _, _ = asyncio.run(_send("Creer une tache", language="fr"))

    assert response.intent == "personal_tasks.unavailable"
    assert response.actionResult["kind"] == "capability_unavailable"


def test_policy_question_uses_rag_with_citations() -> None:
    response = asyncio.run(_policy_agent().handle("Quelle est la politique de conge maladie ?", make_context_with_metadata("EMPLOYEE", tenant_id=42)))

    assert response.actionResult["policyAvailable"] is True
    assert response.actionResult["citations"][0]["sourceId"] == "tenant42-sick-leave"


def test_policy_without_citation_is_unavailable() -> None:
    response = asyncio.run(_policy_agent().handle("Quelle est la politique parking velo ?", make_context_with_metadata("EMPLOYEE", tenant_id=42)))

    assert response.text == POLICY_UNAVAILABLE_TEXT
    assert response.actionResult["citations"] == []


def test_write_action_prepares_confirmation_only() -> None:
    response, _, backend = asyncio.run(_send("nheb teletravail ghodwa", language="tn"))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].status == "pending_confirmation"
    assert not any(call[0] == "POST" and "teletravail" in call[1] for call in backend.calls)


def test_response_guard_rejects_raw_sql_and_fake_success() -> None:
    ctx = make_context_with_metadata("EMPLOYEE")
    guard = ResponseGuard()
    sql_response = AgentResponse(
        type="answer",
        text="SELECT * FROM users; Ahmed exists in the database.",
        intent="unsafe.sql",
        confidence=0.9,
        actionResult={"kind": "tool_safe_summary"},
    )

    result = guard.validate(sql_response, ctx)
    assert result.allowed is False