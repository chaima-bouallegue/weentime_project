"""Optional, failure-tolerant Braintrust logger initialization."""
from __future__ import annotations

import importlib.util
import logging
from threading import RLock
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_lock = RLock()
_braintrust_module: Any | None = None
_braintrust_logger: Any | None = None
_init_attempted = False
_last_error: str | None = None


def get_braintrust_logger() -> Any | None:
    return init_braintrust()


def init_braintrust() -> Any | None:
    global _braintrust_module, _braintrust_logger, _init_attempted, _last_error
    settings = get_settings()
    with _lock:
        if _init_attempted:
            return _braintrust_logger
        _init_attempted = True

        if not settings.braintrust_enabled:
            _last_error = "disabled_by_env"
            logger.info("Braintrust tracing disabled by configuration")
            return None
        if not settings.braintrust_api_key:
            _last_error = "missing_api_key"
            logger.warning("Braintrust tracing disabled: BRAINTRUST_API_KEY is not set")
            return None
        if not settings.braintrust_project_id and not settings.braintrust_project_name:
            _last_error = "missing_project"
            logger.warning(
                "Braintrust tracing disabled: configure BRAINTRUST_PROJECT_ID "
                "or BRAINTRUST_PROJECT_NAME"
            )
            return None
        if importlib.util.find_spec("braintrust") is None:
            _last_error = "sdk_unavailable"
            logger.warning("Braintrust SDK unavailable; ML tracing remains disabled")
            return None

        try:
            import braintrust  # type: ignore

            _braintrust_module = braintrust
            _braintrust_logger = braintrust.init_logger(
                project=settings.braintrust_project_name or None,
                project_id=settings.braintrust_project_id or None,
                api_key=settings.braintrust_api_key,
                async_flush=True,
            )
            _last_error = None
            logger.info(
                "Braintrust tracing initialized project=%s environment=%s",
                settings.braintrust_project_name or settings.braintrust_project_id,
                settings.braintrust_env,
            )
        except Exception as exc:  # noqa: BLE001
            _braintrust_logger = None
            _last_error = f"initialization_failed:{type(exc).__name__}"
            logger.warning(
                "Braintrust initialization failed; ML service continues without tracing (%s)",
                type(exc).__name__,
            )
        return _braintrust_logger


def flush_braintrust() -> None:
    try:
        if _braintrust_logger is not None and hasattr(_braintrust_logger, "flush"):
            _braintrust_logger.flush()
        if _braintrust_module is not None and hasattr(_braintrust_module, "flush"):
            _braintrust_module.flush()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Braintrust flush failed (%s)", type(exc).__name__)


def reset_braintrust_for_tests() -> None:
    global _braintrust_module, _braintrust_logger, _init_attempted, _last_error
    with _lock:
        _braintrust_module = None
        _braintrust_logger = None
        _init_attempted = False
        _last_error = None
