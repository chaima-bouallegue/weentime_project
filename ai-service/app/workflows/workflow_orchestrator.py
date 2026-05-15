from __future__ import annotations

from typing import Any

from app.context.context_builder import ContextBuilder, ContextError
from app.context.current_user import CurrentUserContext
from app.core.conversation_state import PendingConversationFlow
from app.core.deterministic_fallback import deterministic_fallback_response
from app.core.slot_filling import capture_pending_flow, continue_pending_flow
from app.guards.response_guard import ResponseGuard
from app.i18n.response_localizer import localize_agent_response
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.observability.request_context import ensure_request_id
from app.observability.tracing import log_error, log_event, start_span
from app.providers.provider_request import ProviderRequest
from app.providers.router import ProviderRouter
from app.tools.executor import ToolExecutor

from .session_recovery import build_resume_response, build_resume_unavailable_response, classify_recovery_message
from .session_serializer import deserialize_pending_flow, serialize_pending_flow
from .session_state import SessionState
from .session_store import SessionStore
from .workflow_result import WorkflowResult
from .workflow_state import WorkflowState
from .workflow_steps import (
    build_confirmation_execution_response,
    build_confirmation_status_response,
    build_workflow_context,
    guard_result_payload,
    resolve_workflow_language,
    update_state_from_response,
    warnings_from_tool_result,
)

DEFAULT_SESSION_ID = "default"


