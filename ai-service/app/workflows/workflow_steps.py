from __future__ import annotations

from typing import Any

from app.context.context_builder import ContextBuilder, ContextError
from app.context.current_user import CurrentUserContext
from app.context.jwt_parser import JwtClaims
from app.guards.guard_result import GuardResult
from app.memory.confirmation_store import ConfirmationRecord
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.nlp.language_detector import detect_language
from app.tools.result import ToolResult, get_read_result

from .workflow_state import WorkflowState

SUPPORTED_WORKFLOW_LANGUAGES = {"fr", "en", "ar", "tn"}


def resolve_workflow_language(message: str, metadata: dict[str, Any] | None = None) -> str:
    provided = str((metadata or {}).get("language") or "").lower().strip()
    if provided in SUPPORTED_WORKFLOW_LANGUAGES:
        return provided
    return detect_language(message)


SAFE_CONTEXT_METADATA_ALIASES: dict[str, tuple[str, ...]] = {
    "current_page": ("current_page", "currentPage", "page", "route"),
    "conversation_id": ("conversation_id", "conversationId", "conversation"),
    "company_id": ("company_id", "companyId"),
    "entreprise_id": ("entreprise_id", "entrepriseId", "tenant_id", "tenantId"),
    "session_id": ("session_id", "sessionId"),
    "channel": ("channel",),
    "language": ("language",),
}


def apply_safe_request_metadata(
    context: CurrentUserContext,
    metadata: dict[str, Any] | None,
    *,
    language: str | None = None,
) -> CurrentUserContext:
    """Copy only UI continuity hints into the verified chatbot context.

    This preserves the security boundary: Authorization, JWTs, permissions and
    arbitrary frontend claims are never copied. The values here are routing and
    session hints only; ToolRegistry/backend authority still decides actions.
    """
    resolved_metadata = metadata or {}
    for canonical, aliases in SAFE_CONTEXT_METADATA_ALIASES.items():
        value = _first_metadata_value(resolved_metadata, aliases)
        if value is not None:
            context.metadata[canonical] = value
    if language:
        context.metadata["language"] = language
    current_page = _normalized_text(context.metadata.get("current_page"))
    if current_page:
        context.metadata["current_page"] = current_page
    conversation_id = _normalized_text(context.metadata.get("conversation_id") or context.metadata.get("session_id"))
    if conversation_id:
        context.metadata["conversation_id"] = conversation_id
    company_id = _normalized_text(context.metadata.get("company_id"))
    if company_id:
        context.metadata["company_id"] = company_id
    return context


async def build_workflow_context(
    *,
    context_builder: ContextBuilder,
    access_token: str | None,
    user_id: int,
    role: str | None,
    language: str,
    metadata: dict[str, Any] | None = None,
    context: CurrentUserContext | None = None,
) -> CurrentUserContext:
    resolved_metadata = dict(metadata or {})
    locale = str(resolved_metadata.get("locale") or "fr-FR")
    payload_user_id = user_id if user_id and user_id > 0 else None

    if context is not None:
        if payload_user_id is not None and int(payload_user_id) != int(context.user_id):
            raise ContextError("user_context_mismatch", "Payload user_id does not match authenticated user.", 403)
        if not context.is_verified:
            raise ContextError("unverified_context", "Verified user context is required.", 403)
        context.locale = locale
        context.language = language or context.language
        return apply_safe_request_metadata(context, resolved_metadata, language=language)

    if not access_token and resolved_metadata.get("allow_legacy_without_token"):
        legacy_context = context_builder._from_claims(
            JwtClaims(
                verified=False,
                user_id=user_id,
                email=None,
                role=role or "EMPLOYEE",
                roles={role or "EMPLOYEE"},
                entreprise_id=resolved_metadata.get("entreprise_id") or resolved_metadata.get("tenant_id"),
                department_id=resolved_metadata.get("department_id"),
                team_id=resolved_metadata.get("team_id"),
                manager_id=resolved_metadata.get("manager_id"),
            ),
            token="",
            locale=locale,
            language=language,
        )
        legacy_context.metadata["legacy_context"] = True
        return apply_safe_request_metadata(legacy_context, resolved_metadata, language=language)

    verified_context = await context_builder.build(
        f"Bearer {access_token}" if access_token and not access_token.lower().startswith("bearer ") else access_token,
        payload_user_id=payload_user_id,
        locale=locale,
        language=language,
    )
    return apply_safe_request_metadata(verified_context, resolved_metadata, language=language)


