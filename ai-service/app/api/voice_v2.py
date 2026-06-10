from __future__ import annotations

import asyncio
import json
import logging
from time import perf_counter
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
from app.nlp.language_detector import resolve_response_language
from app.observability.braintrust_client import log_voice_interaction
from app.observability.request_context import ensure_request_id, reset_request_id, set_request_id
from app.observability.tracing import log_error, log_event, start_span
from app.workflows.workflow_steps import apply_safe_request_metadata
from app.voice import VoiceRoleRouter, optimize_voice_response
from app.voice_pipeline.voice_errors import voice_error_payload
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceRequestProcessor
from config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)

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
    if not isinstance(metadata, dict):
        return False
    if _public_chatbot_mode_enabled() and (
        metadata.get("chatbotPublicContext") is True or metadata.get("chatbot_public_context") is True
    ):
        return True
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
        resolved.setdefault("requested_language", language)
        resolved.setdefault("response_language", language)
        resolved.setdefault("detectedLanguage", language)
        resolved.setdefault("detected_language", language)
        resolved.setdefault("stt_language", language)
    return resolved


def _set_voice_language_metadata(metadata: dict[str, Any], language: str) -> dict[str, Any]:
    metadata["language"] = language
    metadata["requested_language"] = language
    metadata["requestedLanguage"] = language
    metadata["response_language"] = language
    metadata["responseLanguage"] = language
    metadata["detectedLanguage"] = language
    metadata["detected_language"] = language
    return metadata


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
    request_started = perf_counter()
    stored: StoredAudio | None = None
    context: CurrentUserContext | None = None
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
                    log_voice_interaction(
                        transcription="",
                        output_text="",
                        model=get_settings().ollama_model,
                        role=None,
                        language=language_hint,
                        latency_ms=round((perf_counter() - request_started) * 1000, 2),
                        status="error",
                        error_type=exc.__class__.__name__,
                        error_message=exc.message,
                        request_id=resolved_request_id,
                        metadata_extra={"error_code": exc.code, "status_code": exc.status_code},
                    )
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
                timings = dict(processed.timings)
                stored = processed.stored_audio
                stt_result = processed.stt
                transcript_for_language = (stt_result.cleaned_text or stt_result.raw_text or "").strip()
                parsed_metadata["original_text"] = transcript_for_language
                if processed.detected_language in {"tn", "ar"}:
                    response_language = processed.detected_language
                else:
                    response_language = resolve_response_language(
                        transcript_for_language,
                        parsed_metadata,
                        stt_language=processed.detected_language or stt_result.language,
                    )
                _set_voice_language_metadata(parsed_metadata, response_language)
                parsed_metadata["stt_language"] = stt_result.language
                parsed_metadata["sttLanguage"] = stt_result.language
                context.language = response_language
                context.metadata["language"] = response_language
                apply_safe_request_metadata(context, parsed_metadata, language=response_language)
                context.metadata["voice_language_confidence"] = stt_result.language_confidence
                if stt_result.status == "no_input":
                    return _voice_error_response(stt_result.error or "no_voice_detected", resolved_request_id, stt_result, request_started, language=response_language, timings=timings, context=context, audio_size_bytes=stored.size_bytes)
                if stt_result.status == "retry":
                    return _voice_error_response(stt_result.error or "unclean_transcription", resolved_request_id, stt_result, request_started, language=response_language, timings=timings, context=context, audio_size_bytes=stored.size_bytes)
                if stt_result.status == "unavailable":
                    return _voice_error_response(stt_result.error or "stt_unavailable", resolved_request_id, stt_result, request_started, language=response_language, timings=timings, context=context, audio_size_bytes=stored.size_bytes)
                if stt_result.status == "cancelled":
                    return _voice_error_response(stt_result.error or "audio_cancelled", resolved_request_id, stt_result, request_started, language=response_language, timings=timings, context=context, audio_size_bytes=stored.size_bytes)
                if stt_result.status != "success" or not (stt_result.cleaned_text or "").strip():
                    return _voice_error_response(stt_result.error or "audio_processing_failed", resolved_request_id, stt_result, request_started, language=response_language, timings=timings, context=context, audio_size_bytes=stored.size_bytes)

                transcript = (stt_result.cleaned_text or "").strip()
                agent_started = perf_counter()
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
                            {"user_id": context.user_id, "role": context.role, "language": response_language},
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
                        with start_span("voice.copilot", {"user_id": context.user_id, "language": response_language}):
                            response = await process_copilot_message(
                                context.user_id,
                                transcript,
                                extract_bearer_token(authorization),
                                context.role,
                                channel="voice",
                                metadata={
                                    **parsed_metadata,
                                    "language": response_language,
                                    "requested_language": response_language,
                                    "response_language": response_language,
                                    "voice_v2": True,
                                },
                                context=context,
                            )
                            log_event(
                                "voice.copilot",
                                metadata={
                                    "detected_language": response_language,
                                    "status": getattr(response, "type", "unknown"),
                                    "cleaned_empty": False,
                                },
                            )
                timings["agent_ms"] = round((perf_counter() - agent_started) * 1000, 2)
                timings["llm_ms"] = timings["agent_ms"]

                response = optimize_voice_response(response, context)
                response = services["response_guard"].guard_response(response, context)
                response_payload = _payload_from_response(response)
                text = str(response_payload.get("text") or response_payload.get("message") or response_payload.get("response") or "")
                audio_url = None
                if generate_tts and text:
                    tts_started = perf_counter()
                    audio_url = await _safe_generate_tts(
                        processor,
                        text,
                        language=response_language,
                        request_id=resolved_request_id,
                    )
                    timings["tts_generation_ms"] = round((perf_counter() - tts_started) * 1000, 2)
                timings["tts_ms"] = float(timings.get("tts_generation_ms") or 0.0)
                tts_unavailable = bool(generate_tts and text and not audio_url)
                tts_status = "generated" if audio_url else "unavailable" if tts_unavailable else "skipped"
                timings["total_request_ms"] = round((perf_counter() - request_started) * 1000, 2)
                timings["total_ms"] = timings["total_request_ms"]
                timings.setdefault("stt_ms", float(timings.get("stt_service_ms") or 0.0))

                with start_span("voice.response.normalize", {"intent": response_payload.get("intent"), "has_audio": bool(audio_url)}):
                    payload = {
                        "request_id": resolved_request_id,
                        "requestId": resolved_request_id,
                        "correlation_id": resolved_request_id,
                        "correlationId": resolved_request_id,
                        "transcript": transcript,
                        "transcription": transcript,
                        "rawTranscript": stt_result.raw_text,
                        "raw_transcript": stt_result.raw_text,
                        "cleanedTranscript": transcript,
                        "cleaned_transcript": transcript,
                        "detectedLanguage": response_language,
                        "detected_language": response_language,
                        "languageConfidence": stt_result.language_confidence,
                        "language_confidence": stt_result.language_confidence,
                        "responseLocale": response_language,
                        "response_locale": response_language,
                        "response_language": response_language,
                        "requested_language": response_language,
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
                        "timings": timings,
                        "warnings": ["tts_unavailable"] if tts_unavailable else [],
                    }
                    content = ApiEnvelope.ok(payload).model_dump(mode="json")
                    content.update(
                        {
                            "transcript": transcript,
                            "transcription": transcript,
                            "cleaned_transcript": transcript,
                            "raw_transcript": stt_result.raw_text,
                            "language": response_language,
                            "response": text,
                            "message": text,
                            "timings": timings,
                        }
                    )
                    _log_voice_request_summary(
                        request_id=resolved_request_id,
                        duration_seconds=stt_result.duration_seconds,
                        timings=timings,
                        success=True,
                        error_code=None,
                    )
                    action_result = response_payload.get("actionResult")
                    action_result = action_result if isinstance(action_result, dict) else {}
                    log_voice_interaction(
                        transcription=transcript,
                        output_text=text,
                        model=str(action_result.get("model") or get_settings().ollama_model),
                        role=context.role,
                        intent=str(response_payload.get("intent") or "") or None,
                        language=response_language,
                        tenant_id=context.tenant_id,
                        company_id=context.entreprise_id,
                        user_id=context.user_id,
                        latency_ms=timings.get("total_ms"),
                        status="error" if response_payload.get("type") == "error" else "success",
                        error_type="VoiceAgentError" if response_payload.get("type") == "error" else None,
                        error_message=text if response_payload.get("type") == "error" else None,
                        request_id=resolved_request_id,
                        audio_size_bytes=stored.size_bytes,
                        audio_duration_seconds=stt_result.duration_seconds,
                        stt_latency_ms=timings.get("stt_ms"),
                        llm_latency_ms=timings.get("llm_ms"),
                        tts_latency_ms=timings.get("tts_ms"),
                        metadata_extra={
                            "agent": payload["agent"],
                            "stt_language": stt_result.language,
                            "stt_language_confidence": stt_result.language_confidence,
                            "tts_status": tts_status,
                            "tts_unavailable": tts_unavailable,
                            "llm_used": bool(action_result.get("llm_used")),
                            "fallback_used": bool(action_result.get("fallbackUsed") or action_result.get("fallback_used")),
                        },
                    )
                    return JSONResponse(status_code=200, content=content)
            except asyncio.CancelledError:
                log_event("voice.v2.cancelled", metadata={"request_id": resolved_request_id})
                return _voice_error_response(
                    "audio_cancelled",
                    resolved_request_id,
                    None,
                    request_started,
                    language=language_hint,
                    context=context,
                    audio_size_bytes=stored.size_bytes if stored else None,
                )
            except Exception as exc:  # noqa: BLE001
                log_error("voice.v2.unhandled", exc)
                return _voice_error_response(
                    "audio_processing_failed",
                    resolved_request_id,
                    None,
                    request_started,
                    language=language_hint,
                    status_code=500,
                    context=context,
                    audio_size_bytes=stored.size_bytes if stored else None,
                    exception=exc,
                )
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


