from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.context.anonymous_context import build_chatbot_context_from_metadata
from app.context.context_builder import ContextError
from app.context.current_user import CurrentUserContext
from app.context.jwt_parser import extract_bearer_token
from app.core.copilot_engine import ensure_copilot_services, process_copilot_message
from app.i18n.response_localizer import translate
from app.models.agent_models import AgentResponse, ChatV2Request, ConfirmActionRequest
from app.models.envelopes import ApiEnvelope
from app.nlp.language_detector import resolve_response_language, response_script
from app.observability.request_context import ensure_request_id, reset_request_id, set_request_id
from app.observability.tracing import log_error, log_event, start_span
from app.workflows.workflow_steps import apply_safe_request_metadata
from config import get_settings

router = APIRouter()


def _payload_language_metadata(payload: Any) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for attr, key in (
        ("language", "language"),
        ("detectedLanguage", "detectedLanguage"),
        ("detected_language", "detected_language"),
        ("stt_language", "stt_language"),
        ("requested_language", "requested_language"),
        ("response_language", "response_language"),
    ):
        value = getattr(payload, attr, None)
        if isinstance(value, str) and value.strip():
            metadata[key] = value.strip()
    mode = getattr(payload, "mode", None)
    if isinstance(mode, str) and mode.strip():
        metadata["mode"] = mode.strip()
    return metadata


def _set_language_metadata(metadata: dict[str, Any], language: str) -> dict[str, Any]:
    metadata["language"] = language
    metadata["requested_language"] = language
    metadata["requestedLanguage"] = language
    metadata["response_language"] = language
    metadata["responseLanguage"] = language
    metadata.setdefault("detectedLanguage", language)
    metadata.setdefault("detected_language", language)
    metadata.setdefault("locale", _locale_for_language(language))
    if "original_text" in metadata:
        metadata.setdefault("response_script", response_script(str(metadata.get("original_text") or "")))
    return metadata


def _locale_for_language(language: str | None) -> str:
    if language == "en":
        return "en-US"
    if language in {"ar", "tn"}:
        return "ar-TN"
    return "fr-FR"


def _public_chatbot_mode_enabled() -> bool:
    return bool(getattr(get_settings(), "chatbot_public_mode", False))


def _metadata_requests_public_context(metadata: Any) -> bool:
    """Allow public/demo chatbot context only when the request opts in.

    CHATBOT_PUBLIC_MODE remains a global dev switch, but the chatbot widget can
    also send an explicit metadata marker. This keeps the fallback scoped to
    chatbot endpoints without weakening the verified JWT path.
    """
    if _public_chatbot_mode_enabled():
        return True
    if not isinstance(metadata, dict):
        return False
    return metadata.get("chatbotPublicContext") is True or metadata.get("chatbot_public_context") is True


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


