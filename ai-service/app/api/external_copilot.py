from __future__ import annotations

import json
import logging
from time import perf_counter
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    Security,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

from app.context.anonymous_context import build_chatbot_context_from_metadata
from app.context.current_user import CurrentUserContext
from app.core.copilot_engine import ensure_copilot_services, process_copilot_message
from app.nlp.language_detector import detect_language, resolve_response_language
from app.observability.request_context import ensure_request_id, reset_request_id, set_request_id
from app.observability.tracing import log_error, log_event, start_span
from app.voice import optimize_voice_response
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceRequestProcessor
from config import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/copilot", tags=["External Reusable Copilot API"])

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Models & DTOs
# ─────────────────────────────────────────────────────────────────────────────

class ExternalChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Message textuel envoyé par l'application cliente")
    session_id: str | None = Field(default=None, description="Identifiant unique de session conversationnelle")
    user_id: int | None = Field(default=1, description="Identifiant utilisateur côté client")
    entreprise_id: int | None = Field(default=1, description="Identifiant entreprise / tenant")
    role: str | None = Field(default="EMPLOYEE", description="Rôle utilisateur (EMPLOYEE, MANAGER, RH, ADMIN)")
    language: str | None = Field(default=None, description="Indice de langue (fr, en, ar, tn)")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Métadonnées applicatives libres")


class ExternalChatResponse(BaseModel):
    success: bool = True
    reply: str
    session_id: str
    intent: str | None = None
    language: str = "fr"
    suggested_actions: list[str] = Field(default_factory=list)
    requires_confirmation: bool = False
    confirmation_id: str | None = None
    timings: dict[str, float] = Field(default_factory=dict)
    request_id: str


class ExternalVoiceResponse(BaseModel):
    success: bool = True
    transcription: str
    reply: str
    detected_language: str
    audio_url: str | None = None
    audio_status: str = "skipped"  # "generated", "unavailable", "skipped"
    session_id: str
    intent: str | None = None
    requires_confirmation: bool = False
    confirmation_id: str | None = None
    timings: dict[str, float] = Field(default_factory=dict)
    request_id: str


class ExternalTranscribeResponse(BaseModel):
    success: bool = True
    transcription: str
    detected_language: str
    confidence: float = 0.0
    duration_seconds: float = 0.0
    timings: dict[str, float] = Field(default_factory=dict)
    request_id: str


class ExternalSynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="Texte à synthétiser vocalement")
    language: str | None = Field(default="fr", description="Langue de synthèse (fr, en, ar)")


class ExternalSynthesizeResponse(BaseModel):
    success: bool = True
    audio_url: str
    language: str
    timings: dict[str, float] = Field(default_factory=dict)
    request_id: str


class ExternalHealthResponse(BaseModel):
    status: str = "ok"
    service: str = "WeenTime Reusable Copilot API"
    version: str = "1.0.0"
    mode: str = "AI-as-a-Service"
    capabilities: list[str]
    stt_available: bool
    tts_available: bool


# ─────────────────────────────────────────────────────────────────────────────
# 2. Security Dependency (API Key Validation)
# ─────────────────────────────────────────────────────────────────────────────

def verify_external_api_key(
    api_key: str | None = Security(API_KEY_HEADER),
    settings: Settings = Depends(get_settings),
) -> str:
    """Valide la clé API fournie dans l'en-tête X-API-Key.

    Rejette les requêtes si l'API externe est désactivée ou si la clé est
    absente / invalide.
    """
    if not settings.external_api_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "external_api_disabled",
                "message": "L'API externe Copilot est temporairement désactivée.",
            },
        )
    if not api_key or not api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "missing_api_key",
                "message": "En-tête X-API-Key requis pour accéder à l'API Copilot.",
            },
        )
    cleaned_key = api_key.strip()
    if cleaned_key not in settings.external_api_keys:
        logger.warning("Tentative d'accès non autorisée avec une clé invalide: %s...", cleaned_key[:6])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid_api_key",
                "message": "Clé d'API X-API-Key non reconnue ou révoquée.",
            },
        )
    return cleaned_key


