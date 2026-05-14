from __future__ import annotations

from typing import Any, Awaitable, Callable

from app.agents.attendance_agent import AttendanceAgent
from app.agents.admin_agent import AdminAgent
from app.agents.authorization_agent import AuthorizationAgent
from app.agents.document_agent import DocumentAgent
from app.agents.hr_policy_agent import HRPolicyAgent
from app.agents.insight_agent import InsightAgent
from app.agents.leave_agent import LeaveAgent
from app.agents.legacy_agent import LegacyAgent
from app.agents.manager_agent import ManagerAgent
from app.agents.rh_agent import RHAgent
from app.agents.router_agent import RouterAgent
from app.agents.telework_agent import TeleworkAgent
from app.agents.role_copilots import AdminCopilot, EmployeeCopilot, ManagerCopilot, RHCopilot
from app.context.context_builder import ContextBuilder, ContextError
from app.core.conversation_state import ConversationStateStore
from app.core.slot_filling import capture_pending_flow, continue_pending_flow
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.nlp.language_detector import detect_language
from app.i18n.response_localizer import localize_agent_response
from app.observability.request_context import ensure_request_id
from app.observability.tracing import log_error, log_event, start_span
from app.guards.response_guard import ResponseGuard
from app.insights import InsightEngine
from app.policy import LocalPolicyStore, PolicyRetriever
from app.providers.router import ProviderRouter
from app.tools.attendance_tools import register_attendance_tools
from app.tools.admin_tools import register_admin_tools
from app.tools.audit import ToolAuditLogger
from app.tools.authorization_tools import register_authorization_tools
from app.tools.backend_client import BackendClient
from app.tools.document_tools import register_document_tools
from app.tools.executor import ToolExecutor
from app.tools.insight_tools import register_insight_tools
from app.tools.leave_tools import register_leave_tools
from app.tools.legacy_adapter import register_legacy_hr_tools
from app.tools.policy_tools import register_policy_tools
from app.tools.registry import ToolRegistry
from app.tools.telework_tools import register_telework_tools

LegacyHandler = Callable[[Any], Awaitable[Any]]

_APP_STATE: Any | None = None
_LEGACY_HANDLER: LegacyHandler | None = None


def configure_copilot_engine(app_state: Any, *, legacy_handler: LegacyHandler | None = None) -> None:
    global _APP_STATE, _LEGACY_HANDLER
    _APP_STATE = app_state
    if legacy_handler is not None:
        _LEGACY_HANDLER = legacy_handler


