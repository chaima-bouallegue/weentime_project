from __future__ import annotations

import importlib.util
import logging
import random
from threading import RLock
from typing import Any

from config import get_settings

from .redaction import redact_value
from .request_context import get_request_id

logger = logging.getLogger(__name__)

_lock = RLock()
_braintrust_module: Any | None = None
_braintrust_logger: Any | None = None
_init_attempted = False
_sdk_available: bool | None = None
_last_error: str | None = None
_last_test_event_status = "not_run"


def is_braintrust_configured() -> bool:
    settings = get_settings()
    return bool(settings.braintrust_enabled and settings.braintrust_api_key)


def is_braintrust_enabled() -> bool:
    return get_braintrust_logger() is not None


def get_braintrust_logger() -> Any | None:
    return init_braintrust()


def init_braintrust() -> Any | None:
    global _braintrust_logger, _braintrust_module, _init_attempted, _sdk_available, _last_error
    settings = get_settings()
    with _lock:
        if _init_attempted:
            return _braintrust_logger
        _init_attempted = True

        _sdk_available = importlib.util.find_spec("braintrust") is not None
        logger.info("Braintrust enabled: %s", str(bool(settings.braintrust_enabled)).lower())
        logger.info("Braintrust project id: %s", settings.braintrust_project_id or "not_set")
        logger.info("Braintrust project: %s", settings.braintrust_project_name)
        logger.info("Braintrust env: %s", settings.braintrust_env)
        logger.info("Braintrust SDK available: %s", str(bool(_sdk_available)).lower())

        if not settings.braintrust_enabled:
            _last_error = "disabled_by_env"
            logger.info("Braintrust tracing ready: false")
            return None
        if not settings.braintrust_api_key:
            _last_error = "missing_api_key"
            logger.warning("Braintrust tracing disabled: BRAINTRUST_API_KEY is not set.")
            logger.info("Braintrust tracing ready: false")
            return None
        braintrust = _load_braintrust_sdk()
        if braintrust is None:
            logger.info("Braintrust tracing ready: false")
            return None

        try:
            _braintrust_logger = braintrust.init_logger(
                project=settings.braintrust_project_name,
                project_id=settings.braintrust_project_id or None,
                api_key=settings.braintrust_api_key,
                async_flush=True,
            )
            _last_error = None
            logger.info("Braintrust logger initialized.")
            logger.info("Braintrust tracing ready: true")
            return _braintrust_logger
        except Exception as exc:  # noqa: BLE001
            _braintrust_logger = None
            _last_error = f"init_failed: {exc}"
            logger.warning("Braintrust initialization failed; tracing disabled: %s", exc)
            logger.info("Braintrust tracing ready: false")
            return None


def _load_braintrust_sdk() -> Any | None:
    global _braintrust_module, _sdk_available, _last_error
    if _braintrust_module is not None:
        _sdk_available = True
        return _braintrust_module
    try:
        import braintrust  # type: ignore
    except Exception as exc:  # noqa: BLE001
        _sdk_available = False
        _last_error = f"sdk_import_failed: {exc}"
        logger.warning("Braintrust SDK unavailable; tracing disabled: %s", exc)
        return None
    _braintrust_module = braintrust
    _sdk_available = True
    return braintrust


def flush_braintrust() -> None:
    braintrust_logger = _braintrust_logger
    braintrust_module = _braintrust_module
    try:
        if braintrust_logger is not None and hasattr(braintrust_logger, "flush"):
            braintrust_logger.flush()
        if braintrust_module is not None and hasattr(braintrust_module, "flush"):
            braintrust_module.flush()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Braintrust flush failed: %s", exc)


def send_test_event() -> dict[str, Any]:
    global _last_test_event_status, _last_error
    braintrust_logger = get_braintrust_logger()
    settings = get_settings()
    if braintrust_logger is None or not hasattr(braintrust_logger, "log"):
        _last_test_event_status = "failed"
        return {"success": False, "status": "failed", "error": _last_error or "braintrust_disabled"}
    try:
        braintrust_logger.log(
            input=None,
            output={"ok": True},
            metadata=redact_value(
                {
                    "event": "braintrust.integration.test",
                    "source": "ai-service",
                    "env": settings.braintrust_env,
                    "project_name": settings.braintrust_project_name,
                    "project_id": settings.braintrust_project_id,
                },
                log_inputs=True,
            ),
            allow_concurrent_with_spans=True,
        )
        flush_braintrust()
        _last_test_event_status = "ok"
        return {"success": True, "status": "ok"}
    except Exception as exc:  # noqa: BLE001
        _last_test_event_status = "failed"
        _last_error = f"test_event_failed: {exc}"
        logger.warning("Braintrust test event failed: %s", exc)
        return {"success": False, "status": "failed", "error": str(exc)}


