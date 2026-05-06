from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.context.context_builder import ContextError
from app.context.jwt_parser import extract_bearer_token
from app.core.copilot_engine import ensure_copilot_services, process_copilot_message
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ChatV2Request, ConfirmActionRequest, ToolCallRecord
from app.models.envelopes import ApiEnvelope
from app.observability.tracing import log_error, log_event, start_span

router = APIRouter()


@router.post("/v2/chat")
async def chat_v2(
    payload: ChatV2Request,
    request: Request,
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    with start_span("ai.chat_v2.request", {"channel": payload.channel, "session_id": payload.session_id}):
        try:
            agent_response = await process_copilot_message(
                payload.user_id or 0,
                payload.message,
                extract_bearer_token(authorization),
                None,
                channel=payload.channel,
                metadata={"app_state": request.app.state, "session_id": payload.session_id},
            )
            payload_data = _response_payload(agent_response)
            log_event(
                "response.compose",
                input={"message": payload.message, "channel": payload.channel},
                output=payload_data,
                metadata={
                    "intent": getattr(agent_response, "intent", None),
                    "confidence": getattr(agent_response, "confidence", None),
                    "type": getattr(agent_response, "type", None),
                },
            )
            return JSONResponse(status_code=200, content=ApiEnvelope.ok(payload_data).model_dump(mode="json"))
        except ContextError as exc:
            log_error("ai.chat_v2.context_error", exc, {"code": exc.code, "status_code": exc.status_code})
            return _error_response(exc.status_code, exc.code, exc.message)
        except Exception as exc:
            log_error("ai.chat_v2.unhandled", exc)
            return _error_response(500, "ai_v2_unavailable", "Le nouveau copilote AI est temporairement indisponible.")


@router.post("/v2/chat/confirm")
async def confirm_chat_action(
    payload: ConfirmActionRequest,
    request: Request,
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    services = ensure_copilot_services(request.app.state)
    with start_span("ai.confirmation.request", {"approved": payload.approved}):
        try:
            with start_span("context.build"):
                context = await services["context_builder"].build(authorization, locale="fr-FR")
        except ContextError as exc:
            log_error("ai.confirmation.context_error", exc, {"code": exc.code, "status_code": exc.status_code})
            return _error_response(exc.status_code, exc.code, exc.message)

        store: ConfirmationStore = services["confirmation_store"]
        with start_span("confirmation.lookup", {"user_id": context.user_id, "tenant_id": context.tenant_id}):
            record = store.get(payload.confirmation_id)
        if not record:
            return _error_response(404, "confirmation_not_found", "Confirmation introuvable ou expiree.")
        if record.user_id != context.user_id or record.tenant_id != context.tenant_id:
            return _error_response(403, "confirmation_context_mismatch", "Cette confirmation ne correspond pas a votre session.")
        if record.status == "expired" or record.expired:
            return _error_response(410, "confirmation_expired", "Cette confirmation a expire.")
        if record.status != "pending":
            return _error_response(409, "confirmation_already_used", "Cette confirmation a deja ete traitee.")

        if not payload.approved:
            store.reject(payload.confirmation_id)
            response = AgentResponse(
                type="answer",
                text="Action annulee.",
                intent="confirmation.rejected",
                confidence=1.0,
                requiresConfirmation=False,
                confirmationId=payload.confirmation_id,
            )
            log_event("response.compose", output=response.model_dump(mode="json"), metadata={"approved": False})
            return JSONResponse(status_code=200, content=ApiEnvelope.ok(response.model_dump(mode="json")).model_dump(mode="json"))

        store.consume(payload.confirmation_id)
        result = await services["executor"].execute(
            record.tool_name,
            record.tool_input,
            context,
            confirmed=True,
        )
        known_conflict = _known_business_conflict(result)
        response = AgentResponse(
            type="execute_action" if result.success else ("answer" if known_conflict else "error"),
            text=(
                _action_success_text(record.tool_name)
                if result.success
                else (_business_conflict_message(result) if known_conflict else (result.error_message or "Action refusee par le backend."))
            ),
            intent=f"attendance.{record.tool_name}",
            confidence=1.0,
            requiresConfirmation=False,
            confirmationId=payload.confirmation_id,
            toolCalls=[ToolCallRecord(name=record.tool_name, arguments=record.tool_input, status="success" if result.success else ("business_conflict" if known_conflict else "failed"))],
            actionResult=result.model_dump(mode="json"),
        )
        log_event(
            "response.compose",
            output=response.model_dump(mode="json"),
            metadata={"approved": True, "tool_name": record.tool_name, "success": result.success},
        )
        log_event(
            "confirmation.executed",
            metadata={
                "confirmation_id": payload.confirmation_id,
                "tool_name": record.tool_name,
                "status": "success" if result.success else ("business_conflict" if known_conflict else "failed"),
                "business_conflict": known_conflict,
                "http_status": result.status_code,
            },
        )
        return JSONResponse(
            status_code=200 if result.success or known_conflict else (result.status_code or 500),
            content=ApiEnvelope.ok(response.model_dump(mode="json"), warnings=result.warnings).model_dump(mode="json")
            if result.success or known_conflict
            else ApiEnvelope.fail(result.error_code or "tool_failed", response.text, status_details=response.model_dump(mode="json")).model_dump(mode="json"),
        )


def _action_success_text(tool_name: str) -> str:
    if tool_name == "check_in":
        return "Pointage d'entree confirme."
    if tool_name == "check_out":
        return "Pointage de sortie confirme."
    return "Action confirmee."


def _known_business_conflict(result: Any) -> bool:
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


def _business_conflict_message(result: Any) -> str:
    code = str(getattr(result, "error_code", "") or "").lower()
    message = str(getattr(result, "error_message", "") or "").strip()
    lowered = message.lower()
    if code == "already_processed" or "traitee" in lowered or "traitée" in lowered or "processed" in lowered:
        return "Cette demande a déjà été traitée."
    if code == "already_exists" or "existe" in lowered or "exists" in lowered or "deja" in lowered or "déjà" in lowered:
        return "Une demande existe déjà sur cette période."
    return message or "Une demande existe déjà sur cette période."


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ApiEnvelope.fail(code, message).model_dump(mode="json"),
    )


def _response_payload(response: Any) -> Any:
    if hasattr(response, "model_dump"):
        return response.model_dump(mode="json")
    return getattr(response, "__dict__", response)