def ensure_copilot_services(app_state: Any | None = None) -> dict[str, Any]:
    state = app_state or _APP_STATE
    if state is None:
        raise RuntimeError("copilot_engine_not_configured")
    if getattr(state, "copilot_ready", False):
        if not hasattr(state, "copilot_conversation_store"):
            state.copilot_conversation_store = ConversationStateStore()
        if not hasattr(state, "copilot_response_guard"):
            state.copilot_response_guard = ResponseGuard()
        if not hasattr(state, "copilot_provider_router"):
            state.copilot_provider_router = ProviderRouter.from_settings(getattr(state, "settings", None))
        return {
            "context_builder": state.copilot_context_builder,
            "router_agent": state.copilot_router_agent,
            "confirmation_store": state.copilot_confirmation_store,
            "executor": state.copilot_tool_executor,
            "conversation_store": state.copilot_conversation_store,
            "response_guard": state.copilot_response_guard,
            "provider_router": state.copilot_provider_router,
        }

    settings = getattr(state, "settings", None)
    timeout = float(getattr(settings, "backend_timeout_seconds", 20.0)) if settings else 20.0
    base_url = getattr(settings, "backend_base_url", None) if settings else None
    backend_client = getattr(state, "copilot_backend_client", None) or BackendClient(base_url=base_url, timeout=timeout)
    policy_store = getattr(state, "copilot_policy_store", None) or LocalPolicyStore()
    policy_retriever = getattr(state, "copilot_policy_retriever", None) or PolicyRetriever(policy_store)
    insight_engine = getattr(state, "copilot_insight_engine", None) or InsightEngine()
    context_builder = getattr(state, "copilot_context_builder", None) or ContextBuilder(backend_client)
    registry = getattr(state, "copilot_tool_registry", None) or ToolRegistry()

    if not getattr(state, "copilot_attendance_registered", False):
        register_attendance_tools(registry, backend_client)
        state.copilot_attendance_registered = True
    if not getattr(state, "copilot_leave_tools_registered", False):
        register_leave_tools(registry, backend_client)
        state.copilot_leave_tools_registered = True
    if not getattr(state, "copilot_document_tools_registered", False):
        register_document_tools(registry, backend_client)
        state.copilot_document_tools_registered = True
    if not getattr(state, "copilot_telework_tools_registered", False):
        register_telework_tools(registry, backend_client)
        state.copilot_telework_tools_registered = True
    if not getattr(state, "copilot_authorization_tools_registered", False):
        register_authorization_tools(registry, backend_client)
        state.copilot_authorization_tools_registered = True
    if not getattr(state, "copilot_admin_tools_registered", False):
        register_admin_tools(registry, backend_client)
        state.copilot_admin_tools_registered = True
    if not getattr(state, "copilot_policy_tools_registered", False):
        register_policy_tools(registry, policy_retriever)
        state.copilot_policy_tools_registered = True
    if not getattr(state, "copilot_legacy_tools_registered", False):
        register_legacy_hr_tools(registry, getattr(state, "hr_tools", None))
        state.copilot_legacy_tools_registered = True

    confirmation_store = getattr(state, "copilot_confirmation_store", None) or ConfirmationStore()
    conversation_store = getattr(state, "copilot_conversation_store", None) or ConversationStateStore()
    response_guard = getattr(state, "copilot_response_guard", None) or ResponseGuard()
    provider_router = getattr(state, "copilot_provider_router", None) or ProviderRouter.from_settings(settings)
    executor = getattr(state, "copilot_tool_executor", None) or ToolExecutor(registry, ToolAuditLogger())
    if not getattr(state, "copilot_insight_tools_registered", False):
        register_insight_tools(registry, executor, insight_engine)
        state.copilot_insight_tools_registered = True
    attendance_agent = getattr(state, "copilot_attendance_agent", None) or AttendanceAgent(executor, confirmation_store)
    leave_agent = getattr(state, "copilot_leave_agent", None) or LeaveAgent(executor, confirmation_store)
    document_agent = getattr(state, "copilot_document_agent", None) or DocumentAgent(executor, confirmation_store)
    telework_agent = getattr(state, "copilot_telework_agent", None) or TeleworkAgent(executor, confirmation_store)
    authorization_agent = getattr(state, "copilot_authorization_agent", None) or AuthorizationAgent(executor, confirmation_store)
    manager_agent = getattr(state, "copilot_manager_agent", None) or ManagerAgent(executor, confirmation_store)
    rh_agent = getattr(state, "copilot_rh_agent", None) or RHAgent(executor, confirmation_store)
    admin_agent = getattr(state, "copilot_admin_agent", None) or AdminAgent(executor, confirmation_store)
    employee_copilot = getattr(state, "copilot_employee_copilot", None) or EmployeeCopilot(executor)
    manager_copilot = getattr(state, "copilot_manager_copilot", None) or ManagerCopilot(executor)
    rh_copilot = getattr(state, "copilot_rh_copilot", None) or RHCopilot(executor)
    admin_copilot = getattr(state, "copilot_admin_copilot", None) or AdminCopilot(executor)
    hr_policy_agent = getattr(state, "copilot_hr_policy_agent", None) or HRPolicyAgent(executor)
    insight_agent = getattr(state, "copilot_insight_agent", None) or InsightAgent(executor)
    legacy_agent = getattr(state, "copilot_legacy_agent", None) or LegacyAgent(_LEGACY_HANDLER or getattr(state, "legacy_process_chat", None))
    router_agent = getattr(state, "copilot_router_agent", None) or RouterAgent(
        attendance_agent,
        extra_agents=[
            leave_agent,
            document_agent,
            telework_agent,
            authorization_agent,
            manager_agent,
            rh_agent,
            admin_agent,
            insight_agent,
            employee_copilot,
            manager_copilot,
            rh_copilot,
            admin_copilot,
            hr_policy_agent,
        ],
        legacy_agent=legacy_agent,
    )

    state.copilot_backend_client = backend_client
    state.copilot_policy_store = policy_store
    state.copilot_policy_retriever = policy_retriever
    state.copilot_insight_engine = insight_engine
    state.copilot_context_builder = context_builder
    state.copilot_tool_registry = registry
    state.copilot_confirmation_store = confirmation_store
    state.copilot_conversation_store = conversation_store
    state.copilot_response_guard = response_guard
    state.copilot_provider_router = provider_router
    state.copilot_tool_executor = executor
    state.copilot_attendance_agent = attendance_agent
    state.copilot_leave_agent = leave_agent
    state.copilot_document_agent = document_agent
    state.copilot_telework_agent = telework_agent
    state.copilot_authorization_agent = authorization_agent
    state.copilot_manager_agent = manager_agent
    state.copilot_rh_agent = rh_agent
    state.copilot_admin_agent = admin_agent
    state.copilot_insight_agent = insight_agent
    state.copilot_employee_copilot = employee_copilot
    state.copilot_manager_copilot = manager_copilot
    state.copilot_rh_copilot = rh_copilot
    state.copilot_admin_copilot = admin_copilot
    state.copilot_hr_policy_agent = hr_policy_agent
    state.copilot_legacy_agent = legacy_agent
    state.copilot_router_agent = router_agent
    state.copilot_ready = True
    return {
        "context_builder": context_builder,
        "router_agent": router_agent,
        "confirmation_store": confirmation_store,
        "executor": executor,
        "conversation_store": conversation_store,
        "response_guard": response_guard,
        "provider_router": provider_router,
    }


