from __future__ import annotations

import asyncio
import logging
import subprocess
import shutil
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from agents.router import AgentRouter
from config import Settings, get_settings
from core.action_guard import is_mutating_intent
from core.decision_engine import DecisionEngine
from core.entity_extractor import extract_entities
from core.executor import TaskExecutor
from core.intent_engine import detect_intent
from core.rag_guard import LocalRagEngine
from core.workflow_engine import WorkflowEngine
from memory.session import SessionStore
from tools.api_client import ToolResult
from tools.hr_tools import HRTools
from voice.audio_conversion import convert_to_wav
from voice.stt import AudioConversionError, SpeechToTextService, VoiceProcessingResult, is_valid_audio
from voice.tts import TextToSpeechService
from app.api.chat_v2 import router as chat_v2_router
from app.api.health_v2 import router as health_v2_router
from app.api.voice_v2 import router as voice_v2_router
from app.core.copilot_engine import configure_copilot_engine, process_copilot_message
from app.nlp.language_detector import detect_language as detect_response_language
from app.observability.decorators import trace_ai_step
from app.observability.braintrust_client import flush_braintrust, init_braintrust
from app.observability.request_context import ensure_request_id, reset_request_id, set_request_id
from app.observability.tracing import log_event, start_span

logger = logging.getLogger(__name__)
settings = get_settings()
NO_SPEECH_MESSAGE = "Je n'ai rien entendu."
VOICE_RETRY_MESSAGE = "Je n'ai pas bien compris. Pouvez-vous repeter ?"
AUDIO_ERROR_MESSAGE = "Erreur audio, veuillez reessayer."
UNCLEAR_AUDIO_MESSAGE = "Je n'ai entendu que du bruit ou une phrase repetee. Reessayez en parlant clairement."
INVALID_AUDIO_MESSAGE = "Audio invalide, veuillez reessayer."
SERVER_ERROR_MESSAGE = "Erreur serveur temporaire."

class SourceItem(BaseModel):
    source: str
    score: float
    excerpt: str


