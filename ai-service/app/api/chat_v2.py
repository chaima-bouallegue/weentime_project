from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.context.anonymous_context import build_chatbot_context_from_metadata
from app.context.context_builder import ContextError
from app.context.current_user import CurrentUserContext
from app.context.jwt_parser import extract_bearer_token
from app.core.copilot_engine import ensure_copilot_services, process_copilot_message
from app.models.agent_models import AgentResponse, ChatV2Request, ConfirmActionRequest
from app.models.envelopes import ApiEnvelope
from app.observability.request_context import ensure_request_id, reset_request_id, set_request_id
from app.observability.tracing import log_error, log_event, start_span
from config import get_settings

router = APIRouter()


def _public_chatbot_mode_enabled() -> bool:
    return bool(getattr(get_settings(), "chatbot_public_mode", False))


def _anonymous_chatbot_context(
    payload_metadata: Any,
    *,
    user_id: int | None,
    role_hint: str | None,
    language: str | None,
    channel: str = "chat",
) -> CurrentUserContext:
    metadata: dict[str, Any] = {}
    if isinstance(payload_metadata, dict):
        metadata.update(payload_metadata)
    if user_id and "userId" not in metadata and "user_id" not in metadata:
        metadata["userId"] = user_id
    if role_hint and "role" not in metadata:
        metadata["role"] = role_hint
    if language and "language" not in metadata:
        metadata["language"] = language
    return build_chatbot_context_from_metadata(metadata, language=language, channel=channel)


