from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, File, Form, Header, Request, UploadFile
from fastapi.responses import JSONResponse

from app.context.anonymous_context import build_chatbot_context_from_metadata
from app.context.context_builder import ContextError
from app.context.current_user import CurrentUserContext
from app.context.jwt_parser import extract_bearer_token
from app.core.copilot_engine import ensure_copilot_services, process_copilot_message
from app.models.agent_models import AgentResponse
from app.models.envelopes import ApiEnvelope
from app.observability.request_context import ensure_request_id, reset_request_id, set_request_id
from app.observability.tracing import log_error, log_event, start_span
from app.workflows.workflow_steps import apply_safe_request_metadata
from app.voice import VoiceRoleRouter, optimize_voice_response
from app.voice_pipeline.voice_errors import voice_error_payload
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceRequestProcessor
from config import get_settings

router = APIRouter()

POSITIVE_CONFIRMATIONS = {
    "oui",
    "confirme",
    "confirm",
    "d accord",
    "d'accord",
    "yes",
    "okay",
    "ok",
    "نعم",
    "اوافق",
    "ey",
    "behi",
}
NEGATIVE_CONFIRMATIONS = {"non", "no", "لا", "le", "annule", "cancel", "refuse", "batel", "sa7bi batel", "إلغاء", "الغاء"}


def _public_chatbot_mode_enabled() -> bool:
    return bool(getattr(get_settings(), "chatbot_public_mode", False))


def _metadata_requests_public_context(metadata: dict[str, Any] | None) -> bool:
    if _public_chatbot_mode_enabled():
        return True
    if not isinstance(metadata, dict):
        return False
    return metadata.get("chatbotPublicContext") is True or metadata.get("chatbot_public_context") is True


def _parse_voice_metadata(raw: str | None) -> dict[str, Any]:
    if not raw or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _voice_workflow_metadata(
    metadata: dict[str, Any],
    *,
    app_state: Any,
    session_id: str | None,
    request_id: str,
    language: str | None,
) -> dict[str, Any]:
    resolved = dict(metadata or {})
    resolved_session = str(session_id or resolved.get("session_id") or resolved.get("sessionId") or "default").strip() or "default"
    resolved["session_id"] = resolved_session
    resolved.setdefault("sessionId", resolved_session)
    resolved.setdefault("conversation_id", resolved.get("conversationId") or resolved.get("conversation") or resolved_session)
    resolved.setdefault("conversationId", resolved.get("conversation_id"))
    resolved["channel"] = "voice"
    resolved["request_id"] = request_id
    resolved["requestId"] = request_id
    resolved["app_state"] = app_state
    if language:
        resolved.setdefault("language", language)
    return resolved


def _build_anonymous_voice_context(
    metadata: dict[str, Any],
    *,
    language_hint: str | None,
    request_id: str,
) -> CurrentUserContext:
    context = build_chatbot_context_from_metadata(
        metadata,
        language=language_hint or "fr",
        channel="voice",
    )
    context.metadata["request_id"] = request_id
    return context