class WorkflowOrchestrator:
    def __init__(
        self,
        *,
        context_builder: ContextBuilder,
        router_agent: Any,
        confirmation_store: ConfirmationStore,
        executor: ToolExecutor,
        conversation_store: Any,
        response_guard: ResponseGuard,
        provider_router: ProviderRouter,
        session_store: SessionStore | None = None,
    ) -> None:
        self.context_builder = context_builder
        self.router_agent = router_agent
        self.confirmation_store = confirmation_store
        self.executor = executor
        self.conversation_store = conversation_store
        self.response_guard = response_guard
        self.provider_router = provider_router
        self.session_store = session_store or SessionStore()

    async def process_message(
        self,
        *,
        user_id: int,
        message: str,
        access_token: str | None,
        role: str | None,
        channel: str = "chat",
        metadata: dict[str, Any] | None = None,
        context: CurrentUserContext | None = None,
    ) -> WorkflowResult:
        resolved_metadata = dict(metadata or {})
        request_id = ensure_request_id(str(resolved_metadata.get("request_id") or "") or None)
        language = resolve_workflow_language(message, resolved_metadata)

        with start_span(
            "workflow.orchestrate",
            {
                "channel": channel,
                "language": language,
                "request_id": request_id,
                "message_length": len(message or ""),
            },
        ):
            verified_context = await build_workflow_context(
                context_builder=self.context_builder,
                access_token=access_token,
                user_id=user_id,
                role=role,
                language=language,
                metadata=resolved_metadata,
                context=context,
            )
            verified_context.metadata["request_id"] = request_id
            state = WorkflowState.from_context(
                request_id,
                verified_context,
                channel=channel,
                language=verified_context.language or language,
            )
            log_event(
                "workflow.started",
                metadata={
                    "request_id": request_id,
                    "channel": channel,
                    "role": verified_context.role,
                    "tenant_id": verified_context.tenant_id,
                    "language": verified_context.language,
                },
            )
            return await self._run_message_flow(
                message=message,
                channel=channel,
                metadata=resolved_metadata,
                context=verified_context,
                state=state,
            )

    async def confirm_action(
        self,
        *,
        approved: bool,
        confirmation_id: str,
        access_token: str | None = None,
        context: CurrentUserContext | None = None,
        channel: str = "chat",
        metadata: dict[str, Any] | None = None,
    ) -> WorkflowResult:
        resolved_metadata = dict(metadata or {})
        request_id = ensure_request_id(str(resolved_metadata.get("request_id") or "") or None)
        language = str((resolved_metadata.get("language") or (context.language if context else "fr")) or "fr")

        with start_span(
            "workflow.confirmation",
            {"approved": approved, "channel": channel, "request_id": request_id, "confirmation_id": confirmation_id},
        ):
            verified_context = await build_workflow_context(
                context_builder=self.context_builder,
                access_token=access_token,
                user_id=context.user_id if context else 0,
                role=context.role if context else None,
                language=language,
                metadata=resolved_metadata,
                context=context,
            )
            verified_context.metadata["request_id"] = request_id
            state = WorkflowState.from_context(
                request_id,
                verified_context,
                channel=channel,
                language=verified_context.language or language,
            )
            session_id = _normalized_session_id(resolved_metadata.get("session_id"))
            if session_id is None:
                recovered = await self.session_store.load_by_confirmation(
                    user_id=verified_context.user_id,
                    tenant_id=verified_context.tenant_id,
                    confirmation_id=confirmation_id,
                )
                if recovered is not None:
                    session_id = recovered.session_id
            return await self._confirm_record(
                approved=approved,
                confirmation_id=confirmation_id,
                context=verified_context,
                state=state,
                session_id=session_id,
            )

    async def maybe_confirm_latest_pending(
        self,
        *,
        approved: bool,
        context: CurrentUserContext,
        channel: str = "voice",
        metadata: dict[str, Any] | None = None,
    ) -> WorkflowResult | None:
        resolved_metadata = dict(metadata or {})
        record = self.confirmation_store.find_pending_for_user(context.user_id, context.tenant_id)
        if record is not None:
            if not resolved_metadata.get("session_id"):
                session = await self.session_store.load_by_confirmation(
                    user_id=context.user_id,
                    tenant_id=context.tenant_id,
                    confirmation_id=record.confirmation_id,
                )
                if session is not None:
                    resolved_metadata["session_id"] = session.session_id
            return await self.confirm_action(
                approved=approved,
                confirmation_id=record.confirmation_id,
                context=context,
                channel=channel,
                metadata=resolved_metadata,
            )

        session = await self.session_store.load_latest_for_user(
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            channel=channel,
        )
        confirmation_id = _session_confirmation_id(session)
        if confirmation_id is None:
            return None
        resolved_metadata.setdefault("session_id", session.session_id)
        return await self.confirm_action(
            approved=approved,
            confirmation_id=confirmation_id,
            context=context,
            channel=channel,
            metadata=resolved_metadata,
        )

    async def _run_message_flow(
        self,
        *,
        message: str,
        channel: str,
        metadata: dict[str, Any],
        context: CurrentUserContext,
        state: WorkflowState,
    ) -> WorkflowResult:
        session_id = _normalized_session_id(metadata.get("session_id")) or DEFAULT_SESSION_ID
        recovered_session = await self._recover_session_state(context=context, session_id=session_id, channel=channel)
        if recovered_session is not None:
            session_id = recovered_session.session_id or session_id

        recovery = classify_recovery_message(message)
        if recovery.matched:
            recovered_result = await self._handle_recovery_message(
                message=message,
                recovery_action=recovery.action,
                recovered_session=recovered_session,
                context=context,
                state=state,
                session_id=session_id,
            )
            if recovered_result is not None:
                return recovered_result

        try:
            if _is_why_message(message):
                last_error = self.conversation_store.get_last_error(context, session_id)
                if last_error:
                    response = AgentResponse(
                        type="answer",
                        text=f"La derniere erreur vient de ceci : {last_error}",
                        intent="conversation.explain_last_error",
                        confidence=0.9,
                        actionResult={"kind": "error_explanation", "lastError": last_error},
                    )
                    response = localize_agent_response(response, context)
                    return await self._finalize_response(
                        response,
                        context=context,
                        state=state,
                        session_id=session_id,
                        message=message,
                        record_last_error=False,
                    )

            response = await continue_pending_flow(
                message=message,
                context=context,
                store=self.conversation_store,
                executor=self.executor,
                confirmation_store=self.confirmation_store,
                session_id=session_id,
            )
            if response is None:
                response = await self.router_agent.handle(message, context)
                response = capture_pending_flow(
                    message=message,
                    response=response,
                    context=context,
                    store=self.conversation_store,
                    session_id=session_id,
                )
                if self._should_use_provider_fallback(response, metadata):
                    response = await self._provider_fallback(
                        message=message,
                        channel=channel,
                        context=context,
                        state=state,
                    )

            response = localize_agent_response(response, context)
            return await self._finalize_response(
                response,
                context=context,
                state=state,
                session_id=session_id,
                message=message,
                record_last_error=True,
            )
        except ContextError:
            raise
        except Exception as exc:  # noqa: BLE001
            log_error("workflow.execution_error", exc, {"request_id": state.request_id, "channel": channel})
            fallback_reason = "provider_unavailable" if metadata.get("allow_provider_fallback") else "unsafe_response"
            state.mark_fallback(fallback_reason)
            response = deterministic_fallback_response(fallback_reason, context=context)
            return await self._finalize_response(
                response,
                context=context,
                state=state,
                session_id=session_id,
                message=message,
                record_last_error=True,
            )

    async def _confirm_record(
        self,
        *,
        approved: bool,
        confirmation_id: str,
        context: CurrentUserContext,
        state: WorkflowState,
        session_id: str | None = None,
    ) -> WorkflowResult:
        with start_span("workflow.confirmation.lookup", {"user_id": context.user_id, "tenant_id": context.tenant_id}):
            record = self.confirmation_store.get(confirmation_id)
        if record is None:
            state.error_code = "confirmation_not_found"
            response = build_confirmation_status_response(
                code="confirmation_not_found",
                text="Confirmation introuvable ou expiree.",
                request_id=state.request_id,
                confirmation_id=confirmation_id,
                status="not_found",
            )
            return self._controlled_confirmation_result(
                response=response,
                context=context,
                state=state,
                session_id=session_id,
            )
        if record.user_id != context.user_id or record.tenant_id != context.tenant_id:
            raise ContextError("confirmation_context_mismatch", "Cette confirmation ne correspond pas a votre session.", 403)
        if record.status == "expired" or record.expired:
            state.error_code = "confirmation_expired"
            response = build_confirmation_status_response(
                code="confirmation_expired",
                text="Cette confirmation a expire.",
                request_id=state.request_id,
                confirmation_id=record.confirmation_id,
                status="expired",
            )
            return self._controlled_confirmation_result(
                response=response,
                context=context,
                state=state,
                session_id=session_id,
            )
        if record.status in {"consumed", "approved", "rejected"} or record.status != "pending":
            state.error_code = "confirmation_already_used"
            response = build_confirmation_status_response(
                code="confirmation_already_used",
                text="Cette action a deja ete traitee.",
                request_id=state.request_id,
                confirmation_id=record.confirmation_id,
                status="already_used",
                success=True,
            )
            return self._controlled_confirmation_result(
                response=response,
                context=context,
                state=state,
                session_id=session_id,
            )

        if not approved:
            self.confirmation_store.reject(record.confirmation_id)
            response = AgentResponse(
                type="answer",
                text="Action annulee.",
                intent="confirmation.rejected",
                confidence=1.0,
                requiresConfirmation=False,
                confirmationId=record.confirmation_id,
            )
            return await self._finalize_response(response, context=context, state=state, session_id=session_id)

        self.confirmation_store.consume(record.confirmation_id)
        result = await self.executor.execute(
            record.tool_name,
            record.tool_input,
            context,
            confirmed=True,
            request_id=state.request_id,
        )
        response = build_confirmation_execution_response(record, result)
        log_event(
            "confirmation.executed",
            metadata={
                "confirmation_id": record.confirmation_id,
                "tool_name": record.tool_name,
                "status": "success" if result.success else response.toolCalls[0].status,
                "http_status": result.status_code,
            },
        )
        return await self._finalize_response(
            response,
            context=context,
            state=state,
            session_id=session_id,
            warnings=list(result.warnings or []),
        )

    def _controlled_confirmation_result(
        self,
        *,
        response: AgentResponse,
        context: CurrentUserContext,
        state: WorkflowState,
        session_id: str | None = None,
    ) -> WorkflowResult:
        localized = localize_agent_response(response, context)
        update_state_from_response(state, localized, context)
        state.selected_agent = "confirmation"
        log_event(
            "workflow.completed",
            metadata={
                "request_id": state.request_id,
                "intent": state.intent,
                "selected_agent": state.selected_agent,
                "fallback_used": state.fallback_used,
                "error_code": state.error_code,
                "channel": state.channel,
                "session_id": session_id,
            },
        )
        return WorkflowResult(
            response=localized,
            state=state,
            context=context,
        )

    async def _provider_fallback(
        self,
        *,
        message: str,
        channel: str,
        context: CurrentUserContext,
        state: WorkflowState,
    ) -> AgentResponse:
        request = ProviderRequest.build(
            message,
            context=context,
            channel=channel,
            intent=state.intent,
            metadata={"request_id": state.request_id, "selected_agent": state.selected_agent},
        )
        try:
            response = await self.provider_router.generate_agent_response(request, context=context, response_guard=None)
        except Exception as exc:  # noqa: BLE001
            log_error("workflow.provider_fallback_error", exc, {"request_id": state.request_id})
            state.mark_fallback("provider_unavailable")
            return deterministic_fallback_response("provider_unavailable", context=context)
        state.selected_agent = "provider_fallback"
        return response

    async def _handle_recovery_message(
        self,
        *,
        message: str,
        recovery_action: str,
        recovered_session: SessionState | None,
        context: CurrentUserContext,
        state: WorkflowState,
        session_id: str,
    ) -> WorkflowResult | None:
        if recovery_action == "none":
            return None
        if recovered_session is None:
            response = build_resume_unavailable_response()
            return await self._finalize_response(
                response,
                context=context,
                state=state,
                session_id=session_id,
                message=message,
                record_last_error=False,
            )

        if recovery_action in {"approve", "reject"}:
            confirmation_id = _session_confirmation_id(recovered_session)
            if confirmation_id is None:
                response = build_resume_response(recovered_session) or build_resume_unavailable_response()
                return await self._finalize_response(
                    response,
                    context=context,
                    state=state,
                    session_id=recovered_session.session_id,
                    message=message,
                    record_last_error=False,
                )
            return await self._confirm_record(
                approved=recovery_action == "approve",
                confirmation_id=confirmation_id,
                context=context,
                state=state,
                session_id=recovered_session.session_id,
            )

        if recovery_action == "continue":
            response = build_resume_response(recovered_session) or build_resume_unavailable_response()
            return await self._finalize_response(
                response,
                context=context,
                state=state,
                session_id=recovered_session.session_id,
                message=message,
                record_last_error=False,
            )
        return None

    async def _recover_session_state(
        self,
        *,
        context: CurrentUserContext,
        session_id: str,
        channel: str,
    ) -> SessionState | None:
        session = await self.session_store.load(
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            channel=channel,
            session_id=session_id,
        )
        if session is None:
            session = await self.session_store.load_latest_for_user(
                user_id=context.user_id,
                tenant_id=context.tenant_id,
                channel=channel,
            )
        if session is None:
            return None

        restored_flow = deserialize_pending_flow(session.pending_flow)
        if restored_flow is not None and self.conversation_store.get(context, session.session_id) is None:
            self.conversation_store.save(context, restored_flow, session.session_id)
            log_event(
                "workflow.session.flow_restored",
                metadata={
                    "session_id": session.session_id,
                    "intent": restored_flow.intent,
                    "channel": channel,
                },
            )
        elif session.pending_flow and restored_flow is None:
            session.pending_flow = None
            await self.session_store.save(session)

        log_event(
            "workflow.session.recovered",
            metadata={
                "session_id": session.session_id,
                "channel": channel,
                "has_pending_confirmation": bool(session.pending_confirmation),
                "has_pending_flow": bool(session.pending_flow),
            },
        )
        return session

    async def _finalize_response(
        self,
        response: AgentResponse,
        *,
        context: CurrentUserContext,
        state: WorkflowState,
        session_id: str | None = None,
        message: str | None = None,
        record_last_error: bool = False,
        warnings: list[str] | None = None,
    ) -> WorkflowResult:
        update_state_from_response(state, response, context)
        guard_result = self.response_guard.validate(response, context)
        state.guard_result = guard_result_payload(guard_result)
        guarded_response = self.response_guard.guard_response(response, context)
        update_state_from_response(state, guarded_response, context)

        if not guard_result.allowed:
            state.mark_fallback(guard_result.primary_category or "guard_rejected")
        elif isinstance(guarded_response.actionResult, dict) and guarded_response.actionResult.get("kind") == "deterministic_fallback":
            state.mark_fallback(str(guarded_response.actionResult.get("fallback_reason") or "unsafe_response"))

        if record_last_error and guarded_response.type == "error":
            self.conversation_store.record_last_error(context, guarded_response.text, session_id)

        if session_id:
            await self._persist_session_state(
                context=context,
                state=state,
                response=guarded_response,
                session_id=session_id,
                message=message,
            )

        log_event(
            "workflow.completed",
            metadata={
                "request_id": state.request_id,
                "intent": state.intent,
                "selected_agent": state.selected_agent,
                "fallback_used": state.fallback_used,
                "error_code": state.error_code,
                "channel": state.channel,
                "session_id": session_id,
            },
        )
        tool_warnings = warnings or warnings_from_tool_result(state.tool_result)
        return WorkflowResult(
            response=guarded_response,
            state=state,
            context=context,
            warnings=tool_warnings,
        )

    async def _persist_session_state(
        self,
        *,
        context: CurrentUserContext,
        state: WorkflowState,
        response: AgentResponse,
        session_id: str,
        message: str | None,
    ) -> None:
        session = await self.session_store.load(
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            channel=state.channel,
            session_id=session_id,
        )
        if session is None:
            session = SessionState.from_context(
                request_id=state.request_id,
                session_id=session_id,
                context=context,
                channel=state.channel,
                language=context.language or state.language,
            )

        session.request_id = state.request_id
        session.role = context.role
        session.language = context.language or state.language
        session.intent = state.intent
        session.selected_agent = state.selected_agent
        session.pending_confirmation = state.pending_confirmation
        session.last_safe_response = response.model_dump(mode="json")

        pending_flow = self.conversation_store.get(context, session_id)
        session.pending_flow = serialize_pending_flow(pending_flow if isinstance(pending_flow, PendingConversationFlow) else None)

        if message:
            session.remember_context(
                {
                    "speaker": "user",
                    "text": message,
                    "request_id": state.request_id,
                }
            )
        session.remember_context(
            {
                "speaker": "assistant",
                "text": response.text,
                "intent": response.intent,
                "type": response.type,
                "confirmation_id": response.confirmationId,
                "request_id": state.request_id,
            }
        )

        tool_entry = _tool_history_entry(state, response)
        if tool_entry:
            session.remember_tool(tool_entry)

        await self.session_store.save(session)

    @staticmethod
    def _should_use_provider_fallback(response: AgentResponse, metadata: dict[str, Any]) -> bool:
        if not metadata.get("allow_provider_fallback"):
            return False
        return response.intent == "fallback.unknown"