def _first_metadata_value(metadata: dict[str, Any], aliases: tuple[str, ...]) -> str | int | None:
    for key in aliases:
        value = metadata.get(key)
        if value in (None, ""):
            continue
        if isinstance(value, (str, int)):
            text = str(value).strip()
            if text:
                return value
    return None


def _normalized_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def guard_result_payload(result: GuardResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    return {
        "allowed": bool(result.allowed),
        "primary_category": result.primary_category,
        "rejections": [
            {"category": rejection.category, "message": rejection.message, "details": dict(rejection.details)}
            for rejection in result.rejections
        ],
    }


def update_state_from_response(state: WorkflowState, response: AgentResponse, context: CurrentUserContext | None = None) -> WorkflowState:
    state.intent = response.intent or state.intent
    state.selected_agent = _selected_agent(response, context) or state.selected_agent
    state.read_evidence = extract_read_evidence(response)
    state.pending_confirmation = extract_pending_confirmation(response)
    state.tool_result = extract_tool_result(response)
    return state


def extract_read_evidence(response: AgentResponse) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    action_result = response.actionResult if isinstance(response.actionResult, dict) else {}

    read_result = _read_result_payload(action_result)
    if read_result:
        entry = {
            "tool_name": read_result.get("toolName"),
            "summary": read_result.get("summary"),
            "count": read_result.get("count"),
            "empty": read_result.get("empty"),
        }
        evidence.append({key: value for key, value in entry.items() if value is not None})

    risk_analysis = action_result.get("riskAnalysis")
    if isinstance(risk_analysis, dict) and isinstance(risk_analysis.get("evidence"), list):
        for item in risk_analysis["evidence"]:
            if isinstance(item, dict) and item:
                evidence.append(dict(item))

    if isinstance(action_result.get("evidence"), list):
        for item in action_result["evidence"]:
            if isinstance(item, dict) and item:
                evidence.append(dict(item))

    return evidence


def extract_pending_confirmation(response: AgentResponse) -> dict[str, Any] | None:
    tool_call = response.toolCalls[0] if response.toolCalls else None
    pending = bool(response.requiresConfirmation or response.confirmationId or (tool_call and tool_call.status == "pending_confirmation"))
    if not pending:
        return None
    return {
        "confirmation_id": response.confirmationId,
        "tool_name": tool_call.name if tool_call else None,
        "tool_arguments": dict(tool_call.arguments) if tool_call else {},
        "status": tool_call.status if tool_call else "pending_confirmation",
    }


def extract_tool_result(response: AgentResponse) -> dict[str, Any] | None:
    return dict(response.actionResult) if isinstance(response.actionResult, dict) else None


def build_confirmation_status_response(
    *,
    code: str,
    text: str,
    request_id: str | None,
    confirmation_id: str | None,
    status: str,
    success: bool = False,
) -> AgentResponse:
    return AgentResponse(
        type="answer" if success else "error",
        text=text,
        intent=f"confirmation.{code}",
        confidence=1.0,
        requiresConfirmation=False,
        confirmationId=confirmation_id,
        actionResult={
            "kind": "confirmation_result",
            "status": status,
            "error": None if success else {"code": code, "message": text},
            "requestId": request_id,
        },
    )


def build_confirmation_execution_response(record: ConfirmationRecord, result: ToolResult) -> AgentResponse:
    known_conflict = is_known_business_conflict(result)
    return AgentResponse(
        type="execute_action" if result.success else ("answer" if known_conflict else "error"),
        text=(
            action_success_text(record.tool_name)
            if result.success
            else (business_conflict_message(result) if known_conflict else backend_error_message(result))
        ),
        intent=f"confirmation.{record.tool_name}",
        confidence=1.0,
        requiresConfirmation=False,
        confirmationId=record.confirmation_id,
        toolCalls=[
            ToolCallRecord(
                name=record.tool_name,
                arguments=record.tool_input,
                status="success" if result.success else ("business_conflict" if known_conflict else "failed"),
            )
        ],
        actionResult=result.model_dump(mode="json"),
    )


def action_success_text(tool_name: str) -> str:
    if tool_name == "check_in":
        return "Pointage d'entree confirme."
    if tool_name == "check_out":
        return "Pointage de sortie confirme."
    return "Action confirmee."


def is_known_business_conflict(result: ToolResult) -> bool:
    code = str(getattr(result, "error_code", "") or "").lower()
    message = str(getattr(result, "error_message", "") or "").lower()
    data = getattr(result, "data", None)
    data_text = str(data).lower() if data is not None else ""
    if code in {"already_exists", "already_processed", "duplicate_request"}:
        return True
    if getattr(result, "status_code", None) != 409:
        return False
    known_markers = ("deja", "déjà", "already", "existe", "exists", "traitee", "traitée", "processed")
    return any(marker in message or marker in data_text for marker in known_markers)


def business_conflict_message(result: ToolResult) -> str:
    code = str(getattr(result, "error_code", "") or "").lower()
    message = str(getattr(result, "error_message", "") or "").strip()
    lowered = message.lower()
    if code == "already_processed" or "traitee" in lowered or "traitée" in lowered or "processed" in lowered:
        return "Cette demande a déjà été traitée."
    if code == "already_exists" or "existe" in lowered or "exists" in lowered or "deja" in lowered or "déjà" in lowered:
        return "Une demande existe déjà sur cette période."
    return message or "Une demande existe déjà sur cette période."


def backend_error_message(result: ToolResult) -> str:
    status_code = getattr(result, "status_code", None)
    message = str(getattr(result, "error_message", "") or "").strip()
    if status_code == 403:
        return "Vous n'avez pas les droits necessaires pour effectuer cette action."
    if status_code == 404:
        return "La ressource demandee est introuvable ou le service backend est indisponible."
    if status_code and int(status_code) >= 500:
        return "Le service backend est momentanement indisponible. Reessayez dans quelques instants."
    return message or "Action refusee par le backend."


def warnings_from_tool_result(tool_result: dict[str, Any] | None) -> list[str]:
    if not isinstance(tool_result, dict):
        return []
    warnings = tool_result.get("warnings")
    if not isinstance(warnings, list):
        return []
    return [str(item) for item in warnings if str(item).strip()]


def _read_result_payload(action_result: dict[str, Any]) -> dict[str, Any] | None:
    if not action_result:
        return None
    read_result = get_read_result(action_result)
    if read_result:
        return read_result
    nested = action_result.get("data")
    if isinstance(nested, dict):
        return get_read_result(nested)
    return None


def _selected_agent(response: AgentResponse, context: CurrentUserContext | None = None) -> str | None:
    if context is not None:
        selected = context.metadata.get("selected_agent")
        if isinstance(selected, str) and selected.strip():
            return selected.strip()
    action_result = response.actionResult if isinstance(response.actionResult, dict) else {}
    pending_flow = action_result.get("pendingFlow")
    if isinstance(pending_flow, dict):
        agent = pending_flow.get("agent")
        if isinstance(agent, str) and agent.strip():
            return agent.strip()
    intent = str(response.intent or "")
    if intent.startswith("confirmation."):
        return "confirmation"
    if intent.startswith("voice_role."):
        return "role_intelligence"
    if "." in intent:
        return intent.split(".", 1)[0]
    return None