@router.post("/v2/voice")
async def voice_v2(
    request: Request,
    audio_file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    request_id: str | None = Form(default=None),
    language_hint: str | None = Form(default=None),
    generate_tts: bool = Form(default=True),
    metadata: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
) -> JSONResponse:
    resolved_request_id = ensure_request_id(x_request_id or request_id)
    request_token = set_request_id(resolved_request_id)
    stored: StoredAudio | None = None
    processor = VoiceRequestProcessor(request.app.state)
    parsed_metadata = _voice_workflow_metadata(
        _parse_voice_metadata(metadata),
        app_state=request.app.state,
        session_id=session_id,
        request_id=resolved_request_id,
        language=language_hint,
    )
    try:
        with start_span("voice.request", {"has_authorization": bool(authorization), "generate_tts": generate_tts}):
            services = ensure_copilot_services(request.app.state)
            bearer_token = extract_bearer_token(authorization)
            public_context_requested = _metadata_requests_public_context(parsed_metadata)
            try:
                if not bearer_token and public_context_requested:
                    raise ContextError("missing_jwt", "Authorization header is required.", 401)
                context = await services["context_builder"].build(authorization, locale="fr-FR", language=language_hint or "fr")
                context.metadata["request_id"] = resolved_request_id
                apply_safe_request_metadata(context, parsed_metadata, language=language_hint)
            except ContextError as exc:
                if public_context_requested and exc.status_code == 401:
                    context = _build_anonymous_voice_context(
                        parsed_metadata,
                        language_hint=language_hint,
                        request_id=resolved_request_id,
                    )
                    log_event(
                        "ai.voice_v2.public_demo",
                        metadata={
                            "request_id": resolved_request_id,
                            "role": context.role,
                            "user_id": context.user_id,
                        },
                    )
                else:
                    return JSONResponse(
                        status_code=exc.status_code,
                        content=ApiEnvelope.fail(
                            exc.code,
                            exc.message,
                            status_details={"request_id": resolved_request_id, "requestId": resolved_request_id},
                        ).model_dump(mode="json"),
                    )

            try:
                processed = await processor.process_upload(audio_file, context=context, language_hint=language_hint)
                stored = processed.stored_audio
                stt_result = processed.stt
                context.language = processed.detected_language
                context.metadata["language"] = processed.detected_language
                apply_safe_request_metadata(context, parsed_metadata, language=processed.detected_language)
                context.metadata["voice_language_confidence"] = stt_result.language_confidence
                if stt_result.status == "no_input":
                    return JSONResponse(status_code=200, content=_voice_error_with_request_id(stt_result.error or "no_voice_detected", resolved_request_id))
                if stt_result.status == "retry":
                    return JSONResponse(status_code=200, content=_voice_error_with_request_id(stt_result.error or "unclean_transcription", resolved_request_id))
                if stt_result.status == "unavailable":
                    return JSONResponse(status_code=200, content=_voice_error_with_request_id(stt_result.error or "stt_unavailable", resolved_request_id))
                if stt_result.status == "cancelled":
                    return JSONResponse(status_code=200, content=_voice_error_with_request_id(stt_result.error or "audio_cancelled", resolved_request_id))
                if stt_result.status != "success" or not (stt_result.cleaned_text or "").strip():
                    return JSONResponse(status_code=200, content=_voice_error_with_request_id(stt_result.error or "audio_processing_failed", resolved_request_id))

                transcript = (stt_result.cleaned_text or "").strip()
                confirmation_response = await _maybe_handle_voice_confirmation(
                    transcript=transcript,
                    context=context,
                    services=services,
                )
                if confirmation_response is not None:
                    response = confirmation_response
                else:
                    voice_role_router = _voice_role_router(request.app.state, services)
                    if voice_role_router.can_handle(transcript, context):
                        with start_span(
                            "voice.role_intelligence",
                            {"user_id": context.user_id, "role": context.role, "language": processed.detected_language},
                        ):
                            response = await voice_role_router.handle(transcript, context)
                            log_event(
                                "voice.role_intelligence",
                                metadata={
                                    "role": context.role,
                                    "intent": getattr(response, "intent", None),
                                    "requires_confirmation": bool(getattr(response, "requiresConfirmation", False)),
                                },
                            )
                    else:
                        with start_span("voice.copilot", {"user_id": context.user_id, "language": processed.detected_language}):
                            response = await process_copilot_message(
                                context.user_id,
                                transcript,
                                extract_bearer_token(authorization),
                                context.role,
                                channel="voice",
                                metadata={**parsed_metadata, "language": processed.detected_language, "voice_v2": True},
                                context=context,
                            )
                            log_event(
                                "voice.copilot",
                                metadata={
                                    "detected_language": processed.detected_language,
                                    "status": getattr(response, "type", "unknown"),
                                    "cleaned_empty": False,
                                },
                            )

                response = optimize_voice_response(response, context)
                response = services["response_guard"].guard_response(response, context)
                response_payload = _payload_from_response(response)
                text = str(response_payload.get("text") or response_payload.get("message") or response_payload.get("response") or "")
                audio_url = None
                if generate_tts and text:
                    audio_url = await _safe_generate_tts(
                        processor,
                        text,
                        language=processed.detected_language,
                        request_id=resolved_request_id,
                    )
                tts_unavailable = bool(generate_tts and text and not audio_url)
                tts_status = "generated" if audio_url else "unavailable" if tts_unavailable else "skipped"

                with start_span("voice.response.normalize", {"intent": response_payload.get("intent"), "has_audio": bool(audio_url)}):
                    payload = {
                        "request_id": resolved_request_id,
                        "requestId": resolved_request_id,
                        "transcript": transcript,
                        "transcription": transcript,
                        "detectedLanguage": processed.detected_language,
                        "detected_language": processed.detected_language,
                        "languageConfidence": stt_result.language_confidence,
                        "language_confidence": stt_result.language_confidence,
                        "responseLocale": processed.detected_language,
                        "response_locale": processed.detected_language,
                        "text": text,
                        "response": text,
                        "message": text,
                        "intent": response_payload.get("intent"),
                        "agent": _infer_agent(response_payload.get("intent")),
                        "requiresConfirmation": bool(response_payload.get("requiresConfirmation")),
                        "confirmationId": response_payload.get("confirmationId"),
                        "confirmation_id": response_payload.get("confirmationId"),
                        "actionResult": response_payload.get("actionResult"),
                        "action_result": response_payload.get("actionResult"),
                        "toolCalls": response_payload.get("toolCalls") or [],
                        "tool_calls": response_payload.get("toolCalls") or [],
                        "audioUrl": audio_url,
                        "audio_url": audio_url,
                        "audioStatus": tts_status,
                        "audio_status": tts_status,
                        "ttsUnavailable": tts_unavailable,
                        "tts_unavailable": tts_unavailable,
                    }
                    return JSONResponse(status_code=200, content=ApiEnvelope.ok(payload).model_dump(mode="json"))
            except asyncio.CancelledError:
                log_event("voice.v2.cancelled", metadata={"request_id": resolved_request_id})
                return JSONResponse(status_code=200, content=_voice_error_with_request_id("audio_cancelled", resolved_request_id))
            except Exception as exc:  # noqa: BLE001
                log_error("voice.v2.unhandled", exc)
                return JSONResponse(status_code=500, content=_voice_error_with_request_id("audio_processing_failed", resolved_request_id))
            finally:
                processor.cleanup(stored)
    finally:
        reset_request_id(request_token)


