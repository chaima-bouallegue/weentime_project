from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

from app.context.current_user import CurrentUserContext
from app.core.conversation_state import ConversationStateStore, PendingConversationFlow
from app.guards.response_guard import ResponseGuard
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.result import ToolResult
from app.workflows.session_serializer import serialize_pending_flow
from app.workflows.session_state import SessionState
from app.workflows.session_store import SessionStore
from app.workflows.workflow_orchestrator import WorkflowOrchestrator


class FakeContextBuilder:
    def __init__(self, context: CurrentUserContext) -> None:
        self.context = context

    async def build(self, authorization, *, payload_user_id=None, locale="fr-FR", language="fr"):
        self.context.locale = locale
        self.context.language = language
        return self.context

    def _from_claims(self, claims, *, token, locale, language):
        self.context.locale = locale
        self.context.language = language
        return self.context


class FailRouter:
    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        raise AssertionError("router should not be called when continuity is restored")


class DisabledProviderRouter:
    mode = "disabled"

    async def generate_agent_response(self, request, *, context=None, response_guard=None):
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


def build_orchestrator(
    *,
    context: CurrentUserContext,
    session_store: SessionStore,
    confirmation_store: ConfirmationStore | None = None,
    executor: object | None = None,
) -> WorkflowOrchestrator:
    return WorkflowOrchestrator(
        context_builder=FakeContextBuilder(context),
        router_agent=FailRouter(),
        confirmation_store=confirmation_store or ConfirmationStore(),
        executor=executor or type("Executor", (), {"execute": AsyncMock()})(),
        conversation_store=ConversationStateStore(),
        response_guard=ResponseGuard(),
        provider_router=DisabledProviderRouter(),
        session_store=session_store,
    )


def test_pending_flow_restores_across_orchestrator_instances() -> None:
    context = verified_context()
    session_store = SessionStore(redis_enabled=False, ttl_seconds=1200)
    session = SessionState.from_context(
        request_id="req-flow",
        session_id="sess-flow",
        context=context,
        channel="chat",
        language="fr",
    )
    flow = PendingConversationFlow(
        intent="authorization.create",
        agent="authorization",
        collected_fields={
            "request_date": "2026-05-16",
            "time_start": "09:00:00",
            "time_end": "10:00:00",
            "authorization_type": "SORTIE_ANTICIPEE",
        },
        missing_fields=["reason"],
        last_question="Quel motif souhaitez-vous indiquer pour cette autorisation ?",
    )
    session.pending_flow = serialize_pending_flow(flow)
    session.last_safe_response = AgentResponse(
        type="ask",
        text=flow.last_question or "",
        intent="authorization.create",
        confidence=0.92,
        actionResult={"kind": "slot_filling", "pendingFlow": serialize_pending_flow(flow)},
    ).model_dump(mode="json")
    asyncio.run(session_store.save(session))

    orchestrator = build_orchestrator(context=context, session_store=session_store)
    result = asyncio.run(
        orchestrator.process_message(
            user_id=12,
            message="Rendez-vous medical",
            access_token=None,
            role="EMPLOYEE",
            context=context,
            metadata={"request_id": "req-flow-2", "session_id": "sess-flow"},
        )
    )

    assert result.response.type == "confirm_action"
    assert result.response.requiresConfirmation is True
    assert result.response.confirmationId


def test_continue_replays_last_safe_response() -> None:
    context = verified_context()
    session_store = SessionStore(redis_enabled=False, ttl_seconds=1200)
    session = SessionState.from_context(
        request_id="req-continue",
        session_id="sess-continue",
        context=context,
        channel="chat",
        language="fr",
    )
    session.last_safe_response = AgentResponse(
        type="ask",
        text="Quel motif souhaitez-vous indiquer ?",
        intent="leave.create",
        confidence=0.91,
    ).model_dump(mode="json")
    asyncio.run(session_store.save(session))

    orchestrator = build_orchestrator(context=context, session_store=session_store)
    result = asyncio.run(
        orchestrator.process_message(
            user_id=12,
            message="continue",
            access_token=None,
            role="EMPLOYEE",
            context=context,
            metadata={"request_id": "req-continue-2", "session_id": "sess-continue"},
        )
    )

    assert result.response.type == "ask"
    assert result.response.text == "Quel motif souhaitez-vous indiquer ?"


def test_confirmation_recovery_executes_pending_action() -> None:
    context = verified_context()
    session_store = SessionStore(redis_enabled=False, ttl_seconds=1200)
    confirmation_store = ConfirmationStore(ttl_seconds=1200)
    record = confirmation_store.create(context, "check_in", {})
    session = SessionState.from_context(
        request_id="req-confirm",
        session_id="sess-confirm",
        context=context,
        channel="chat",
        language="fr",
    )
    session.pending_confirmation = {
        "confirmation_id": record.confirmation_id,
        "tool_name": "check_in",
        "tool_arguments": {},
        "status": "pending_confirmation",
    }
    session.last_safe_response = AgentResponse(
        type="confirm_action",
        text="Confirmez-vous le pointage d'entree ?",
        intent="attendance.check_in",
        confidence=0.94,
        requiresConfirmation=True,
        confirmationId=record.confirmation_id,
        toolCalls=[ToolCallRecord(name="check_in", arguments={}, status="pending_confirmation")],
    ).model_dump(mode="json")
    asyncio.run(session_store.save(session))
    executor = type("Executor", (), {"execute": AsyncMock(return_value=ToolResult.ok({"id": 1}, status_code=201))})()

    orchestrator = build_orchestrator(
        context=context,
        session_store=session_store,
        confirmation_store=confirmation_store,
        executor=executor,
    )
    result = asyncio.run(
        orchestrator.process_message(
            user_id=12,
            message="approve",
            access_token=None,
            role="EMPLOYEE",
            context=context,
            metadata={"request_id": "req-confirm-2", "session_id": "sess-confirm"},
        )
    )

    assert result.response.type == "execute_action"
    assert executor.execute.await_count == 1
    assert executor.execute.await_args.kwargs["confirmed"] is True


def test_voice_recovery_preserves_language() -> None:
    context = verified_context(language="tn")
    session_store = SessionStore(redis_enabled=False, ttl_seconds=1200)
    session = SessionState.from_context(
        request_id="req-voice",
        session_id="sess-voice",
        context=context,
        channel="voice",
        language="tn",
    )
    session.last_safe_response = AgentResponse(
        type="answer",
        text="راك حاضر اليوم.",
        intent="attendance.status",
        confidence=0.9,
    ).model_dump(mode="json")
    asyncio.run(session_store.save(session))

    orchestrator = build_orchestrator(context=context, session_store=session_store)
    result = asyncio.run(
        orchestrator.process_message(
            user_id=12,
            message="continue",
            access_token=None,
            role="EMPLOYEE",
            channel="voice",
            context=context,
            metadata={"request_id": "req-voice-2", "session_id": "sess-voice", "language": "tn"},
        )
    )
    stored = asyncio.run(session_store.load(user_id=12, tenant_id=9, channel="voice", session_id="sess-voice"))

    assert result.response.text == "راك حاضر اليوم."
    assert stored is not None
    assert stored.language == "tn"