def log_ai_interaction(
    *,
    input_text: str | None,
    output_text: str | None,
    provider: str = "ollama",
    model: str | None = None,
    module: str = "ai",
    role: str | None = None,
    intent: str | None = None,
    language: str | None = None,
    tenant_id: int | str | None = None,
    company_id: int | str | None = None,
    user_id: int | str | None = None,
    latency_ms: float | None = None,
    status: str = "success",
    error_type: str | None = None,
    error_message: str | None = None,
    endpoint: str | None = None,
    request_id: str | None = None,
    trace_id: str | None = None,
    channel: str = "text",
    metadata_extra: dict[str, Any] | None = None,
) -> bool:
    settings = get_settings()
    braintrust_logger = get_braintrust_logger()
    if braintrust_logger is None or not hasattr(braintrust_logger, "log"):
        return False
    if settings.braintrust_sample_rate <= 0.0:
        return False
    if settings.braintrust_sample_rate < 1.0 and random.random() >= settings.braintrust_sample_rate:
        return False

    resolved_status = "error" if str(status).lower() == "error" else "success"
    resolved_request_id = request_id or get_request_id()
    safe_extra = redact_value(metadata_extra or {}, log_inputs=True)
    metadata = {
        **(safe_extra if isinstance(safe_extra, dict) else {}),
        "event": "ai.interaction",
        "provider": provider or "unknown",
        "model": model or "unknown",
        "module": module or "unknown",
        "role": role or "unknown",
        "intent": intent or "unknown",
        "language": language or "unknown",
        "tenant_id": str(tenant_id) if tenant_id is not None else "none",
        "company_id": str(company_id) if company_id is not None else "none",
        "user_id": str(user_id) if user_id is not None else "none",
        "status": resolved_status,
        "environment": settings.braintrust_env or settings.app_env,
        "endpoint": endpoint or "unknown",
        "request_id": resolved_request_id or "none",
        "trace_id": trace_id or resolved_request_id or "none",
        "channel": channel or "unknown",
        "latency_ms": _safe_float(latency_ms),
        "error_type": error_type or "none",
        "error_message": redact_value(error_message or "", log_inputs=True) or "none",
    }
    safe_input = redact_value(input_text or "", log_inputs=True)
    safe_output = redact_value(output_text or "", log_inputs=True)
    metrics = {
        "latency_ms": _safe_float(latency_ms),
        "input_chars": len(input_text or ""),
        "output_chars": len(output_text or ""),
    }
    try:
        braintrust_logger.log(
            input={"text": safe_input},
            output={"text": safe_output},
            error=redact_value(error_message or "", log_inputs=True) if resolved_status == "error" else None,
            tags=["ai", channel or "unknown", module or "unknown", resolved_status, provider or "unknown"],
            metadata=redact_value(metadata, log_inputs=True),
            metrics=metrics,
            allow_concurrent_with_spans=True,
        )
        return True
    except Exception as exc:  # noqa: BLE001 - observability must not break runtime
        logger.warning("Braintrust AI interaction logging failed: %s", exc)
        return False


def log_ollama_interaction(
    *,
    input_text: str | None,
    output_text: str | None,
    model: str | None,
    module: str = "ollama_direct",
    role: str | None = None,
    intent: str | None = None,
    language: str | None = None,
    tenant_id: int | str | None = None,
    company_id: int | str | None = None,
    user_id: int | str | None = None,
    latency_ms: float | None = None,
    status: str = "success",
    error_type: str | None = None,
    error_message: str | None = None,
    endpoint: str = "/api/chat",
    request_id: str | None = None,
    channel: str = "text",
    fallback_used: bool = False,
    timeout: bool = False,
    max_tokens: int | None = None,
    temperature: float | None = None,
    metadata_extra: dict[str, Any] | None = None,
) -> bool:
    return log_ai_interaction(
        input_text=input_text,
        output_text=output_text,
        provider="ollama",
        model=model,
        module=module,
        role=role,
        intent=intent,
        language=language,
        tenant_id=tenant_id,
        company_id=company_id,
        user_id=user_id,
        latency_ms=latency_ms,
        status=status,
        error_type=error_type,
        error_message=error_message,
        endpoint=endpoint,
        request_id=request_id,
        channel=channel,
        metadata_extra={
            **(metadata_extra or {}),
            "fallback_used": bool(fallback_used),
            "timeout": bool(timeout),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "provider_endpoint": endpoint,
        },
    )