class ToolCallPayload(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ActionResultPayload(BaseModel):
    executed: bool = False
    status: str = "idle"
    tool: str | None = None
    record_id: int | str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class WorkflowStepPayload(BaseModel):
    key: str
    label: str
    status: str
    text: str = ""
    error: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    api: dict[str, Any] = Field(default_factory=dict)


class WorkflowPayload(BaseModel):
    workflow_id: str | None = None
    name: str | None = None
    status: str
    pending_step: str | None = None
    completed_steps: list[str] = Field(default_factory=list)
    can_retry: bool = False
    steps: list[WorkflowStepPayload] = Field(default_factory=list)


class FormFillPayload(BaseModel):
    form: Literal["leave_request", "authorization_request", "telework_request", "document_request"]
    route: str | None = None
    auto_open: bool = False
    mode: str = "draft"
    fields: dict[str, Any] = Field(default_factory=dict)


class ChatRequest(BaseModel):
    user_id: int
    message: str
    role: str | None = None
    access_token: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    success: bool
    status: str = "success"
    type: Literal["chat", "action", "ask", "error", "workflow"] = "chat"
    text: str = ""
    message: str | None = None
    response: str | None = None
    action: str | None = None
    intent: str | None = None
    pending_action: str | None = None
    data: Any = None
    sources: list[SourceItem] = Field(default_factory=list)
    transcription: str | None = None
    error: str | None = None
    entities: dict[str, Any] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    tool_call: ToolCallPayload | None = None
    action_result: ActionResultPayload | None = None
    form_fill: FormFillPayload | None = None
    workflow: WorkflowPayload | None = None
    steps: list[WorkflowStepPayload] = Field(default_factory=list)
    audio_url: str | None = None
    stream_state: str | None = None

    def model_post_init(self, __context: Any) -> None:
        base_text = self.text or self.message or self.response or ""
        self.text = base_text
        if self.message is None:
            self.message = base_text
        if self.response is None:
            self.response = base_text


class AudioStreamProgress(BaseModel):
    success: bool = True
    session_id: str | None = None
    final: bool = False
    partial: str = ""
    text: str = ""
    message: str | None = None
    response: str | None = None
    error: str | None = None
    stream_state: str | None = None
    status: str | None = None
    audio_url: str | None = None
    audio_duration: float | None = None
    detected_volume: float | None = None
    total_bytes: int | None = None
    retryable: bool | None = None


class HistoryMessage(BaseModel):
    user_id: int
    sender: str
    message: str
    timestamp: str


class HistoryResponse(BaseModel):
    success: bool
    items: list[HistoryMessage] = Field(default_factory=list)


class TTSRequest(BaseModel):
    text: str
    language: str | None = None


class TTSResponse(BaseModel):
    success: bool
    audio_url: str
    filename: str


class HealthResponse(BaseModel):
    success: bool
    status: str
    app_name: str
    environment: str
    backend_base_url: str
    rag_documents: int
    tts_enabled: bool


class ErrorResponse(BaseModel):
    success: bool = False
    status: Literal["error"] = "error"
    text: str = ""
    message: str | None = None
    response: str | None = None
    error: str
    details: dict[str, Any] = Field(default_factory=dict)

    def model_post_init(self, __context: Any) -> None:
        base_text = self.text or self.message or self.response or self.error
        self.text = base_text
        if self.message is None:
            self.message = base_text
        if self.response is None:
            self.response = base_text


@dataclass
class AudioStreamSession:
    session_id: str
    user_id: int
    role: str
    access_token: str | None
    directory: Path
    stream_path: Path
    request_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    final_result: dict[str, Any] | None = None
    stream_state: str = "listening"
    chunk_count: int = 0
    total_bytes: int = 0
    chunk_paths: list[Path] = field(default_factory=list)
    merged_path: Path | None = None
    wav_path: Path | None = None

    def __post_init__(self) -> None:
        self.detected_volume = 0.0
        self.last_chunk_payload = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    session_store = SessionStore(max_messages=settings.memory_size)
    decision_engine = DecisionEngine(settings, session_store)
    rag_engine = LocalRagEngine(settings)
    hr_tools = HRTools(settings)
    workflow_engine = WorkflowEngine(settings, session_store, hr_tools)
    task_executor = TaskExecutor(settings, session_store, hr_tools)
    stt_service = SpeechToTextService(settings)
    tts_service = TextToSpeechService(settings)
    agent_router = AgentRouter(
        settings=settings,
        session_store=session_store,
        decision_engine=decision_engine,
        rag_engine=rag_engine,
    )

    app.state.settings = settings
    app.state.session_store = session_store
    app.state.decision_engine = decision_engine
    app.state.rag_engine = rag_engine
    app.state.hr_tools = hr_tools
    app.state.workflow_engine = workflow_engine
    app.state.task_executor = task_executor
    app.state.stt_service = stt_service
    app.state.tts_service = tts_service
    app.state.agent_router = agent_router
    app.state.audio_stream_sessions = {}
    app.state.completed_audio_streams = {}
    app.state.legacy_process_chat = _process_chat
    configure_copilot_engine(app.state, legacy_handler=_process_chat)
    init_braintrust()

    try:
        yield
    finally:
        flush_braintrust()
        await hr_tools.aclose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.mount("/audio/files", StaticFiles(directory=settings.generated_audio_dir), name="audio-files")
app.mount("/document/files", StaticFiles(directory=settings.generated_docs_dir), name="document-files")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(chat_v2_router)
app.include_router(health_v2_router)
app.include_router(voice_v2_router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_, exc: RequestValidationError) -> JSONResponse:
    payload = ErrorResponse(
        error="validation_error",
        message="Validation error",
        details={"errors": exc.errors()},
    )
    return JSONResponse(status_code=422, content=payload.model_dump(mode="json"))


@app.exception_handler(Exception)
async def generic_exception_handler(_, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception: %s", exc)
    payload = ErrorResponse(
        error="ai_service_unavailable",
        message="Le service AI est temporairement indisponible.",
    )
    return JSONResponse(status_code=500, content=payload.model_dump(mode="json"))


def _extract_access_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        return token or None
    return authorization.strip() or None


def _clean_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _clean_json(item) for key, item in value.items() if item not in (None, "", [], {})}
    if isinstance(value, list):
        return [_clean_json(item) for item in value if item not in (None, "", [], {})]
    return value


def _is_blank_text(value: str | None) -> bool:
    return not value or not value.strip()


def _build_form_fill(intent: str, decision: dict[str, Any], *, synced: bool) -> FormFillPayload | None:
    entities = decision.get("entities", {})
    if intent == "CREATE_LEAVE":
        return FormFillPayload(
            form="leave_request",
            route="/app/employee/conges",
            auto_open=not synced,
            mode="synced" if synced else "draft",
            fields={
                "dateDebut": entities.get("start_date"),
                "dateFin": entities.get("end_date"),
                "typeCongeId": entities.get("type_conge_id"),
                "typeLabel": entities.get("type_label"),
                "motif": entities.get("reason"),
            },
        )
    if intent == "CREATE_AUTORISATION":
        return FormFillPayload(
            form="authorization_request",
            route="/app/employee/autorisations",
            auto_open=not synced,
            mode="synced" if synced else "draft",
            fields={
                "date": entities.get("request_date") or entities.get("start_date"),
                "heureDebut": entities.get("time_start"),
                "heureFin": entities.get("time_end"),
                "type": entities.get("authorization_type"),
                "motif": entities.get("reason"),
            },
        )
    if intent == "CREATE_TELEWORK":
        return FormFillPayload(
            form="telework_request",
            route="/app/employee/teletravail",
            auto_open=not synced,
            mode="synced" if synced else "draft",
            fields={
                "dateDebut": entities.get("start_date"),
                "dateFin": entities.get("end_date"),
                "type": entities.get("telework_type"),
                "motif": entities.get("reason"),
            },
        )
    if intent == "REQUEST_DOCUMENT":
        return FormFillPayload(
            form="document_request",
            route="/app/employee/documents",
            auto_open=not synced,
            mode="synced" if synced else "draft",
            fields={
                "type": entities.get("document_type"),
                "motif": entities.get("reason"),
                "moisConcerne": entities.get("month"),
            },
        )
    return None


def _base_data(decision: dict[str, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    data = {
        "intent": decision.get("intent"),
        "entities": _clean_json(decision.get("entities", {})),
        "missing_fields": decision.get("missing_fields", []),
    }
    if extra:
        data.update(extra)
    return data


def _build_chat_response(decision: dict[str, Any], text: str, *, sources: list[SourceItem] | None = None) -> ChatResponse:
    return ChatResponse(
        success=True,
        status=str(decision.get("status") or "success"),
        type="chat",
        text=text,
        action=decision.get("action"),
        intent=decision.get("intent"),
        entities=_clean_json(decision.get("entities", {})),
        sources=sources or [],
        data=_base_data(decision),
    )


def _build_ask_response(decision: dict[str, Any]) -> ChatResponse:
    intent = str(decision.get("intent") or "CHAT")
    return ChatResponse(
        success=True,
        status=str(decision.get("status") or "ask"),
        type="ask",
        text=str(decision.get("message") or "Informations manquantes."),
        action=decision.get("action"),
        intent=intent,
        pending_action=decision.get("action"),
        entities=_clean_json(decision.get("entities", {})),
        missing_fields=list(decision.get("missing_fields", [])),
        tool_call=ToolCallPayload(
            name=str(decision.get("action") or intent.lower()),
            arguments=_clean_json(decision.get("entities", {})),
        ),
        data=_base_data(decision),
    )


def _build_action_response(decision: dict[str, Any], tool_result: ToolResult) -> ChatResponse:
    intent = str(decision.get("intent") or "CHAT")
    safe_statuses = {"already_processed", "already_exists", "already_checked_in"}
    user_safe = tool_result.success or tool_result.status in safe_statuses or tool_result.error == "already_checked_in"
    raw_entities = dict(decision.get("entities", {}))
    result_payload = tool_result.data if isinstance(tool_result.data, dict) else {}
    if "download_url" in result_payload and result_payload["download_url"]:
        raw_entities["download_url"] = result_payload["download_url"]
    action_result = ActionResultPayload(
        executed=bool(tool_result.success),
        status=tool_result.status,
        tool=decision.get("action"),
        record_id=result_payload.get("id"),
        details=_clean_json(tool_result.details),
    )
    return ChatResponse(
        success=user_safe,
        status="success" if user_safe else "error",
        type="action" if tool_result.success else ("chat" if user_safe else "error"),
        text=tool_result.text or str(decision.get("message") or "Action traitee."),
        action=decision.get("action"),
        intent=intent,
        error=None if user_safe else tool_result.error,
        entities=_clean_json(raw_entities),
        tool_call=ToolCallPayload(
            name=str(decision.get("action") or ""),
            arguments=_clean_json(decision.get("entities", {})),
        ),
        action_result=action_result,
        data=_base_data(
            decision,
            {
                "result": _clean_json(tool_result.data),
                "action_result": action_result.model_dump(mode="json"),
            },
        ),
    )


def _build_workflow_response(decision: dict[str, Any], workflow_result: Any) -> ChatResponse:
    intent = str(decision.get("intent") or "CHAT")
    step_payloads = [
        WorkflowStepPayload(
            key=str(step.key),
            label=str(step.label),
            status=str(step.status),
            text=str(step.text or ""),
            error=step.error,
            data=_clean_json(step.data),
            api=_clean_json(step.api),
        )
        for step in getattr(workflow_result, "steps", [])
    ]
    pending_step = next(
        (
            step.key
            for step in getattr(workflow_result, "steps", [])
            if getattr(step, "status", "") not in {"success", "warning"}
        ),
        None,
    )
    workflow_payload = WorkflowPayload(
        workflow_id=str(getattr(workflow_result, "workflow_id", "") or ""),
        name=str(getattr(workflow_result, "workflow_name", "") or ""),
        status=str(getattr(workflow_result, "status", "failed")),
        pending_step=pending_step,
        completed_steps=[
            step.key
            for step in getattr(workflow_result, "steps", [])
            if getattr(step, "status", "") in {"success", "warning"}
        ],
        can_retry=bool(getattr(workflow_result, "can_retry", False)),
        steps=step_payloads,
    )
    action_result_raw = getattr(workflow_result, "action_result", None)
    record_id = None
    details: dict[str, Any] = {}
    if isinstance(action_result_raw, ToolResult):
        payload = action_result_raw.data if isinstance(action_result_raw.data, dict) else {}
        record_id = payload.get("id")
        details = _clean_json(action_result_raw.details)

    raw_entities = dict(decision.get("entities", {}))
    if isinstance(getattr(workflow_result, "data", None), dict):
        if workflow_result.data.get("download_url"):
            raw_entities["download_url"] = workflow_result.data["download_url"]

    action_result = ActionResultPayload(
        executed=bool(getattr(workflow_result, "action_executed", False)),
        status=str(getattr(action_result_raw, "status", getattr(workflow_result, "status", "idle"))),
        tool=decision.get("action"),
        record_id=record_id,
        details=details,
    )

    return ChatResponse(
        success=bool(getattr(workflow_result, "success", False)),
        status="success" if getattr(workflow_result, "success", False) else "failed",
        type="workflow",
        text=str(getattr(workflow_result, "text", "") or decision.get("message") or "Workflow termine."),
        action=decision.get("action"),
        intent=intent,
        error=None if getattr(workflow_result, "success", False) else getattr(workflow_result, "error", None),
        entities=_clean_json(raw_entities),
        tool_call=ToolCallPayload(
            name=str(decision.get("workflow") or decision.get("action") or intent.lower()),
            arguments=_clean_json(decision.get("entities", {})),
        ),
        action_result=action_result,
        workflow=workflow_payload,
        steps=step_payloads,
        data=_base_data(
            decision,
            {
                "result": _clean_json(getattr(workflow_result, "data", {})),
                "workflow": workflow_payload.model_dump(mode="json"),
                "action_result": action_result.model_dump(mode="json"),
            },
        ),
    )


async def _process_chat(request: ChatRequest) -> ChatResponse:
    router: AgentRouter = app.state.agent_router
    decision_engine: DecisionEngine = app.state.decision_engine
    task_executor: TaskExecutor = app.state.task_executor

    resolved_role = router.resolve_role(
        user_id=request.user_id,
        requested_role=request.role,
        access_token=request.access_token,
    )
    agent = router.get_agent(resolved_role)
    decision = agent.prepare(user_id=request.user_id, message=request.message, role=resolved_role)

    if decision.get("type") == "ask":
        response = _build_ask_response(decision)
        agent.remember(request.user_id, response.text)
        return response

    if decision.get("type") == "workflow":
        execution_entities = {
            **dict(decision.get("entities", {})),
            **dict(decision.get("data", {})),
        }
        workflow_result = await task_executor.execute(
            intent=str(decision.get("intent") or ""),
            action=str(decision.get("action") or "") or None,
            entities=execution_entities,
            user_id=request.user_id,
            access_token=request.access_token,
            role=resolved_role,
            resume=bool(decision.get("resume")),
        )
        if workflow_result.action_executed and is_mutating_intent(str(decision.get("intent") or "")):
            action_key = str(dict(decision.get("entities", {})).get("action_key") or "")
            if action_key:
                decision_engine.mark_action_executed(
                    request.user_id,
                    action=str(decision.get("action") or ""),
                    action_key=action_key,
                    intent=str(decision.get("intent") or ""),
                    entities=dict(decision.get("entities", {})),
                )
        response = _build_workflow_response(decision, workflow_result)
        agent.remember(request.user_id, response.text)
        return response

    if decision.get("type") == "action":
        entities = {
            **dict(decision.get("entities", {})),
            **dict(decision.get("data", {})),
        }
        workflow_result = await task_executor.execute(
            intent=str(decision.get("intent") or ""),
            action=str(decision.get("action") or "") or None,
            entities=entities,
            user_id=request.user_id,
            access_token=request.access_token,
            role=resolved_role,
        )
        if workflow_result.action_executed and is_mutating_intent(str(decision.get("intent") or "")):
            action_key = str(entities.get("action_key") or "")
            if action_key:
                decision_engine.mark_action_executed(
                    request.user_id,
                    action=str(decision.get("action") or ""),
                    action_key=action_key,
                    intent=str(decision.get("intent") or ""),
                    entities=entities,
                )
        response = _build_workflow_response(decision, workflow_result)
        agent.remember(request.user_id, response.text)
        return response

    agent_reply = agent.reply(message=request.message, decision=decision)
    response = _build_chat_response(
        decision,
        agent_reply.text,
        sources=[
            SourceItem(source=item.source, score=item.score, excerpt=item.excerpt)
            for item in agent_reply.sources
        ],
    )
    agent.remember(request.user_id, response.text)
    return response


def _resolve_upload_suffix(upload: UploadFile, fallback: str = ".webm") -> str:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix:
        return suffix
    content_type = (upload.content_type or "").lower()
    if "wav" in content_type:
        return ".wav"
    if "ogg" in content_type:
        return ".ogg"
    if "mpeg" in content_type or "mp3" in content_type:
        return ".mp3"
    return fallback


async def _store_uploaded_audio(upload: UploadFile, target_dir: Path, *, stem: str) -> Path:
    payload = await upload.read()
    if not payload:
        raise ValueError("empty_audio")
    target_dir.mkdir(parents=True, exist_ok=True)
    input_path = target_dir / f"{stem}{_resolve_upload_suffix(upload)}"
    input_path.write_bytes(payload)
    logger.info(
        "audio_upload_saved path=%s size_bytes=%s content_type=%s",
        input_path,
        len(payload),
        upload.content_type,
    )
    return input_path


async def _process_uploaded_audio(
    upload: UploadFile,
    *,
    request_id: str,
    stem: str,
) -> tuple[VoiceProcessingResult, Path]:
    stt_service: SpeechToTextService = app.state.stt_service
    work_dir = settings.temp_audio_dir / "uploads" / request_id
    with start_span("voice.audio.store", {"request_id": request_id, "content_type": upload.content_type}):
        input_path = await _store_uploaded_audio(upload, work_dir, stem=stem)
    with start_span("voice.audio.validate", {"request_id": request_id, "path": str(input_path)}):
        log_event("voice.audio.validate", metadata={"request_id": request_id, "status": "stored"})
    with start_span("voice.stt", {"request_id": request_id}):
        result = await stt_service.aprocess(input_path)
    with start_span(
        "voice.cleaner",
        {"request_id": request_id, "status": result.status, "cleaned_empty": not bool(result.cleaned_text)},
    ):
        log_event(
            "voice.cleaner",
            metadata={
                "request_id": request_id,
                "status": result.status,
                "cleaned_empty": not bool(result.cleaned_text),
                "text_length": len(result.cleaned_text or result.raw_text or ""),
            },
        )
    log_event(
        "voice.stt.result",
        output={"status": result.status, "cleaned_empty": not bool(result.cleaned_text)},
        metadata={
            "request_id": request_id,
            "duration_seconds": result.duration_seconds,
            "detected_volume": result.detected_volume,
            "language": settings.stt_language,
            "stt_model": settings.stt_model,
        },
    )
    return result, work_dir


async def _transcribe_uploaded_audio(upload: UploadFile, *, request_id: str, stem: str) -> tuple[str | None, Path]:
    result, work_dir = await _process_uploaded_audio(upload, request_id=request_id, stem=stem)
    text = result.cleaned_text
    return text.strip() if text else None, work_dir


def _audio_error(
    error_code: str = "server_error",
    message: str = SERVER_ERROR_MESSAGE,
    *,
    status: str = "server_error",
    retryable: bool = False,
) -> dict[str, Any]:
    payload = AudioStreamProgress(
        success=False,
        final=True,
        text="",
        partial="",
        message=message,
        response=message,
        error=error_code,
        stream_state="error",
        status=status,
        retryable=retryable,
    ).model_dump(mode="json")
    payload["audio"] = None
    return payload


def _no_speech_payload(
    *,
    session_id: str | None = None,
    audio_duration: float | None = None,
    detected_volume: float | None = None,
    total_bytes: int | None = None,
) -> dict[str, Any]:
    payload = AudioStreamProgress(
        success=True,
        session_id=session_id,
        final=True,
        text="",
        partial="",
        message=NO_SPEECH_MESSAGE,
        response=NO_SPEECH_MESSAGE,
        error=None,
        stream_state="done",
        status="no_speech",
        audio_duration=audio_duration,
        detected_volume=detected_volume,
        total_bytes=total_bytes,
        retryable=True,
    ).model_dump(mode="json")
    payload["audio"] = None
    return payload


def _unclear_audio_payload(
    *,
    session_id: str | None = None,
    audio_duration: float | None = None,
    detected_volume: float | None = None,
    total_bytes: int | None = None,
) -> dict[str, Any]:
    payload = AudioStreamProgress(
        success=True,
        session_id=session_id,
        final=True,
        text="",
        partial="",
        message=UNCLEAR_AUDIO_MESSAGE,
        response=UNCLEAR_AUDIO_MESSAGE,
        error=None,
        stream_state="done",
        status="unclear_audio",
        audio_duration=audio_duration,
        detected_volume=detected_volume,
        total_bytes=total_bytes,
        retryable=True,
    ).model_dump(mode="json")
    payload["audio"] = None
    return payload


def _invalid_audio_payload(
    *,
    session_id: str | None = None,
    total_bytes: int | None = None,
) -> dict[str, Any]:
    payload = AudioStreamProgress(
        success=False,
        session_id=session_id,
        final=True,
        text="",
        partial="",
        message=INVALID_AUDIO_MESSAGE,
        response=INVALID_AUDIO_MESSAGE,
        error="invalid_audio",
        stream_state="done",
        status="invalid_audio",
        total_bytes=total_bytes,
        retryable=True,
    ).model_dump(mode="json")
    payload["audio"] = None
    return payload


def _voice_soft_chat_response(
    *,
    status: str,
    message: str,
    transcription: str | None = None,
) -> ChatResponse:
    return ChatResponse(
        success=True,
        status=status,
        type="chat",
        text=message,
        message=message,
        response=message,
        transcription=transcription,
    )


def _coerce_copilot_response(response: Any, *, transcription: str | None = None) -> ChatResponse:
    if isinstance(response, ChatResponse):
        if transcription:
            response.transcription = transcription
        return response

    payload = response.model_dump(mode="json") if hasattr(response, "model_dump") else getattr(response, "__dict__", {})
    if not isinstance(payload, dict):
        payload = {"text": str(response)}

    text = str(payload.get("text") or payload.get("message") or payload.get("response") or "")
    response_type = str(payload.get("type") or "chat")
    chat_type = response_type if response_type in {"chat", "action", "ask", "error", "workflow"} else "ask"
    status = "error" if response_type == "error" else ("confirm" if response_type == "confirm_action" else "success")

    return ChatResponse(
        success=response_type != "error",
        status=status,
        type=chat_type,  # preserve unsupported V2 types in data while keeping legacy response_model valid
        text=text,
        message=text,
        response=text,
        intent=payload.get("intent"),
        data=payload,
        transcription=transcription,
        error=payload.get("error") if response_type == "error" else None,
        entities=_clean_json(payload.get("extracted_entities") or payload.get("entities") or {}),
    )


async def _route_voice_transcript(
    *,
    transcription: str,
    user_id: int,
    role: str | None,
    access_token: str | None,
    language: str | None = None,
    request_id: str | None = None,
) -> ChatResponse:
    normalized_text = transcription.strip()
    with start_span("voice.agent_route", {"user_id": user_id, "role": role, "request_id": request_id}):
        detected_intent = detect_intent(normalized_text, role=role)
        entities = extract_entities(normalized_text, intent=detected_intent, role=role)
    logger.info(
        "voice_route user_id=%s role=%s intent=%s entities=%s transcription=%r",
        user_id,
        role,
        detected_intent,
        entities,
        normalized_text,
    )

    copilot_response = await process_copilot_message(
        user_id,
        normalized_text,
        access_token,
        role,
        channel="voice",
        metadata={
            "app_state": app.state,
            "voice": True,
            "language": language,
            "request_id": request_id,
            "detected_intent": detected_intent,
            "entities": entities,
            "allow_legacy_without_token": True,
        },
    )
    response = _coerce_copilot_response(copilot_response, transcription=normalized_text)
    response.transcription = normalized_text
    if not response.intent:
        response.intent = detected_intent
    if not response.entities:
        response.entities = _clean_json(entities)
    if isinstance(response.data, dict):
        response.data = {
            **response.data,
            "voice_intent": detected_intent,
            "voice_entities": _clean_json(entities),
        }
    return response


def _get_stream_sessions() -> dict[str, AudioStreamSession]:
    sessions = getattr(app.state, "audio_stream_sessions", None)
    if sessions is None:
        sessions = {}
        app.state.audio_stream_sessions = sessions
    return sessions


def _get_completed_streams() -> dict[str, dict[str, Any]]:
    completed = getattr(app.state, "completed_audio_streams", None)
    if completed is None:
        completed = {}
        app.state.completed_audio_streams = completed
    return completed


def _chunk_sort_key(path: Path) -> int:
    stem = path.stem
    if "_" not in stem:
        return 0
    raw_index = stem.split("_")[-1]
    return int(raw_index) if raw_index.isdigit() else 0


def _looks_like_invalid_audio_error(details: str | None) -> bool:
    if not details:
        return False
    lowered = details.lower()
    invalid_markers = (
        "ebml header parsing failed",
        "invalid data found when processing input",
        "detected only with low score",
        "matroska,webm",
        "could not find codec parameters",
        "moov atom not found",
        "invalid argument",
    )
    return any(marker in lowered for marker in invalid_markers)


def _resolve_ffprobe_binary(ffmpeg_binary: str) -> str | None:
    ffprobe_binary = shutil.which("ffprobe")
    if ffprobe_binary:
        return ffprobe_binary

    ffmpeg_path = shutil.which(ffmpeg_binary)
    if not ffmpeg_path:
        return None

    ffmpeg_resolved = Path(ffmpeg_path)
    probe_name = "ffprobe.exe" if ffmpeg_resolved.suffix.lower() == ".exe" else "ffprobe"
    probe_candidate = ffmpeg_resolved.with_name(probe_name)
    return str(probe_candidate) if probe_candidate.exists() else None


def _validate_stream_audio(stream_path: Path) -> tuple[bool, str | None]:
    ffprobe_binary = _resolve_ffprobe_binary(settings.ffmpeg_binary)
    if not ffprobe_binary:
        return True, None

    result = subprocess.run(
        [
            ffprobe_binary,
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(stream_path),
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[-500:]
        return False, detail or "ffprobe_failed"

    codec_name = (result.stdout or "").strip().lower()
    if not codec_name:
        return False, "ffprobe_missing_audio_codec"
    return True, None


def merge_chunks(session_id: str) -> Path | None:
    session = _get_stream_sessions().get(session_id)
    if session is None:
        return None

    chunk_files = sorted(
        [path for path in (session.chunk_paths or list(session.directory.glob("chunk_*.webm"))) if path.is_file()],
        key=_chunk_sort_key,
    )
    if not chunk_files:
        return session.stream_path if session.stream_path.exists() else None

    merged_path = session.directory / "recording.webm"
    with merged_path.open("wb") as merged:
        for chunk_path in chunk_files:
            merged.write(chunk_path.read_bytes())
    session.stream_path = merged_path
    session.merged_path = merged_path
    return merged_path


def convert_stream_to_wav(session_id: str, merged_path: Path) -> Path:
    session = _get_stream_sessions().get(session_id)
    if session is None:
        raise AudioConversionError("session_not_found")

    wav_path = session.directory / "recording.wav"
    try:
        convert_to_wav(
            merged_path,
            wav_path,
            ffmpeg_binary=settings.ffmpeg_binary,
        )
    except Exception as exc:  # noqa: BLE001
        detail = str(exc)
        if _looks_like_invalid_audio_error(detail):
            logger.warning(
                "audio_stream_invalid_audio session_id=%s merged_path=%s detail=%s",
                session_id,
                merged_path,
                detail,
            )
            raise AudioConversionError("invalid_audio") from exc
        logger.exception(
            "audio_stream_conversion_failed session_id=%s merged_path=%s wav_path=%s error=%s",
            session_id,
            merged_path,
            wav_path,
            exc,
        )
        raise AudioConversionError("conversion_failed") from exc

    session.wav_path = wav_path
    return wav_path


def _complete_stream_session(session: AudioStreamSession, payload: dict[str, Any]) -> dict[str, Any]:
    payload["request_id"] = session.request_id
    payload["requestId"] = session.request_id
    session.stream_state = "done"
    session.final_result = payload
    _get_completed_streams()[session.session_id] = payload
    _get_stream_sessions().pop(session.session_id, None)
    shutil.rmtree(session.directory, ignore_errors=True)
    return payload


def _get_or_create_audio_stream_session(
    session_id: str | None,
    *,
    request_id: str,
    user_id: int,
    role: str,
    access_token: str | None,
) -> AudioStreamSession:
    sessions = _get_stream_sessions()
    if session_id and session_id in sessions:
        session = sessions[session_id]
        session.request_id = request_id
        return session
    resolved_session_id = uuid.uuid4().hex
    if session_id and session_id.strip():
        cleaned = "".join(char for char in session_id.strip() if char.isalnum() or char in {"-", "_"})
        if cleaned:
            resolved_session_id = cleaned[:80]
    directory = settings.temp_audio_dir / "streams" / resolved_session_id
    directory.mkdir(parents=True, exist_ok=True)
    session = AudioStreamSession(
        session_id=resolved_session_id,
        request_id=request_id,
        user_id=user_id,
        role=role,
        access_token=access_token,
        directory=directory,
        stream_path=directory / "recording.webm",
    )
    sessions[resolved_session_id] = session
    return session


async def _append_stream_chunk(
    session: AudioStreamSession,
    upload: UploadFile,
    *,
    detected_volume: float | None = None,
    chunk_index: int | None = None,
) -> str | None:
    """Append one uploaded chunk to the session.

    Returns None; partial transcription is removed (see Task 4). The
    per-chunk volume gate that previously interpreted WebM bytes as
    int16 PCM has been deleted — the frontend decides when to finalize.
    """
    payload = await upload.read()
    if not payload:
        return None

    if session.last_chunk_payload and payload == session.last_chunk_payload:
        logger.info(
            "audio_chunk_skipped session_id=%s reason=duplicate_chunk size=%s",
            session.session_id,
            len(payload),
        )
        return None

    if len(payload) < settings.voice_min_chunk_bytes:
        logger.info(
            "audio_chunk_skipped session_id=%s reason=chunk_too_small size=%s threshold=%s",
            session.session_id,
            len(payload),
            settings.voice_min_chunk_bytes,
        )
        session.last_chunk_payload = payload
        return None

    resolved_chunk_index = chunk_index if chunk_index is not None else session.chunk_count + 1
    chunk_path = session.directory / f"chunk_{resolved_chunk_index:04d}.webm"
    chunk_path.write_bytes(payload)
    session.chunk_paths.append(chunk_path)
    session.chunk_count = max(session.chunk_count, resolved_chunk_index)
    session.total_bytes += len(payload)
    session.last_chunk_payload = payload
    logger.info(
        "audio_chunk_received session_id=%s chunk_index=%s size=%s total_bytes=%s frontend_volume=%s",
        session.session_id,
        resolved_chunk_index,
        len(payload),
        session.total_bytes,
        f"{detected_volume:.3f}" if detected_volume is not None else "n/a",
    )
    return None


async def _maybe_generate_tts(text: str, language: str | None = None) -> str | None:
    tts_service: TextToSpeechService = app.state.tts_service
    resolved_language = language or detect_response_language(text)
    with start_span(
        "voice.tts",
        {"text_length": len(text or ""), "language": resolved_language, "tts_model": settings.tts_model},
    ):
        audio_path = await tts_service.asynthesize(text, resolved_language)
    if not audio_path:
        return None
    return f"{settings.public_base_url}/audio/files/{Path(audio_path).name}"


async def _finalize_audio_stream(session_id: str) -> dict[str, Any]:
    session = _get_stream_sessions().get(session_id)
    if session is None:
        completed = _get_completed_streams().get(session_id)
        if completed is not None:
            return completed
        return _audio_error("session_not_found")

    if session.final_result is not None:
        return session.final_result

    async with session.lock:
        if session.final_result is not None:
            return session.final_result

        stt_service: SpeechToTextService = app.state.stt_service
        session.stream_state = "processing"

        with start_span("voice.stream.merge_chunks", {"session_id": session.session_id, "chunk_count": session.chunk_count}):
            merged_path = merge_chunks(session.session_id)
        if merged_path is None or not merged_path.exists() or session.total_bytes <= 0:
            payload = _no_speech_payload(
                session_id=session.session_id,
                detected_volume=session.detected_volume,
                total_bytes=session.total_bytes,
            )
            return _complete_stream_session(session, payload)

        with start_span("voice.stream.ffprobe", {"session_id": session.session_id, "total_bytes": session.total_bytes}):
            is_valid_stream, probe_detail = _validate_stream_audio(merged_path)
        if not is_valid_stream:
            logger.warning(
                "audio_stream_invalid_probe session_id=%s merged_path=%s detail=%s",
                session.session_id,
                merged_path,
                probe_detail,
            )
            payload = _invalid_audio_payload(
                session_id=session.session_id,
                total_bytes=session.total_bytes,
            )
            return _complete_stream_session(session, payload)

        try:
            with start_span("voice.audio_convert", {"session_id": session.session_id, "total_bytes": session.total_bytes}):
                wav_path = convert_stream_to_wav(session.session_id, merged_path)
            logger.info(
                "audio_stream_merged session_id=%s merged_path=%s wav_path=%s chunk_count=%s total_bytes=%s",
                session.session_id,
                merged_path,
                wav_path,
                session.chunk_count,
                session.total_bytes,
            )
        except AudioConversionError as exc:
            error_code = str(exc)
            if error_code == "invalid_audio":
                payload = _invalid_audio_payload(
                    session_id=session.session_id,
                    total_bytes=session.total_bytes,
                )
            else:
                payload = _audio_error(
                    "server_error",
                    SERVER_ERROR_MESSAGE,
                    status="server_error",
                )
                payload["session_id"] = session.session_id
            return _complete_stream_session(session, payload)

        if not is_valid_audio(merged_path, settings.voice_min_input_bytes):
            logger.info(
                "audio_stream_rejected session_id=%s total_bytes=%s detected_volume=%.3f reason=file_too_small",
                session.session_id,
                session.total_bytes,
                session.detected_volume,
            )
            payload = _no_speech_payload(
                session_id=session.session_id,
                detected_volume=session.detected_volume,
                total_bytes=session.total_bytes,
            )
            return _complete_stream_session(session, payload)

        with start_span("voice.stt", {"session_id": session.session_id, "stt_model": settings.stt_model, "language": settings.stt_language}):
            stt_result = await stt_service.aprocess(merged_path)
        session.detected_volume = max(session.detected_volume, stt_result.detected_volume)

        if stt_result.status == "no_input":
            logger.info(
                "audio_stream_no_input session_id=%s total_bytes=%s detected_volume=%.3f duration_seconds=%.3f error=%s",
                session.session_id,
                session.total_bytes,
                session.detected_volume,
                stt_result.duration_seconds,
                stt_result.error,
            )
            payload = _no_speech_payload(
                session_id=session.session_id,
                audio_duration=stt_result.duration_seconds,
                detected_volume=session.detected_volume,
                total_bytes=session.total_bytes,
            )
            return _complete_stream_session(session, payload)
        if stt_result.status == "retry":
            logger.info(
                "audio_stream_retry session_id=%s total_bytes=%s detected_volume=%.3f raw=%r",
                session.session_id,
                session.total_bytes,
                session.detected_volume,
                stt_result.raw_text,
            )
            payload = _unclear_audio_payload(
                session_id=session.session_id,
                audio_duration=stt_result.duration_seconds,
                detected_volume=session.detected_volume,
                total_bytes=session.total_bytes,
            )
            return _complete_stream_session(session, payload)
        if stt_result.status != "success" or _is_blank_text(stt_result.cleaned_text):
            logger.warning(
                "audio_stream_error session_id=%s total_bytes=%s detected_volume=%.3f status=%s error=%s",
                session.session_id,
                session.total_bytes,
                session.detected_volume,
                stt_result.status,
                stt_result.error,
            )
            payload = _audio_error(
                "server_error",
                SERVER_ERROR_MESSAGE,
                status="server_error",
            )
            payload["session_id"] = session.session_id
            return _complete_stream_session(session, payload)

        transcription = stt_result.cleaned_text.strip()
        logger.info(
            "audio_stream_transcription session_id=%s total_bytes=%s detected_volume=%.3f duration_seconds=%.3f transcription=%r",
            session.session_id,
            session.total_bytes,
            session.detected_volume,
            stt_result.duration_seconds,
            transcription,
        )

        response = await _route_voice_transcript(
            transcription=transcription,
            user_id=session.user_id,
            role=session.role,
            access_token=session.access_token,
            language=stt_result.language,
            request_id=session.request_id,
        )
        audio_url = await _maybe_generate_tts(response.text, language=stt_result.language) if response.text else None
        if audio_url:
            response.audio_url = audio_url
            if isinstance(response.data, dict):
                response.data = {**response.data, "audio_url": audio_url}

        payload = response.model_dump(mode="json")
        payload.update(
            {
                "session_id": session.session_id,
                "final": True,
                "partial": transcription,
                "transcription": transcription,
                "audio_url": audio_url,
                "audio": audio_url,
                "stream_state": "done",
                "audio_duration": stt_result.duration_seconds,
                "language": stt_result.language,
                "language_confidence": stt_result.language_confidence,
                "detected_volume": session.detected_volume,
                "total_bytes": session.total_bytes,
            }
        )
        return _complete_stream_session(session, payload)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    rag_engine: LocalRagEngine = app.state.rag_engine
    return HealthResponse(
        success=True,
        status="ok",
        app_name=settings.app_name,
        environment=settings.app_env,
        backend_base_url=settings.backend_base_url,
        rag_documents=rag_engine.document_count(),
        tts_enabled=settings.tts_enabled,
    )


@app.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, authorization: str | None = Header(None)) -> ChatResponse:
    access_token = payload.access_token or _extract_access_token(authorization)
    return await _process_chat(
        ChatRequest(
            user_id=payload.user_id,
            message=payload.message,
            role=payload.role,
            access_token=access_token,
            metadata=payload.metadata,
        )
    )


@app.post("/audio")
@trace_ai_step("ai.audio.request")
async def audio(file: UploadFile = File(...)) -> dict[str, Any]:
    request_id = uuid.uuid4().hex
    work_dir: Path | None = None
    try:
        result, work_dir = await _process_uploaded_audio(file, request_id=request_id, stem="input")
        if result.status == "no_input":
            return {
                "success": True,
                "status": "no_input",
                "text": "",
                "message": NO_SPEECH_MESSAGE,
            }
        if result.status == "retry":
            return {
                "success": True,
                "status": "retry",
                "text": "",
                "message": VOICE_RETRY_MESSAGE,
            }
        if result.status != "success" or _is_blank_text(result.cleaned_text):
            return {"success": False, "error": result.error or "audio_processing_failed", "message": AUDIO_ERROR_MESSAGE}
        return {"success": True, "text": result.cleaned_text.strip()}
    except ValueError:
        return {
            "success": True,
            "status": "no_input",
            "text": "",
            "message": NO_SPEECH_MESSAGE,
        }
    except AudioConversionError:
        return {"success": False, "error": "conversion_failed", "message": AUDIO_ERROR_MESSAGE}
    finally:
        if work_dir is not None:
            shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/voice", response_model=ChatResponse)
@trace_ai_step("ai.voice.request")
async def voice(
    audio_file: UploadFile = File(...),
    user_id: int = Form(...),
    access_token: str | None = Form(None),
    role: str | None = Form(None),
    generate_tts: bool = Form(True),
    request_id: str | None = Form(None),
    authorization: str | None = Header(None),
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
) -> ChatResponse:
    resolved_access_token = access_token or _extract_access_token(authorization)
    resolved_request_id = ensure_request_id(x_request_id or request_id)
    request_token = set_request_id(resolved_request_id)
    work_dir: Path | None = None
    try:
        result, work_dir = await _process_uploaded_audio(
            audio_file,
            request_id=resolved_request_id,
            stem=f"voice_{user_id}",
        )
        if result.status == "no_input":
            return _voice_soft_chat_response(
                status="no_input",
                message=NO_SPEECH_MESSAGE,
            )
        if result.status == "retry":
            return _voice_soft_chat_response(
                status="retry",
                message=VOICE_RETRY_MESSAGE,
                transcription=(result.raw_text or "").strip() or None,
            )
        if result.status != "success" or _is_blank_text(result.cleaned_text):
            return ChatResponse(
                success=False,
                status="error",
                type="error",
                text=AUDIO_ERROR_MESSAGE,
                error=result.error or "audio_processing_failed",
            )

        transcription = result.cleaned_text.strip()
        response = await _route_voice_transcript(
            transcription=transcription,
            user_id=user_id,
            role=role,
            access_token=resolved_access_token,
            language=result.language,
            request_id=resolved_request_id,
        )
        response.data = {**(response.data or {}), "request_id": resolved_request_id, "requestId": resolved_request_id}
        response.transcription = transcription
        if generate_tts and response.text:
            audio_url = await _maybe_generate_tts(response.text, language=result.language)
            if audio_url:
                response.audio_url = audio_url
                if isinstance(response.data, dict):
                    response.data = {**response.data, "audio_url": audio_url}
        return response
    except ValueError:
        return _voice_soft_chat_response(status="no_input", message=NO_SPEECH_MESSAGE)
    except AudioConversionError as exc:
        if str(exc) == "invalid_audio":
            return ChatResponse(
                success=False,
                status="invalid_audio",
                type="error",
                text=INVALID_AUDIO_MESSAGE,
                message=INVALID_AUDIO_MESSAGE,
                response=INVALID_AUDIO_MESSAGE,
                error="invalid_audio",
            )
        return ChatResponse(
            success=False,
            status="server_error",
            type="error",
            text=SERVER_ERROR_MESSAGE,
            message=SERVER_ERROR_MESSAGE,
            response=SERVER_ERROR_MESSAGE,
            error="server_error",
        )
    finally:
        reset_request_id(request_token)
        if work_dir is not None:
            shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/audio-stream")
@trace_ai_step("ai.audio_stream.request")
async def audio_stream(
    file: UploadFile | None = File(None),
    user_id: int | None = Form(None),
    session_id: str | None = Form(None),
    request_id: str | None = Form(None),
    access_token: str | None = Form(None),
    role: str | None = Form(None),
    is_final: bool = Form(False),
    chunk_index: int | None = Form(None),
    finalize: bool = Form(False),
    end: bool = Form(False),
    detected_volume: float | None = Form(None),
    authorization: str | None = Header(None),
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
) -> dict[str, Any]:
    resolved_request_id = ensure_request_id(x_request_id or request_id)
    request_token = set_request_id(resolved_request_id)
    resolved_access_token = access_token or _extract_access_token(authorization)
    sessions = _get_stream_sessions()
    if session_id and session_id in sessions:
        session = sessions[session_id]
    else:
        if user_id is None:
            raise HTTPException(status_code=400, detail="user_id_required")
        router: AgentRouter = app.state.agent_router
        resolved_role = router.resolve_role(
            user_id=user_id,
            requested_role=role,
            access_token=resolved_access_token,
        )
        session = _get_or_create_audio_stream_session(
            session_id,
            request_id=resolved_request_id,
            user_id=user_id,
            role=resolved_role,
            access_token=resolved_access_token,
        )

    if resolved_access_token and not session.access_token:
        session.access_token = resolved_access_token
    if role and role.strip():
        session.role = role.strip().upper()

    try:
        should_finalize = bool(is_final or finalize or end)
        if file is not None:
            log_event(
                "voice.stream.chunk_received",
                metadata={
                    "session_id": session.session_id,
                    "chunk_index": chunk_index,
                    "is_final": should_finalize,
                    "content_type": file.content_type,
                    "request_id": resolved_request_id,
                },
            )
            await _append_stream_chunk(
                session,
                file,
                detected_volume=detected_volume,
                chunk_index=chunk_index,
            )

        if (chunk_index is not None and chunk_index > 100) or session.chunk_count > 100:
            logger.info(
                "audio_stream_force_finalize session_id=%s chunk_index=%s chunk_count=%s",
                session.session_id,
                chunk_index,
                session.chunk_count,
            )
            should_finalize = True

        if should_finalize:
            return await _finalize_audio_stream(session.session_id)

        progress_payload = AudioStreamProgress(
            success=True,
            session_id=session.session_id,
            final=False,
            partial="",
            text="",
            message="listening",
            response="listening",
            stream_state=session.stream_state,
            status="listening",
            total_bytes=session.total_bytes,
        ).model_dump(mode="json")
        progress_payload["request_id"] = resolved_request_id
        progress_payload["requestId"] = resolved_request_id
        return progress_payload
    except ValueError:
        payload = _no_speech_payload(
            session_id=session.session_id,
            detected_volume=session.detected_volume,
            total_bytes=session.total_bytes,
        )
        payload["session_id"] = session.session_id
        payload["request_id"] = resolved_request_id
        payload["requestId"] = resolved_request_id
        return payload
    except AudioConversionError as exc:
        if str(exc) == "invalid_audio":
            payload = _invalid_audio_payload(
                session_id=session.session_id,
                total_bytes=session.total_bytes,
            )
            payload["request_id"] = resolved_request_id
            payload["requestId"] = resolved_request_id
            return payload
        payload = _audio_error(
            "server_error",
            SERVER_ERROR_MESSAGE,
            status="server_error",
        )
        payload["session_id"] = session.session_id
        payload["request_id"] = resolved_request_id
        payload["requestId"] = resolved_request_id
        return payload
    finally:
        reset_request_id(request_token)


@app.get("/audio-stream/result/{session_id}")
async def audio_stream_result(session_id: str) -> dict[str, Any]:
    completed = _get_completed_streams().get(session_id)
    if completed is not None:
        return completed
    session = _get_stream_sessions().get(session_id)
    if session is None:
        return _audio_error("session_not_found")
    if session.final_result is not None:
        return session.final_result
    return AudioStreamProgress(
        success=True,
        session_id=session.session_id,
        final=False,
        partial="",
        text="",
        message="listening",
        response="listening",
        stream_state=session.stream_state,
        status="listening",
    ).model_dump(mode="json")


@app.get("/chat/history/{user_id}", response_model=HistoryResponse)
async def chat_history(user_id: int) -> HistoryResponse:
    session_store: SessionStore = app.state.session_store
    items = [
        HistoryMessage(
            user_id=user_id,
            sender="user" if message.role == "user" else "assistant",
            message=message.content,
            timestamp=message.timestamp.isoformat(),
        )
        for message in session_store.get_history(user_id)
    ]
    return HistoryResponse(success=True, items=items)


@app.post("/tts", response_model=TTSResponse)
@trace_ai_step("ai.tts.request")
async def tts(payload: TTSRequest) -> TTSResponse:
    audio_url = await _maybe_generate_tts(payload.text, language=payload.language)
    if not audio_url:
        raise HTTPException(status_code=503, detail="tts_unavailable")
    return TTSResponse(success=True, audio_url=audio_url, filename=Path(audio_url).name)
