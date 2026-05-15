from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.context.context_builder import ContextError
from app.context.current_user import CurrentUserContext
from app.core.conversation_state import ConversationStateStore
from app.guards.response_guard import SAFE_FALLBACK_TEXT, ResponseGuard
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.result import ToolResult, build_read_result
from app.workflows.workflow_orchestrator import WorkflowOrchestrator


class FakeContextBuilder:
    def __init__(self, context: CurrentUserContext) -> None:
        self.context = context

    async def build(self, authorization, *, payload_user_id=None, locale="fr-FR", language="fr"):
        self.context.locale = locale
        self.context.language = language
        return self.context

    def _from_claims(self, claims, *, token, locale, language):  # pragma: no cover - compatibility only
        self.context.locale = locale
        self.context.language = language
        return self.context


class StaticRouter:
    def __init__(self, response: AgentResponse) -> None:
        self.response = response

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        context.metadata.setdefault("selected_agent", "attendance")
        return self.response


class FailingProviderRouter:
    mode = "ollama"

    async def generate_agent_response(self, request, *, context=None, response_guard=None):
        raise RuntimeError("provider down")


class DisabledProviderRouter:
    mode = "disabled"

    async def generate_agent_response(self, request, *, context=None, response_guard=None):  # pragma: no cover - not used
        raise AssertionError("provider fallback should not be called")


def verified_context(*, language: str = "fr") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role="EMPLOYEE",
        entreprise_id=9,
        token="token",
        language=language,
        metadata={"jwt_verified": True},
    )


def orchestrator_for(
    response: AgentResponse,
    *,
    context: CurrentUserContext | None = None,
    executor: Any | None = None,
    provider_router: Any | None = None,
) -> WorkflowOrchestrator:
    resolved_context = context or verified_context()
    resolved_executor = executor or type("Executor", (), {"execute": AsyncMock()})()
    return WorkflowOrchestrator(
        context_builder=FakeContextBuilder(resolved_context),
        router_agent=StaticRouter(response),
        confirmation_store=ConfirmationStore(),
        executor=resolved_executor,
        conversation_store=ConversationStateStore(),
        response_guard=ResponseGuard(),
        provider_router=provider_router or DisabledProviderRouter(),
    )


def authoritative_read_response() -> AgentResponse:
    tool_result = ToolResult.ok(
        {"read_result": build_read_result(tool_name="get_pointage_status", summary="Statut de pointage: ACTIVE.", data={"status": "ACTIVE"})},
        status_code=200,
    )
    return AgentResponse(
        type="answer",
        text="Statut de pointage: ACTIVE.",
        intent="attendance.status",
        confidence=0.9,
        toolCalls=[ToolCallRecord(name="get_pointage_status", arguments={}, status="success")],
        actionResult=tool_result.model_dump(mode="json"),
    )


def test_chat_read_workflow_collects_read_evidence() -> None:
    orchestrator = orchestrator_for(authoritative_read_response())

    result = asyncio.run(
        orchestrator.process_message(
            user_id=12,
            message="Est-ce que je suis pointe ?",
            access_token=None,
            role="EMPLOYEE",
            context=verified_context(),
            metadata={"request_id": "req-read"},
        )
    )

    assert result.response.intent == "attendance.status"
    assert result.state.intent == "attendance.status"
    assert result.state.read_evidence[0]["tool_name"] == "get_pointage_status"
    assert result.state.fallback_used is False


def test_confirmed_workflow_executes_tool() -> None:
    executor = type("Executor", (), {"execute": AsyncMock(return_value=ToolResult.ok({"id": 1}, status_code=201))})()
    store = ConfirmationStore()
    context = verified_context()
    record = store.create(context, "check_in", {})
    orchestrator = WorkflowOrchestrator(
        context_builder=FakeContextBuilder(context),
        router_agent=StaticRouter(authoritative_read_response()),
        confirmation_store=store,
        executor=executor,
        conversation_store=ConversationStateStore(),
        response_guard=ResponseGuard(),
        provider_router=DisabledProviderRouter(),
    )

    result = asyncio.run(
        orchestrator.confirm_action(
            approved=True,
            confirmation_id=record.confirmation_id,
            context=context,
            metadata={"request_id": "req-confirm"},
        )
    )

    assert result.response.type == "execute_action"
    assert result.response.text == "Pointage d'entree confirme."
    assert executor.execute.await_count == 1
    assert executor.execute.await_args.kwargs["confirmed"] is True