# ─────────────────────────────────────────────────────────────────────────────
# 3. Health & Discovery Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=ExternalHealthResponse)
async def external_copilot_health(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> ExternalHealthResponse:
    """Endpoint de découverte et vérification de disponibilité de l'API Copilot."""
    stt_ready = bool(getattr(request.app.state, "stt_service", None))
    tts_ready = bool(getattr(request.app.state, "tts_service", None) and settings.tts_enabled)
    capabilities = ["chat", "context", "rag"]
    if stt_ready:
        capabilities.extend(["voice", "transcribe"])
    if tts_ready:
        capabilities.extend(["synthesize"])

    return ExternalHealthResponse(
        status="ok",
        service=f"{settings.app_name} Reusable Copilot API",
        version="1.0.0",
        mode="AI-as-a-Service",
        capabilities=capabilities,
        stt_available=stt_ready,
        tts_available=tts_ready,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4. Text Chat Endpoint: POST /chat
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ExternalChatResponse)
async def external_copilot_chat(
    payload: ExternalChatRequest,
    request: Request,
    api_key: str = Depends(verify_external_api_key),
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
    settings: Settings = Depends(get_settings),
) -> ExternalChatResponse:
    """Envoie une requête textuelle au Copilot et reçoit la réponse intelligente.

    Supporte le RAG d'entreprise, la détection d'intention, le routage multi-agents
    et le contexte de session.
    """
    start_time = perf_counter()
    req_id = ensure_request_id(x_request_id)
    token = set_request_id(req_id)
    timings: dict[str, float] = {}

    try:
        clean_message = payload.message.strip()
        if not clean_message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "empty_message", "message": "Le message ne peut pas être vide."},
            )

        resolved_session = (payload.session_id or f"ext_{req_id[:8]}").strip()
        detected_lang = payload.language or detect_language(clean_message)

        # Construction du contexte sécurisé d'exécution
        context_meta = {
            **(payload.metadata or {}),
            "userId": payload.user_id or 1,
            "user_id": payload.user_id or 1,
            "entrepriseId": payload.entreprise_id or 1,
            "entreprise_id": payload.entreprise_id or 1,
            "role": payload.role or settings.external_api_default_role,
            "language": detected_lang,
            "channel": "external_api",
            "api_key_used": api_key[:6] + "...",
            "session_id": resolved_session,
            "sessionId": resolved_session,
            "original_text": clean_message,
        }

        context = build_chatbot_context_from_metadata(
            context_meta,
            language=detected_lang,
            channel="external_api",
        )
        context.metadata["request_id"] = req_id

        services = ensure_copilot_services(request.app.state)

        agent_start = perf_counter()
        with start_span("external_copilot.chat", {"session_id": resolved_session, "user_id": context.user_id}):
            agent_response = await process_copilot_message(
                context.user_id,
                clean_message,
                None,  # Pas de JWT interne requis, géré via API Key & anonymous context
                context.role,
                channel="external_api",
                metadata={
                    **context_meta,
                    "session_id": resolved_session,
                    "sessionId": resolved_session,
                    "external_api": True,
                },
                context=context,
            )
        timings["agent_ms"] = round((perf_counter() - agent_start) * 1000, 2)

        # Protection des réponses et garanties de sécurité
        guarded = services["response_guard"].guard_response(agent_response, context)
        reply_text = getattr(guarded, "text", "") or getattr(guarded, "message", "") or "Je n'ai pas pu traiter votre demande."

        timings["total_ms"] = round((perf_counter() - start_time) * 1000, 2)

        return ExternalChatResponse(
            success=True,
            reply=reply_text,
            session_id=resolved_session,
            intent=getattr(guarded, "intent", None),
            language=context.language or detected_lang,
            suggested_actions=getattr(guarded, "suggestedActions", []) or [],
            requires_confirmation=bool(getattr(guarded, "requiresConfirmation", False)),
            confirmation_id=getattr(guarded, "confirmationId", None),
            timings=timings,
            request_id=req_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Erreur inattendue dans external_copilot_chat: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "copilot_processing_error", "message": "Une erreur est survenue lors du traitement du message."},
        ) from exc
    finally:
        reset_request_id(token)