def _voice_error_with_request_id(
    code: str,
    request_id: str,
    *,
    language: str | None = None,
    timings: dict[str, float] | None = None,
) -> dict[str, Any]:
    payload = voice_error_payload(code, language=language)
    resolved_timings = _finalize_voice_timings(timings or {})
    if code == "stt_timeout":
        message = "La transcription a pris trop de temps. Veuillez réessayer avec un message plus court."
        return {
            "success": False,
            "error": "STT_TIMEOUT",
            "error_code": "STT_TIMEOUT",
            "message": message,
            "data": {
                "request_id": request_id,
                "requestId": request_id,
                "correlation_id": request_id,
                "correlationId": request_id,
                "timings": resolved_timings,
                "warnings": ["STT_TIMEOUT"],
            },
            "timings": resolved_timings,
            "warnings": ["STT_TIMEOUT"],
        }
    payload["data"] = {
        "request_id": request_id,
        "requestId": request_id,
        "correlation_id": request_id,
        "correlationId": request_id,
        "timings": resolved_timings,
        "warnings": [code],
    }
    error = payload.get("error")
    if isinstance(error, dict):
        details = error.setdefault("details", {})
        if isinstance(details, dict):
            details["request_id"] = request_id
            details["requestId"] = request_id
    return payload


def _voice_error_response(
    code: str,
    request_id: str,
    stt_result: Any,
    request_started: float,
    *,
    language: str | None = None,
    timings: dict[str, float] | None = None,
    status_code: int = 200,
    context: CurrentUserContext | None = None,
    audio_size_bytes: int | None = None,
    exception: BaseException | None = None,
) -> JSONResponse:
    resolved_timings = _finalize_voice_timings(timings or {}, request_started=request_started)
    duration_seconds = float(getattr(stt_result, "duration_seconds", 0.0) or 0.0) if stt_result is not None else 0.0
    _log_voice_request_summary(
        request_id=request_id,
        duration_seconds=duration_seconds,
        timings=resolved_timings,
        success=False,
        error_code="STT_TIMEOUT" if code == "stt_timeout" else code,
    )
    transcription = ""
    if stt_result is not None:
        transcription = str(getattr(stt_result, "cleaned_text", None) or getattr(stt_result, "raw_text", None) or "")
    log_voice_interaction(
        transcription=transcription,
        output_text="",
        model=get_settings().ollama_model,
        role=context.role if context is not None else None,
        language=language,
        tenant_id=context.tenant_id if context is not None else None,
        company_id=context.entreprise_id if context is not None else None,
        user_id=context.user_id if context is not None else None,
        latency_ms=resolved_timings.get("total_ms"),
        status="error",
        error_type=exception.__class__.__name__ if exception is not None else ("TimeoutError" if code == "stt_timeout" else "VoicePipelineError"),
        error_message=str(exception) if exception is not None else code,
        request_id=request_id,
        audio_size_bytes=audio_size_bytes,
        audio_duration_seconds=duration_seconds,
        stt_latency_ms=resolved_timings.get("stt_ms"),
        llm_latency_ms=resolved_timings.get("llm_ms"),
        tts_latency_ms=resolved_timings.get("tts_ms"),
        metadata_extra={
            "voice_error_code": "STT_TIMEOUT" if code == "stt_timeout" else code,
            "stt_status": getattr(stt_result, "status", None) if stt_result is not None else "unknown",
            "stt_language": getattr(stt_result, "language", None) if stt_result is not None else language,
            "stt_language_confidence": getattr(stt_result, "language_confidence", None) if stt_result is not None else None,
        },
    )
    return JSONResponse(
        status_code=status_code,
        content=_voice_error_with_request_id(code, request_id, language=language, timings=resolved_timings),
    )


