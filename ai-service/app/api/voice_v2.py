from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, Form, Header, Request, UploadFile
from fastapi.responses import JSONResponse

from app.context.context_builder import ContextError
from app.context.jwt_parser import extract_bearer_token
from app.core.copilot_engine import ensure_copilot_services, process_copilot_message
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.models.envelopes import ApiEnvelope
from app.observability.tracing import log_error, log_event, start_span
from app.voice_pipeline.voice_errors import voice_error_payload
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceRequestProcessor

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
NEGATIVE_CONFIRMATIONS = {"non", "no", "لا", "le", "annule", "cancel", "refuse"}


@router.post("/v2/voice")
async def voice_v2(
    request: Request,
    audio_file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    language_hint: str | None = Form(default=None),
    generate_tts: bool = Form(default=True),
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    _ = session_id
    stored: StoredAudio | None = None
    processor = VoiceRequestProcessor(request.app.state)
    with start_span("voice.v2.request", {"has_authorization": bool(authorization), "generate_tts": generate_tts}):
        services = ensure_copilot_services(request.app.state)
        try:
            context = await services["context_builder"].build(authorization, locale="fr-FR", language=language_hint or "fr")
        except ContextError as exc:
            return JSONResponse(status_code=exc.status_code, content=ApiEnvelope.fail(exc.code, exc.message).model_dump(mode="json"))

        try:
            processed = await processor.process_upload(audio_file, context=context, language_hint=language_hint)
            stored = processed.stored_audio
            stt_result = processed.stt
            if stt_result.status == "no_input":
                return JSONResponse(status_code=200, content=voice_error_payload(stt_result.error or "no_voice_detected"))
            if stt_result.status == "retry":
                return JSONResponse(status_code=200, content=voice_error_payload(stt_result.error or "unclean_transcription"))
            if stt_result.status != "success" or not (stt_result.cleaned_text or "").strip():
                return JSONResponse(status_code=200, content=voice_error_payload(stt_result.error or "audio_processing_failed"))

            transcript = (stt_result.cleaned_text or "").strip()
            confirmation_response = await _maybe_handle_voice_confirmation(
                transcript=transcript,
                context=context,
                services=services,
            )
            if confirmation_response is not None:
                response = confirmation_response
            else:
                with start_span("voice.copilot.process", {"user_id": context.user_id, "language": processed.detected_language}):
                    response = await process_copilot_message(
                        context.user_id,
                        transcript,
                        extract_bearer_token(authorization),
                        context.role,
                        channel="voice",
                        metadata={
                            "app_state": request.app.state,
                            "session_id": session_id,
                            "language": processed.detected_language,
                            "voice_v2": True,
                        },
                    )
                    log_event(
                        "voice.copilot.process",
                        metadata={
                            "detected_language": processed.detected_language,
                            "status": getattr(response, "type", "unknown"),
                            "cleaned_empty": False,
                        },
                    )

            response_payload = _payload_from_response(response)
            text = str(response_payload.get("text") or response_payload.get("message") or response_payload.get("response") or "")
            audio_url = None
            if generate_tts and text:
                audio_url = await processor.generate_tts(text, language=processed.detected_language)

            with start_span("voice.v2.response", {"intent": response_payload.get("intent"), "has_audio": bool(audio_url)}):
                payload = {
                    "transcript": transcript,
                    "detectedLanguage": processed.detected_language,
                    "response": text,
                    "intent": response_payload.get("intent"),
                    "agent": _infer_agent(response_payload.get("intent")),
                    "requiresConfirmation": bool(response_payload.get("requiresConfirmation")),
                    "confirmationId": response_payload.get("confirmationId"),
                    "audioUrl": audio_url,
                }
                return JSONResponse(status_code=200, content=ApiEnvelope.ok(payload).model_dump(mode="json"))
        except Exception as exc:  # noqa: BLE001
            log_error("voice.v2.unhandled", exc)
            return JSONResponse(status_code=500, content=voice_error_payload("audio_processing_failed"))
        finally:
            processor.cleanup(stored)


async def _maybe_handle_voice_confirmation(
    *,
    transcript: str,
    context,
    services: dict[str, Any],
) -> AgentResponse | None:
    normalized = _confirmation_token(transcript)
    if normalized not in POSITIVE_CONFIRMATIONS and normalized not in NEGATIVE_CONFIRMATIONS:
        return None

    store = services["confirmation_store"]
    record = store.find_pending_for_user(context.user_id, context.tenant_id)
    if record is None:
        return None

    if normalized in NEGATIVE_CONFIRMATIONS:
        store.reject(record.confirmation_id)
        return AgentResponse(
            type="answer",
            text="Action annulee.",
            intent="confirmation.rejected",
            confidence=1.0,
            requiresConfirmation=False,
            confirmationId=record.confirmation_id,
        )

    store.consume(record.confirmation_id)
    result = await services["executor"].execute(record.tool_name, record.tool_input, context, confirmed=True)
    log_event(
        "confirmation.executed",
        metadata={
            "confirmation_id": record.confirmation_id,
            "tool_name": record.tool_name,
            "status": "success" if result.success else "failed",
            "http_status": result.status_code,
            "business_conflict": bool(result.status_code == 409),
        },
    )
    return AgentResponse(
        type="execute_action" if result.success else "error",
        text="Action confirmee." if result.success else (result.error_message or "Action refusee par le backend."),
        intent=f"confirmation.{record.tool_name}",
        confidence=1.0,
        requiresConfirmation=False,
        confirmationId=record.confirmation_id,
        toolCalls=[ToolCallRecord(name=record.tool_name, arguments=record.tool_input, status="success" if result.success else "failed")],
        actionResult=result.model_dump(mode="json"),
    )


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