# ─────────────────────────────────────────────────────────────────────────────
# 5. Multimodal Voice Endpoint: POST /voice
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/voice", response_model=ExternalVoiceResponse)
async def external_copilot_voice(
    request: Request,
    audio_file: UploadFile = File(..., description="Fichier audio brut (WAV, MP3, WEBM, OGG, M4A)"),
    session_id: str | None = Form(default=None),
    user_id: int = Form(default=1),
    entreprise_id: int = Form(default=1),
    role: str = Form(default="EMPLOYEE"),
    language_hint: str | None = Form(default=None),
    generate_tts: bool = Form(default=True),
    metadata: str | None = Form(default=None),
    api_key: str = Depends(verify_external_api_key),
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
    settings: Settings = Depends(get_settings),
) -> ExternalVoiceResponse:
    """Envoie un fichier audio, effectue la transcription Whisper, traite la demande

    via le Copilot et renvoie la réponse textuelle accompagnée de l'audio TTS généré.
    """
    start_time = perf_counter()
    req_id = ensure_request_id(x_request_id)
    token = set_request_id(req_id)
    timings: dict[str, float] = {}

    processor = VoiceRequestProcessor(request.app.state)
    stored: StoredAudio | None = None

    try:
        if not audio_file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "missing_audio_filename", "message": "Nom de fichier audio manquant."},
            )

        # 1. Parsing des métadonnées
        parsed_meta: dict[str, Any] = {}
        if metadata and metadata.strip():
            try:
                parsed = json.loads(metadata)
                if isinstance(parsed, dict):
                    parsed_meta = parsed
            except Exception:
                pass

        resolved_session = (session_id or f"ext_voice_{req_id[:8]}").strip()

        context_meta = {
            **parsed_meta,
            "userId": user_id,
            "user_id": user_id,
            "entrepriseId": entreprise_id,
            "entreprise_id": entreprise_id,
            "role": role or settings.external_api_default_role,
            "channel": "external_voice",
            "session_id": resolved_session,
            "sessionId": resolved_session,
        }

        context = build_chatbot_context_from_metadata(
            context_meta,
            language=language_hint or "fr",
            channel="external_voice",
        )
        context.metadata["request_id"] = req_id

        # 2. Transcription Vocale via Whisper STT
        stt_proc = await processor.process_upload(
            audio_file,
            context=context,
            language_hint=language_hint,
        )
        stored = stt_proc.stored_audio
        timings.update(stt_proc.timings)

        transcript = stt_proc.stt.cleaned_text or stt_proc.stt.raw_text or ""
        detected_lang = stt_proc.detected_language or "fr"

        if not transcript.strip():
            # Cas audio inaudible ou vide : retour maîtrisé sans crash 500
            timings["total_ms"] = round((perf_counter() - start_time) * 1000, 2)
            fallback_msg = (
                "I did not hear anything. Please try speaking again."
                if detected_lang == "en"
                else "Je n'ai rien entendu. Veuillez réessayer de parler clairement."
            )
            return ExternalVoiceResponse(
                success=True,
                transcription="",
                reply=fallback_msg,
                detected_language=detected_lang,
                audio_url=None,
                audio_status="skipped",
                session_id=resolved_session,
                intent=None,
                requires_confirmation=False,
                confirmation_id=None,
                timings=timings,
                request_id=req_id,
            )

        # 3. Traitement Copilot
        services = ensure_copilot_services(request.app.state)
        agent_start = perf_counter()
        with start_span("external_copilot.voice.copilot", {"transcript": transcript, "session_id": resolved_session}):
            agent_response = await process_copilot_message(
                context.user_id,
                transcript,
                None,
                context.role,
                channel="external_voice",
                metadata={
                    **context_meta,
                    "session_id": resolved_session,
                    "sessionId": resolved_session,
                    "language": detected_lang,
                    "external_api": True,
                },
                context=context,
            )
        timings["agent_ms"] = round((perf_counter() - agent_start) * 1000, 2)

        # 4. Optimisation vocale et sécurisation
        agent_response = optimize_voice_response(agent_response, context)
        guarded = services["response_guard"].guard_response(agent_response, context)
        reply_text = getattr(guarded, "text", "") or getattr(guarded, "message", "") or "Action traitée."

        # 5. Synthèse Vocale TTS (si demandée)
        audio_url: str | None = None
        audio_status = "skipped"
        if generate_tts and reply_text:
            tts_start = perf_counter()
            try:
                audio_url = await processor.generate_tts(reply_text, language=detected_lang)
                timings["tts_ms"] = round((perf_counter() - tts_start) * 1000, 2)
                audio_status = "generated" if audio_url else "unavailable"
            except Exception as exc:
                logger.warning("Échec de la synthèse TTS pour l'API externe: %s", exc)
                audio_status = "unavailable"

        timings["total_ms"] = round((perf_counter() - start_time) * 1000, 2)

        return ExternalVoiceResponse(
            success=True,
            transcription=transcript,
            reply=reply_text,
            detected_language=detected_lang,
            audio_url=audio_url,
            audio_status=audio_status,
            session_id=resolved_session,
            intent=getattr(guarded, "intent", None),
            requires_confirmation=bool(getattr(guarded, "requiresConfirmation", False)),
            confirmation_id=getattr(guarded, "confirmationId", None),
            timings=timings,
            request_id=req_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Erreur inattendue dans external_copilot_voice: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "voice_processing_error", "message": "Erreur lors du traitement vocal."},
        ) from exc
    finally:
        processor.cleanup(stored)
        reset_request_id(token)