def _tool_history_entry(state: WorkflowState, response: AgentResponse) -> dict[str, Any] | None:
    tool_call = response.toolCalls[0] if response.toolCalls else None
    if tool_call is None and not isinstance(state.tool_result, dict):
        return None
    entry: dict[str, Any] = {
        "request_id": state.request_id,
        "intent": response.intent,
    }
    if tool_call is not None:
        entry["tool_name"] = tool_call.name
        entry["status"] = tool_call.status
        entry["arguments"] = dict(tool_call.arguments)
    if isinstance(state.tool_result, dict):
        entry["success"] = state.tool_result.get("success")
        entry["status_code"] = state.tool_result.get("status_code")
        entry["error_code"] = state.tool_result.get("error_code")
        entry["kind"] = state.tool_result.get("kind")
    return entry


def _session_confirmation_id(session: SessionState | None) -> str | None:
    if session is None or not isinstance(session.pending_confirmation, dict):
        return None
    value = str(session.pending_confirmation.get("confirmation_id") or "").strip()
    return value or None


def _normalized_session_id(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _is_why_message(message: str | None) -> bool:
    text = (message or "").strip().lower()
    return text in {"pourquoi", "why", "Ø¹Ù„Ø§Ø´", "Ù„Ù…Ø§Ø°Ø§", "علاش", "لماذا"}