def log_voice_interaction(
    *,
    transcription: str | None,
    output_text: str | None,
    model: str | None = None,
    role: str | None = None,
    intent: str | None = None,
    language: str | None = None,
    tenant_id: int | str | None = None,
    company_id: int | str | None = None,
    user_id: int | str | None = None,
    latency_ms: float | None = None,
    status: str = "success",
    error_type: str | None = None,
    error_message: str | None = None,
    endpoint: str = "/v2/voice",
    request_id: str | None = None,
    audio_size_bytes: int | None = None,
    audio_duration_seconds: float | None = None,
    stt_latency_ms: float | None = None,
    llm_latency_ms: float | None = None,
    tts_latency_ms: float | None = None,
    metadata_extra: dict[str, Any] | None = None,
) -> bool:
    return log_ai_interaction(
        input_text=transcription,
        output_text=output_text,
        provider="ollama",
        model=model,
        module="assistant_voice",
        role=role,
        intent=intent,
        language=language,
        tenant_id=tenant_id,
        company_id=company_id,
        user_id=user_id,
        latency_ms=latency_ms,
        status=status,
        error_type=error_type,
        error_message=error_message,
        endpoint=endpoint,
        request_id=request_id,
        channel="voice",
        metadata_extra={
            **(metadata_extra or {}),
            "audio_size_bytes": audio_size_bytes,
            "audio_duration_seconds": audio_duration_seconds,
            "stt_latency_ms": _safe_float(stt_latency_ms),
            "llm_latency_ms": _safe_float(llm_latency_ms),
            "tts_latency_ms": _safe_float(tts_latency_ms),
            "raw_audio_logged": False,
        },
    )


def log_rag_interaction(
    *,
    question: str | None,
    output_text: str | None = None,
    provider: str = "chromadb",
    collection: str = "weentime_policy",
    retrieved_chunks: int = 0,
    top_k: int | None = None,
    citations_required: bool = True,
    citations_found: bool = False,
    tenant_filter_applied: bool = False,
    fallback_used: bool = False,
    role: str | None = None,
    intent: str | None = None,
    language: str | None = None,
    tenant_id: int | str | None = None,
    company_id: int | str | None = None,
    user_id: int | str | None = None,
    latency_ms: float | None = None,
    status: str = "success",
    error_type: str | None = None,
    error_message: str | None = None,
    endpoint: str | None = None,
    request_id: str | None = None,
    metadata_extra: dict[str, Any] | None = None,
) -> bool:
    return log_ai_interaction(
        input_text=question,
        output_text=output_text,
        provider=provider,
        model=collection,
        module="rag_policy",
        role=role,
        intent=intent,
        language=language,
        tenant_id=tenant_id,
        company_id=company_id,
        user_id=user_id,
        latency_ms=latency_ms,
        status=status,
        error_type=error_type,
        error_message=error_message,
        endpoint=endpoint,
        request_id=request_id,
        channel="rag",
        metadata_extra={
            **(metadata_extra or {}),
            "rag_provider": provider,
            "collection": collection,
            "retrieved_chunks": max(0, int(retrieved_chunks or 0)),
            "top_k": top_k,
            "citations_required": bool(citations_required),
            "citations_found": bool(citations_found),
            "tenant_filter_applied": bool(tenant_filter_applied),
            "fallback_used": bool(fallback_used),
        },
    )


def log_error_interaction(
    *,
    input_text: str | None,
    module: str,
    error: BaseException | str,
    provider: str = "ollama",
    model: str | None = None,
    **kwargs: Any,
) -> bool:
    error_type = error.__class__.__name__ if isinstance(error, BaseException) else "Error"
    return log_ai_interaction(
        input_text=input_text,
        output_text="",
        provider=provider,
        model=model,
        module=module,
        status="error",
        error_type=error_type,
        error_message=str(error),
        **kwargs,
    )


def _safe_float(value: float | int | None) -> float:
    try:
        return max(0.0, round(float(value or 0.0), 2))
    except (TypeError, ValueError):
        return 0.0


def get_braintrust_status() -> dict[str, Any]:
    settings = get_settings()
    sdk_available = _sdk_available
    if sdk_available is None:
        sdk_available = importlib.util.find_spec("braintrust") is not None
    return {
        "enabled": bool(settings.braintrust_enabled),
        "configured": is_braintrust_configured(),
        "project_name": settings.braintrust_project_name,
        "project_id": settings.braintrust_project_id,
        "env": settings.braintrust_env,
        "sdk_available": bool(sdk_available),
        "active": _braintrust_logger is not None,
        "last_test_event_status": _last_test_event_status,
        "last_error": _last_error,
    }


def reset_braintrust_cache_for_tests() -> None:
    global _braintrust_module, _braintrust_logger, _init_attempted, _sdk_available, _last_error, _last_test_event_status
    with _lock:
        _braintrust_module = None
        _braintrust_logger = None
        _init_attempted = False
        _sdk_available = None
        _last_error = None
        _last_test_event_status = "not_run"