async def process_copilot_message(
    user_id: int,
    message: str,
    access_token: str | None,
    role: str | None,
    channel: str = "chat",
    metadata: dict | None = None,
):
    metadata = metadata or {}
    state = metadata.get("app_state") or _APP_STATE
    services = ensure_copilot_services(state)
    request_id = ensure_request_id(str(metadata.get("request_id") or "") or None)
    provided_language = str(metadata.get("language") or "").lower()
    language = provided_language if provided_language in {"fr", "en", "ar", "tn"} else detect_language(message)

    with start_span(
        "copilot.request",
        {
            "channel": channel,
            "language": language,
            "message_length": len(message or ""),
            "request_id": request_id,
        },
    ):
        if not access_token and metadata.get("allow_legacy_without_token"):
            context = services["context_builder"]._from_claims(  # compatibility path for old /chat tests and clients
                type("Claims", (), {
                    "user_id": user_id,
                    "email": None,
                    "role": role or "EMPLOYEE",
                    "entreprise_id": None,
                    "department_id": None,
                    "team_id": None,
                    "manager_id": None,
                })(),
                token="",
                locale=metadata.get("locale", "fr-FR"),
                language=language,
            )
            context.metadata["request_id"] = request_id
        else:
            try:
                payload_user_id = user_id if user_id and user_id > 0 else None
                context = await services["context_builder"].build(
                    f"Bearer {access_token}" if access_token and not access_token.lower().startswith("bearer ") else access_token,
                    payload_user_id=payload_user_id,
                    locale=metadata.get("locale", "fr-FR"),
                    language=language,
                )
                context.metadata["request_id"] = request_id
            except ContextError as exc:
                log_error("copilot.context_error", exc, {"code": exc.code, "status_code": exc.status_code})
                raise

        log_event(
            "copilot.request",
            metadata={
                "channel": channel,
                "user_role": context.role,
                "tenant_id": context.tenant_id,
                "language": context.language or language,
                "message_length": len(message or ""),
                "provider_mode": getattr(services["provider_router"], "mode", "disabled"),
            },
        )
        session_id = str(metadata.get("session_id") or "") or None
        if _is_why_message(message):
            last_error = services["conversation_store"].get_last_error(context, session_id)
            if last_error:
                response = AgentResponse(
                    type="answer",
                    text=f"La derniere erreur vient de ceci : {last_error}",
                    intent="conversation.explain_last_error",
                    confidence=0.9,
                    actionResult={"kind": "error_explanation", "lastError": last_error},
                )
                response = localize_agent_response(response, context)
                return services["response_guard"].guard_response(response, context)

        response = await continue_pending_flow(
            message=message,
            context=context,
            store=services["conversation_store"],
            executor=services["executor"],
            confirmation_store=services["confirmation_store"],
            session_id=session_id,
        )
        if response is None:
            response = await services["router_agent"].handle(message, context)
            response = capture_pending_flow(
                message=message,
                response=response,
                context=context,
                store=services["conversation_store"],
                session_id=session_id,
            )
        response = localize_agent_response(response, context)
        response = services["response_guard"].guard_response(response, context)
        if response.type == "error":
            services["conversation_store"].record_last_error(context, response.text, session_id)
        response_text = str(getattr(response, "text", "") or "")
        log_event(
            "agent.result",
            metadata={
                "agent": context.metadata.get("selected_agent"),
                "response_type": getattr(response, "type", None),
                "requires_confirmation": bool(getattr(response, "requiresConfirmation", False)),
            },
        )
        log_event(
            "copilot.response",
            output=_safe_response_payload(response),
            metadata={
                "success": getattr(response, "type", None) != "error",
                "channel": channel,
                "language": context.language,
                "role": context.role,
                "tenant_id": context.tenant_id,
                "intent": getattr(response, "intent", None),
                "response_type": getattr(response, "type", None),
                "text_length": len(response_text),
                "provider_mode": getattr(services["provider_router"], "mode", "disabled"),
            },
        )
        return response


def _safe_response_payload(response: Any) -> Any:
    if hasattr(response, "model_dump"):
        return response.model_dump(mode="json")
    if isinstance(response, AgentResponse):
        return response.model_dump(mode="json")
    return getattr(response, "__dict__", str(response))


def _is_why_message(message: str | None) -> bool:
    text = (message or "").strip().lower()
    return text in {"pourquoi", "why", "علاش", "لماذا"}