def _finalize_voice_timings(
    timings: dict[str, float],
    *,
    request_started: float | None = None,
) -> dict[str, float]:
    resolved = dict(timings or {})
    if request_started is not None:
        resolved["total_request_ms"] = round((perf_counter() - request_started) * 1000, 2)
    resolved.setdefault("stt_ms", float(resolved.get("stt_service_ms") or resolved.get("whisper_ms") or 0.0))
    resolved.setdefault("llm_ms", float(resolved.get("agent_ms") or 0.0))
    resolved.setdefault("tts_ms", float(resolved.get("tts_generation_ms") or 0.0))
    resolved.setdefault("total_ms", float(resolved.get("total_request_ms") or resolved.get("total_voice_processing_ms") or 0.0))
    return resolved


def _log_voice_request_summary(
    *,
    request_id: str,
    duration_seconds: float,
    timings: dict[str, float],
    success: bool,
    error_code: str | None,
) -> None:
    logger.info(
        "voice_request_summary request_id=%s duration_seconds=%.3f stt_ms=%.2f llm_ms=%.2f tts_ms=%.2f total_ms=%.2f success=%s error_code=%s",
        request_id,
        float(duration_seconds or 0.0),
        float(timings.get("stt_ms") or 0.0),
        float(timings.get("llm_ms") or 0.0),
        float(timings.get("tts_ms") or 0.0),
        float(timings.get("total_ms") or 0.0),
        bool(success),
        error_code or "",
    )