# ─────────────────────────────────────────────────────────────────────────────
# 6. Standalone Whisper STT as a Service: POST /transcribe
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/transcribe", response_model=ExternalTranscribeResponse)
async def external_copilot_transcribe(
    request: Request,
    audio_file: UploadFile = File(..., description="Fichier audio à transcrire"),
    language_hint: str | None = Form(default=None),
    api_key: str = Depends(verify_external_api_key),
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
) -> ExternalTranscribeResponse:
    """Service de transcription vocale pure (Whisper-as-a-Service) multilingue

    (Français, Anglais, Arabe, Tunisien).
    """
    start_time = perf_counter()
    req_id = ensure_request_id(x_request_id)
    token = set_request_id(req_id)

    processor = VoiceRequestProcessor(request.app.state)
    stored: StoredAudio | None = None

    try:
        context = build_chatbot_context_from_metadata(
            {"channel": "transcribe_api"},
            language=language_hint or "fr",
        )
        stt_proc = await processor.process_upload(
            audio_file,
            context=context,
            language_hint=language_hint,
        )
        stored = stt_proc.stored_audio
        timings = dict(stt_proc.timings)
        timings["total_ms"] = round((perf_counter() - start_time) * 1000, 2)

        return ExternalTranscribeResponse(
            success=True,
            transcription=stt_proc.stt.cleaned_text or stt_proc.stt.raw_text or "",
            detected_language=stt_proc.detected_language or "fr",
            confidence=float(stt_proc.stt.language_confidence or 0.0),
            duration_seconds=float(stt_proc.stt.duration_seconds or 0.0),
            timings=timings,
            request_id=req_id,
        )
    finally:
        processor.cleanup(stored)
        reset_request_id(token)


# ─────────────────────────────────────────────────────────────────────────────
# 7. Standalone TTS as a Service: POST /synthesize
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/synthesize", response_model=ExternalSynthesizeResponse)
async def external_copilot_synthesize(
    payload: ExternalSynthesizeRequest,
    request: Request,
    api_key: str = Depends(verify_external_api_key),
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
    settings: Settings = Depends(get_settings),
) -> ExternalSynthesizeResponse:
    """Service de synthèse vocale pure (TTS-as-a-Service) retournant l'URL du fichier audio WAV."""
    start_time = perf_counter()
    req_id = ensure_request_id(x_request_id)
    token = set_request_id(req_id)

    processor = VoiceRequestProcessor(request.app.state)

    try:
        clean_text = payload.text.strip()
        if not clean_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "empty_text", "message": "Le texte à synthétiser ne peut pas être vide."},
            )

        audio_url = await processor.generate_tts(clean_text, language=payload.language or "fr")
        if not audio_url:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "tts_unavailable", "message": "Le moteur de synthèse vocale n'est pas disponible."},
            )

        duration_ms = round((perf_counter() - start_time) * 1000, 2)

        return ExternalSynthesizeResponse(
            success=True,
            audio_url=audio_url,
            language=payload.language or "fr",
            timings={"tts_generation_ms": duration_ms, "total_ms": duration_ms},
            request_id=req_id,
        )
    finally:
        reset_request_id(token)
