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
from app.observability.request_context import ensure_request_id, reset_request_id, set_request_id
from app.observability.tracing import log_error, log_event, start_span

router = APIRouter()


@router.post("/v2/chat")
async def chat_v2(
    payload: ChatV2Request,
    request: Request,
    authorization: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
) -> JSONResponse:
    request_id = ensure_request_id(x_request_id)
    request_token = set_request_id(request_id)
    try:
        with start_span("ai.chat_v2.request", {"channel": payload.channel, "session_id": payload.session_id}):
            try:
                agent_response = await process_copilot_message(
                    payload.user_id or 0,
                    payload.message,
                    extract_bearer_token(authorization),
                    None,
                    channel=payload.channel,
                    metadata={"app_state": request.app.state, "session_id": payload.session_id, "request_id": request_id},
                )
                payload_data = _response_payload(agent_response)
                if isinstance(payload_data, dict):
                    payload_data["request_id"] = request_id
                    payload_data["requestId"] = request_id
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
                return _error_response(exc.status_code, exc.code, exc.message, request_id=request_id)
            except Exception as exc:
                log_error("ai.chat_v2.unhandled", exc)
                return _error_response(500, "ai_v2_unavailable", "Le nouveau copilote AI est temporairement indisponible.", request_id=request_id)
    finally:
        reset_request_id(request_token)


@router.post("/v2/chat/confirm")
async def confirm_chat_action(
    payload: ConfirmActionRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
) -> JSONResponse:
    request_id = ensure_request_id(x_request_id)
    request_token = set_request_id(request_id)
    services = ensure_copilot_services(request.app.state)
    try:
        with start_span("ai.confirmation.request", {"approved": payload.approved}):
            try:
                with start_span("context.build"):
                    context = await services["context_builder"].build(authorization, locale="fr-FR")
            except ContextError as exc:
                log_error("ai.confirmation.context_error", exc, {"code": exc.code, "status_code": exc.status_code})
                return _error_response(exc.status_code, exc.code, exc.message, request_id=request_id)

            store: ConfirmationStore = services["confirmation_store"]
            with start_span("confirmation.lookup", {"user_id": context.user_id, "tenant_id": context.tenant_id}):
                record = store.get(payload.confirmation_id)
            if not record:
                return _controlled_confirmation_response(
                    code="confirmation_not_found",
                    text="Confirmation introuvable ou expiree.",
                    request_id=request_id,
                    confirmation_id=payload.confirmation_id,
                    status="not_found",
                )
            if record.user_id != context.user_id or record.tenant_id != context.tenant_id:
                return _error_response(403, "confirmation_context_mismatch", "Cette confirmation ne correspond pas a votre session.", request_id=request_id)
            if record.status == "expired" or record.expired:
                return _controlled_confirmation_response(
                    code="confirmation_expired",
                    text="Cette confirmation a expire.",
                    request_id=request_id,
                    confirmation_id=payload.confirmation_id,
                    status="expired",
                )
            if record.status != "pending":
                return _controlled_confirmation_response(
                    code="confirmation_already_used",
                    text="Cette action a deja ete traitee.",
                    request_id=request_id,
                    confirmation_id=payload.confirmation_id,
                    status="already_used",
                    success=True,
                )

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
                response_payload = response.model_dump(mode="json")
                response_payload["request_id"] = request_id
                response_payload["requestId"] = request_id
                log_event("response.compose", output=response_payload, metadata={"approved": False})
                return JSONResponse(status_code=200, content=ApiEnvelope.ok(response_payload).model_dump(mode="json"))

            store.consume(payload.confirmation_id)
            result = await services["executor"].execute(
                record.tool_name,
                record.tool_input,
                context,
                confirmed=True,
                request_id=request_id,
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
            response_payload = response.model_dump(mode="json")
            response_payload["request_id"] = request_id
            response_payload["requestId"] = request_id
            log_event(
                "response.compose",
                output=response_payload,
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
                status_code=200,
                content=ApiEnvelope.ok(response_payload, warnings=result.warnings).model_dump(mode="json"),
            )
    finally:
        reset_request_id(request_token)


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


def _error_response(status_code: int, code: str, message: str, *, request_id: str | None = None) -> JSONResponse:
    details = {"request_id": request_id, "requestId": request_id} if request_id else None
    return JSONResponse(
        status_code=status_code,
        content=ApiEnvelope.fail(code, message, status_details=details).model_dump(mode="json"),
    )


def _controlled_confirmation_response(
    *,
    code: str,
    text: str,
    request_id: str | None,
    confirmation_id: str | None,
    status: str,
    success: bool = False,
) -> JSONResponse:
    response = AgentResponse(
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
    payload = response.model_dump(mode="json")
    payload["response"] = text
    payload["status"] = status
    payload["request_id"] = request_id
    payload["requestId"] = request_id
    envelope = ApiEnvelope.ok(payload) if success else ApiEnvelope.fail(code, text, status_details=payload)
    if not success:
        # Keep a stable data payload as well, so clients never have to render raw HTTP errors.
        raw = envelope.model_dump(mode="json")
        raw["data"] = payload
        return JSONResponse(status_code=200, content=raw)
    return JSONResponse(status_code=200, content=envelope.model_dump(mode="json"))


def _response_payload(response: Any) -> Any:
    if hasattr(response, "model_dump"):
        return response.model_dump(mode="json")
    return getattr(response, "__dict__", response)