def test_unverified_context_rejected() -> None:
    unverified = CurrentUserContext(
        user_id=12,
        role="EMPLOYEE",
        entreprise_id=9,
        token=None,
        metadata={"jwt_verified": False},
    )
    orchestrator = orchestrator_for(authoritative_read_response(), context=unverified)

    with pytest.raises(ContextError) as exc:
        asyncio.run(
            orchestrator.process_message(
                user_id=12,
                message="status",
                access_token=None,
                role="EMPLOYEE",
                context=unverified,
                metadata={"request_id": "req-unverified"},
            )
        )

    assert exc.value.code == "unverified_context"


def test_guard_rejection_triggers_fallback() -> None:
    response = AgentResponse(
        type="answer",
        text="Il vous reste 99 jours de conge.",
        intent="leave.balance",
        confidence=0.9,
    )
    orchestrator = orchestrator_for(response)

    result = asyncio.run(
        orchestrator.process_message(
            user_id=12,
            message="Combien de jours de conge ?",
            access_token=None,
            role="EMPLOYEE",
            context=verified_context(),
            metadata={"request_id": "req-guard"},
        )
    )

    assert result.response.intent == "fallback.guard_rejected"
    assert result.response.text == SAFE_FALLBACK_TEXT
    assert result.state.fallback_used is True
    assert result.state.error_code == "hallucinated_hr_value"


def test_provider_failure_triggers_fallback() -> None:
    response = AgentResponse(type="ask", text="Je ne sais pas.", intent="fallback.unknown", confidence=0.2)
    orchestrator = orchestrator_for(response, provider_router=FailingProviderRouter())

    result = asyncio.run(
        orchestrator.process_message(
            user_id=12,
            message="Question libre",
            access_token=None,
            role="EMPLOYEE",
            context=verified_context(),
            metadata={"request_id": "req-provider", "allow_provider_fallback": True},
        )
    )

    assert result.response.intent == "fallback.provider_unavailable"
    assert result.state.fallback_used is True
    assert result.state.error_code == "provider_unavailable"


def test_no_autonomous_write_execution() -> None:
    executor = type("Executor", (), {"execute": AsyncMock()})()
    response = AgentResponse(
        type="confirm_action",
        text="Confirmez-vous le pointage d'entree ?",
        intent="attendance.check_in",
        confidence=0.94,
        requiresConfirmation=True,
        confirmationId="conf-1",
        toolCalls=[ToolCallRecord(name="check_in", arguments={}, status="pending_confirmation")],
    )
    orchestrator = orchestrator_for(response, executor=executor)

    result = asyncio.run(
        orchestrator.process_message(
            user_id=12,
            message="pointer mon entree",
            access_token=None,
            role="EMPLOYEE",
            context=verified_context(),
            metadata={"request_id": "req-write"},
        )
    )

    assert result.response.type == "confirm_action"
    assert result.state.pending_confirmation is not None
    assert executor.execute.await_count == 0


def test_braintrust_span_emitted_if_enabled(monkeypatch) -> None:
    started: list[str] = []

    class FakeSpan:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeBraintrustLogger:
        def start_span(self, name, span_attributes=None, metadata=None, **kwargs):
            started.append(name)
            return FakeSpan()

        def log(self, *args, **kwargs):
            return None

    monkeypatch.setattr("app.observability.tracing.get_braintrust_logger", lambda: FakeBraintrustLogger())
    orchestrator = orchestrator_for(authoritative_read_response())

    asyncio.run(
        orchestrator.process_message(
            user_id=12,
            message="status",
            access_token=None,
            role="EMPLOYEE",
            context=verified_context(),
            metadata={"request_id": "req-span"},
        )
    )

    assert "workflow.orchestrate" in started
