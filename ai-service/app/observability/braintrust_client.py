from __future__ import annotations

import logging
from threading import RLock
from typing import Any

from config import get_settings

from .redaction import redact_value

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

        logger.info("Braintrust enabled: %s", str(bool(settings.braintrust_enabled)).lower())
        logger.info("Braintrust project: %s", settings.braintrust_project_name)
        logger.info("Braintrust env: %s", settings.braintrust_env)

        if not settings.braintrust_enabled:
            _last_error = "disabled_by_env"
            return None
        if not settings.braintrust_api_key:
            _last_error = "missing_api_key"
            logger.warning("Braintrust tracing disabled: BRAINTRUST_API_KEY is not set.")
            return None

        try:
            import braintrust  # type: ignore
        except Exception as exc:  # noqa: BLE001
            _sdk_available = False
            _last_error = f"sdk_import_failed: {exc}"
            logger.warning("Braintrust SDK unavailable; tracing disabled: %s", exc)
            return None

        _sdk_available = True
        _braintrust_module = braintrust
        try:
            _braintrust_logger = braintrust.init_logger(
                project=settings.braintrust_project_name,
                project_id=settings.braintrust_project_id or None,
                api_key=settings.braintrust_api_key,
                async_flush=True,
            )
            _last_error = None
            logger.info("Braintrust logger initialized.")
            return _braintrust_logger
        except Exception as exc:  # noqa: BLE001
            _braintrust_logger = None
            _last_error = f"init_failed: {exc}"
            logger.warning("Braintrust initialization failed; tracing disabled: %s", exc)
            return None


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


def get_braintrust_status() -> dict[str, Any]:
    settings = get_settings()
    sdk_available = _sdk_available
    if sdk_available is None:
        try:
            import braintrust  # noqa: F401

            sdk_available = True
        except Exception:
            sdk_available = False
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