def _workflow_metadata(
    payload_metadata: dict[str, Any] | None,
    *,
    app_state: Any | None,
    session_id: str | None,
    request_id: str,
    channel: str,
) -> dict[str, Any]:
    metadata = dict(payload_metadata or {})
    resolved_session = str(session_id or metadata.get("session_id") or metadata.get("sessionId") or "default").strip() or "default"
    metadata["session_id"] = resolved_session
    metadata.setdefault("sessionId", resolved_session)
    metadata.setdefault("conversation_id", metadata.get("conversationId") or metadata.get("conversation") or resolved_session)
    metadata.setdefault("conversationId", metadata.get("conversation_id"))
    metadata["channel"] = channel
    metadata["request_id"] = request_id
    metadata["requestId"] = request_id
    if app_state is not None:
        metadata["app_state"] = app_state
    return metadata


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
    payload_metadata = _workflow_metadata(
        payload.metadata if isinstance(payload.metadata, dict) else {},
        app_state=request.app.state,
        session_id=payload.session_id,
        request_id=request_id,
        channel=payload.channel or "chat",
    )
    payload_metadata.update(_payload_language_metadata(payload))
    payload_metadata["original_text"] = payload.message
    payload_language = resolve_response_language(payload.message, payload_metadata)
    _set_language_metadata(payload_metadata, payload_language)
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
                public_context_requested = _metadata_requests_public_context(payload_metadata)
                if not bearer_token and public_context_requested:
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
                    metadata=payload_metadata,
                    context=anonymous_context,
                )
                payload_data = _response_payload(agent_response)
                if isinstance(payload_data, dict):
                    payload_data["request_id"] = request_id
                    payload_data["requestId"] = request_id
                    payload_data["detectedLanguage"] = payload_language
                    payload_data["detected_language"] = payload_language
                    payload_data["responseLocale"] = payload_language
                    payload_data["response_locale"] = payload_language
                    payload_data["response_language"] = payload_language
                    payload_data["requested_language"] = payload_language
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
                if _metadata_requests_public_context(payload_metadata) and exc.status_code == 401:
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
                            metadata=payload_metadata,
                            context=fallback_context,
                        )
                        payload_data = _response_payload(agent_response)
                        if isinstance(payload_data, dict):
                            payload_data["request_id"] = request_id
                            payload_data["requestId"] = request_id
                            payload_data["detectedLanguage"] = payload_language
                            payload_data["detected_language"] = payload_language
                            payload_data["responseLocale"] = payload_language
                            payload_data["response_locale"] = payload_language
                            payload_data["response_language"] = payload_language
                            payload_data["requested_language"] = payload_language
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
    confirm_metadata = _workflow_metadata(
        payload.metadata if isinstance(getattr(payload, "metadata", None), dict) else {},
        app_state=request.app.state,
        session_id=(payload.metadata or {}).get("session_id") if isinstance(payload.metadata, dict) else None,
        request_id=request_id,
        channel="chat",
    )
    confirm_metadata.update(_payload_language_metadata(payload))
    payload_language = resolve_response_language(None, confirm_metadata)
    _set_language_metadata(confirm_metadata, payload_language)
    try:
        with start_span("ai.confirmation.request", {"approved": payload.approved}):
            anonymous_context: CurrentUserContext | None = None
            public_context_requested = _metadata_requests_public_context(confirm_metadata)
            if not bearer_token and public_context_requested:
                anonymous_context = _anonymous_chatbot_context(
                    confirm_metadata,
                    user_id=getattr(payload, "user_id", None),
                    role_hint=None,
                    language=payload_language,
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
                    metadata={**confirm_metadata, "locale": _locale_for_language(payload_language)},
                )
            except ContextError as exc:
                if public_context_requested and exc.status_code == 401 and anonymous_context is None:
                    fallback_context = _anonymous_chatbot_context(
                        confirm_metadata,
                        user_id=getattr(payload, "user_id", None),
                        role_hint=None,
                        language=payload_language,
                        channel="chat",
                    )
                    try:
                        result = await services["workflow_orchestrator"].confirm_action(
                            approved=payload.approved,
                            confirmation_id=payload.confirmation_id,
                            access_token=None,
                            context=fallback_context,
                            channel="chat",
                            metadata={**confirm_metadata, "locale": _locale_for_language(payload_language)},
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
                    language=payload_language,
                )
            if result.state.error_code == "confirmation_expired":
                return _controlled_confirmation_response(
                    code="CONFIRMATION_EXPIRED",
                    intent_code="confirmation_expired",
                    text="Cette confirmation a expire.",
                    request_id=request_id,
                    confirmation_id=payload.confirmation_id,
                    status="expired",
                    language=payload_language,
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
                    language=payload_language,
                )

            response = result.response
            response_payload = response.model_dump(mode="json")
            response_payload["request_id"] = request_id
            response_payload["requestId"] = request_id
            response_payload["detectedLanguage"] = payload_language
            response_payload["detected_language"] = payload_language
            response_payload["responseLocale"] = payload_language
            response_payload["response_locale"] = payload_language
            response_payload["response_language"] = payload_language
            response_payload["requested_language"] = payload_language
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
    payload_metadata = _workflow_metadata(
        payload.metadata if isinstance(payload.metadata, dict) else {},
        app_state=request.app.state,
        session_id=payload.session_id,
        request_id=request_id,
        channel=payload.channel or "chat",
    )
    payload_metadata.update(_payload_language_metadata(payload))
    payload_role = None
    payload_language = resolve_response_language(payload.message, payload_metadata)
    _set_language_metadata(payload_metadata, payload_language)
    if isinstance(payload_metadata, dict):
        for key in ("role", "chatbotMode", "chatbot_mode"):
            value = payload_metadata.get(key)
            if isinstance(value, str) and value.strip():
                payload_role = value.strip()
                break
    try:
        anonymous_context: CurrentUserContext | None = None
        public_context_requested = _metadata_requests_public_context(payload_metadata)
        if not bearer_token and public_context_requested:
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
            context = await services["context_builder"].build(
                authorization,
                payload_user_id=payload.user_id,
                language=payload_language,
            )
        else:
            context = anonymous_context

        context.metadata["channel"] = payload.channel or "chat"
        context.metadata["session_id"] = payload.session_id or "default"
        apply_safe_request_metadata(context, payload_metadata, language=payload_language)
        conversation_store = services["conversation_store"]
        confirmation_store = services["confirmation_store"]
        cleared = conversation_store.reset_session(context, payload.session_id)
        session_store = services.get("session_store")
        if session_store is not None:
            await session_store.clear(
                user_id=int(context.user_id),
                tenant_id=context.tenant_id,
                channel=payload.channel or "chat",
                session_id=payload.session_id or "default",
                role=context.role,
                current_page=context.metadata.get("current_page"),
                conversation_id=context.metadata.get("conversation_id"),
            )
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
    language: str | None = None,
) -> JSONResponse:
    text = _localized_confirmation_text(text, language)
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


def _localized_confirmation_text(text: str, language: str | None) -> str:
    normalized = " ".join((text or "").strip().lower().split())
    key_by_text = {
        "confirmation introuvable ou expiree.": "confirmation_not_found",
        "cette confirmation a expire.": "confirmation_expired",
        "cette action a deja ete traitee.": "confirmation_already_used",
    }
    key = key_by_text.get(normalized)
    return translate(key, language) if key else text


def _response_payload(response: Any) -> Any:
    if hasattr(response, "model_dump"):
        return response.model_dump(mode="json")
    return getattr(response, "__dict__", response)