async def _maybe_handle_voice_confirmation(
    *,
    transcript: str,
    context: CurrentUserContext,
    services: dict[str, Any],
) -> AgentResponse | None:
    normalized = _confirmation_token(transcript)
    if normalized not in POSITIVE_CONFIRMATIONS and normalized not in NEGATIVE_CONFIRMATIONS:
        return None

    result = await services["workflow_orchestrator"].maybe_confirm_latest_pending(
        approved=normalized in POSITIVE_CONFIRMATIONS,
        context=context,
        channel="voice",
        metadata={
            "request_id": context.metadata.get("request_id"),
            "language": context.language,
            "session_id": context.metadata.get("session_id"),
            "conversation_id": context.metadata.get("conversation_id"),
            "current_page": context.metadata.get("current_page"),
        },
    )
    if result is None:
        return None
    return result.response


def _confirmation_token(value: str) -> str:
    lowered = (value or "").strip().lower().replace("’", "'")
    lowered = lowered.replace("é", "e").replace("è", "e").replace("ê", "e").replace("à", "a")
    return " ".join(lowered.split())


def _payload_from_response(response: Any) -> dict[str, Any]:
    if hasattr(response, "model_dump"):
        payload = response.model_dump(mode="json")
    else:
        payload = getattr(response, "__dict__", response)
    return payload if isinstance(payload, dict) else {"text": str(response)}


def _infer_agent(intent: Any) -> str | None:
    value = str(intent or "")
    if value.startswith("voice_role."):
        return "role_intelligence"
    if value.startswith("confirmation."):
        return "confirmation"
    if value.startswith("attendance.") or value in {"CHECK_IN", "CHECK_OUT", "GET_STATUS"}:
        return "attendance"
    if "leave" in value.lower() or value == "CREATE_LEAVE":
        return "leave"
    if "document" in value.lower() or value == "REQUEST_DOCUMENT":
        return "document"
    if "telework" in value.lower() or value == "CREATE_TELEWORK":
        return "telework"
    if "authorization" in value.lower():
        return "authorization"
    if value.startswith("manager."):
        return "manager"
    if value.startswith("rh."):
        return "rh"
    return None


def _voice_role_router(app_state: Any, services: dict[str, Any]) -> VoiceRoleRouter:
    router = getattr(app_state, "voice_role_router", None)
    if router is None:
        router = VoiceRoleRouter(services["executor"])
        app_state.voice_role_router = router
    return router


async def _safe_generate_tts(
    processor: VoiceRequestProcessor,
    text: str,
    *,
    language: str | None,
    request_id: str,
) -> str | None:
    try:
        return await processor.generate_tts(text, language=language)
    except Exception as exc:  # noqa: BLE001
        log_error("voice.v2.tts_failed", exc)
        log_event(
            "voice.v2.tts_unavailable",
            metadata={"request_id": request_id, "language": language or "auto"},
        )
        return None


def _voice_error_with_request_id(code: str, request_id: str) -> dict[str, Any]:
    payload = voice_error_payload(code)
    payload["data"] = {"request_id": request_id, "requestId": request_id}
    error = payload.get("error")
    if isinstance(error, dict):
        details = error.setdefault("details", {})
        if isinstance(details, dict):
            details["request_id"] = request_id
            details["requestId"] = request_id
    return payload