@router.post("/v2/chat")
async def chat_v2(
    payload: ChatV2Request,
    request: Request,
    authorization: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
) -> JSONResponse:
    request_id = ensure_request_id(x_request_id)
    request_token = set_request_id(request_id)
    bearer_token = extract_bearer_token(authorization)
    payload_metadata = payload.metadata if isinstance(payload.metadata, dict) else {}
    payload_language = None
    if isinstance(payload_metadata, dict):
        candidate = payload_metadata.get("language")
        if isinstance(candidate, str) and candidate.strip():
            payload_language = candidate.strip()
    payload_role = None
    if isinstance(payload_metadata, dict):
        for key in ("role", "chatbotMode", "chatbot_mode"):
            value = payload_metadata.get(key)
            if isinstance(value, str) and value.strip():
                payload_role = value.strip()
                break
    try:
        with start_span("ai.chat_v2.request", {"channel": payload.channel, "session_id": payload.session_id}):
            try:
                anonymous_context: CurrentUserContext | None = None
                if not bearer_token and _public_chatbot_mode_enabled():
                    anonymous_context = _anonymous_chatbot_context(
                        payload_metadata,
                        user_id=payload.user_id or 0,
                        role_hint=payload_role,
                        language=payload_language,
                        channel=payload.channel or "chat",
                    )
                    log_event(
                        "ai.chat_v2.public_demo",
                        metadata={
                            "request_id": request_id,
                            "role": anonymous_context.role,
                            "user_id": anonymous_context.user_id,
                        },
                    )

                agent_response = await process_copilot_message(
                    payload.user_id or (anonymous_context.user_id if anonymous_context else 0),
                    payload.message,
                    bearer_token,
                    anonymous_context.role if anonymous_context else None,
                    channel=payload.channel,
                    metadata={"app_state": request.app.state, "session_id": payload.session_id, "request_id": request_id},
                    context=anonymous_context,
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
                if _public_chatbot_mode_enabled() and exc.status_code == 401:
                    fallback_context = _anonymous_chatbot_context(
                        payload_metadata,
                        user_id=payload.user_id or 0,
                        role_hint=payload_role,
                        language=payload_language,
                        channel=payload.channel or "chat",
                    )
                    try:
                        agent_response = await process_copilot_message(
                            fallback_context.user_id,
                            payload.message,
                            None,
                            fallback_context.role,
                            channel=payload.channel,
                            metadata={"app_state": request.app.state, "session_id": payload.session_id, "request_id": request_id},
                            context=fallback_context,
                        )
                        payload_data = _response_payload(agent_response)
                        if isinstance(payload_data, dict):
                            payload_data["request_id"] = request_id
                            payload_data["requestId"] = request_id
                        return JSONResponse(status_code=200, content=ApiEnvelope.ok(payload_data).model_dump(mode="json"))
                    except Exception as inner:
                        log_error("ai.chat_v2.public_fallback_failed", inner)
                        return _error_response(500, "ai_v2_unavailable", "Le nouveau copilote AI est temporairement indisponible.", request_id=request_id)
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
    bearer_token = extract_bearer_token(authorization)
    confirm_metadata = payload.metadata if isinstance(getattr(payload, "metadata", None), dict) else {}
    try:
        with start_span("ai.confirmation.request", {"approved": payload.approved}):
            anonymous_context: CurrentUserContext | None = None
            if not bearer_token and _public_chatbot_mode_enabled():
                anonymous_context = _anonymous_chatbot_context(
                    confirm_metadata,
                    user_id=getattr(payload, "user_id", None),
                    role_hint=None,
                    language=None,
                    channel="chat",
                )
                log_event(
                    "ai.confirmation.public_demo",
                    metadata={
                        "request_id": request_id,
                        "role": anonymous_context.role,
                        "user_id": anonymous_context.user_id,
                    },
                )
            try:
                result = await services["workflow_orchestrator"].confirm_action(
                    approved=payload.approved,
                    confirmation_id=payload.confirmation_id,
                    access_token=bearer_token,
                    context=anonymous_context,
                    channel="chat",
                    metadata={"request_id": request_id, "locale": "fr-FR"},
                )
            except ContextError as exc:
                if _public_chatbot_mode_enabled() and exc.status_code == 401 and anonymous_context is None:
                    fallback_context = _anonymous_chatbot_context(
                        confirm_metadata,
                        user_id=getattr(payload, "user_id", None),
                        role_hint=None,
                        language=None,
                        channel="chat",
                    )
                    try:
                        result = await services["workflow_orchestrator"].confirm_action(
                            approved=payload.approved,
                            confirmation_id=payload.confirmation_id,
                            access_token=None,
                            context=fallback_context,
                            channel="chat",
                            metadata={"request_id": request_id, "locale": "fr-FR"},
                        )
                    except ContextError as inner_exc:
                        log_error("ai.confirmation.context_error", inner_exc, {"code": inner_exc.code, "status_code": inner_exc.status_code})
                        return _error_response(inner_exc.status_code, inner_exc.code, inner_exc.message, request_id=request_id)
                else:
                    log_error("ai.confirmation.context_error", exc, {"code": exc.code, "status_code": exc.status_code})
                    return _error_response(exc.status_code, exc.code, exc.message, request_id=request_id)

            if result.state.error_code == "confirmation_not_found":
                return _controlled_confirmation_response(
                    code="CONFIRMATION_NOT_FOUND",
                    intent_code="confirmation_not_found",
                    text="Confirmation introuvable ou expiree.",
                    request_id=request_id,
                    confirmation_id=payload.confirmation_id,
                    status="not_found",
                )
            if result.state.error_code == "confirmation_expired":
                return _controlled_confirmation_response(
                    code="CONFIRMATION_EXPIRED",
                    intent_code="confirmation_expired",
                    text="Cette confirmation a expire.",
                    request_id=request_id,
                    confirmation_id=payload.confirmation_id,
                    status="expired",
                )
            if result.state.error_code == "confirmation_already_used":
                return _controlled_confirmation_response(
                    code="CONFIRMATION_ALREADY_USED",
                    intent_code="confirmation_already_used",
                    text="Cette action a deja ete traitee.",
                    request_id=request_id,
                    confirmation_id=payload.confirmation_id,
                    status="already_used",
                    success=True,
                )

            response = result.response
            response_payload = response.model_dump(mode="json")
            response_payload["request_id"] = request_id
            response_payload["requestId"] = request_id
            log_event(
                "response.compose",
                output=response_payload,
                metadata={"approved": payload.approved, "intent": response.intent, "success": response.type != "error"},
            )
            return JSONResponse(
                status_code=result.http_status,
                content=ApiEnvelope.ok(response_payload, warnings=result.warnings).model_dump(mode="json"),
            )
    finally:
        reset_request_id(request_token)


class ResetChatRequest(ChatV2Request):
    """Same shape as a normal chat request — message is ignored."""

    message: str = ""


@router.post("/v2/chat/reset")
async def reset_chat_session(
    payload: ResetChatRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
) -> JSONResponse:
    """Drop the pending slot-fill flow + the per-user confirmation queue for
    this chat session. The Angular chat widget calls this when the user
    clicks "Effacer la conversation" so a stuck pending flow doesn't keep
    eating the user's next prompt across page reloads.
    """
    request_id = ensure_request_id(x_request_id)
    request_token = set_request_id(request_id)
    services = ensure_copilot_services(request.app.state)
    bearer_token = extract_bearer_token(authorization)
    payload_metadata = payload.metadata if isinstance(payload.metadata, dict) else {}
    payload_role = None
    payload_language = None
    if isinstance(payload_metadata, dict):
        for key in ("role", "chatbotMode", "chatbot_mode"):
            value = payload_metadata.get(key)
            if isinstance(value, str) and value.strip():
                payload_role = value.strip()
                break
        candidate = payload_metadata.get("language")
        if isinstance(candidate, str) and candidate.strip():
            payload_language = candidate.strip()
    try:
        anonymous_context: CurrentUserContext | None = None
        if not bearer_token and _public_chatbot_mode_enabled():
            anonymous_context = _anonymous_chatbot_context(
                payload_metadata,
                user_id=payload.user_id or 0,
                role_hint=payload_role,
                language=payload_language,
                channel=payload.channel or "chat",
            )
        # If we have neither a real token nor a public-mode metadata context
        # we cannot identify whose session to clear — refuse loudly so the
        # client sees a real 401 instead of a silent no-op.
        if anonymous_context is None and bearer_token is None:
            return _error_response(401, "missing_jwt", "Authorization header is required.", request_id=request_id)

        # When we DO have a bearer, build the verified context the standard
        # way; mistakes here should surface, not be swallowed.
        if anonymous_context is None:
            context = services["copilot_context_builder"].build(
                authorization,
                payload_user_id=payload.user_id,
                language=payload_language,
            )
        else:
            context = anonymous_context

        conversation_store = services["conversation_store"]
        confirmation_store = services["confirmation_store"]
        cleared = conversation_store.reset_session(context, payload.session_id)
        confirmation_store.clear_for_user(int(context.user_id))
        log_event(
            "ai.chat_v2.reset",
            metadata={
                "request_id": request_id,
                "user_id": context.user_id,
                "session_id": payload.session_id,
                "cleared_flow": cleared.get("flow", False),
                "cleared_last_error": cleared.get("lastError", False),
                "source": "anonymous_chatbot" if anonymous_context else "verified_jwt",
            },
        )
        return JSONResponse(
            status_code=200,
            content=ApiEnvelope.ok(
                {
                    "cleared": cleared,
                    "request_id": request_id,
                    "requestId": request_id,
                }
            ).model_dump(mode="json"),
        )
    except ContextError as exc:
        log_error("ai.chat_v2.reset.context_error", exc, {"code": exc.code, "status_code": exc.status_code})
        return _error_response(exc.status_code, exc.code, exc.message, request_id=request_id)
    except Exception as exc:  # noqa: BLE001
        log_error("ai.chat_v2.reset.unhandled", exc)
        return _error_response(500, "ai_v2_reset_failed", "La reinitialisation de la conversation a echoue.", request_id=request_id)
    finally:
        reset_request_id(request_token)


def _error_response(status_code: int, code: str, message: str, *, request_id: str | None = None) -> JSONResponse:
    details = {"request_id": request_id, "requestId": request_id} if request_id else None
    return JSONResponse(
        status_code=status_code,
        content=ApiEnvelope.fail(code, message, status_details=details).model_dump(mode="json"),
    )


def _controlled_confirmation_response(
    *,
    code: str,
    intent_code: str | None = None,
    text: str,
    request_id: str | None,
    confirmation_id: str | None,
    status: str,
    success: bool = False,
) -> JSONResponse:
    response = AgentResponse(
        type="answer" if success else "error",
        text=text,
        intent=f"confirmation.{intent_code or code.lower()}",
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
