from __future__ import annotations

import logging
from contextlib import AbstractContextManager
from time import perf_counter
from typing import Any

from .braintrust_client import get_braintrust_logger
from .redaction import redact_value

logger = logging.getLogger(__name__)


class NoopSpan(AbstractContextManager["NoopSpan"]):
    def __init__(self, name: str, metadata: dict[str, Any] | None = None) -> None:
        self.name = name
        self.metadata = metadata or {}
        self.started_at = 0.0
        self._span: Any | None = None

    def __enter__(self) -> "NoopSpan":
        self.started_at = perf_counter()
        braintrust_logger = get_braintrust_logger()
        if braintrust_logger is not None and hasattr(braintrust_logger, "start_span"):
            try:
                self._span = braintrust_logger.start_span(
                    name=self.name,
                    metadata=redact_value(self.metadata, log_inputs=True),
                )
                if hasattr(self._span, "__enter__"):
                    self._span.__enter__()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Braintrust start_span failed: %s", exc)
                self._span = None
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        duration_ms = round((perf_counter() - self.started_at) * 1000, 2) if self.started_at else None
        if exc is not None:
            log_error(self.name, exc, {**self.metadata, "duration_ms": duration_ms})
        elif self._span is not None and hasattr(self._span, "log"):
            try:
                self._span.log(metrics={"duration_ms": duration_ms} if duration_ms is not None else None)
            except Exception as span_exc:  # noqa: BLE001
                logger.warning("Braintrust span metrics failed: %s", span_exc)
        if self._span is not None and hasattr(self._span, "__exit__"):
            try:
                self._span.__exit__(exc_type, exc, tb)
            except Exception as span_exc:  # noqa: BLE001
                logger.warning("Braintrust span exit failed: %s", span_exc)
        return False


def start_span(name: str, metadata: dict[str, Any] | None = None) -> NoopSpan:
    return NoopSpan(name, metadata)


def log_event(
    name: str,
    *,
    input: Any = None,
    output: Any = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    braintrust_logger = get_braintrust_logger()
    if braintrust_logger is None or not hasattr(braintrust_logger, "log"):
        return
    try:
        braintrust_logger.log(
            input=redact_value(input),
            output=redact_value(output),
            metadata=redact_value({"event": name, **(metadata or {})}, log_inputs=True),
            allow_concurrent_with_spans=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Braintrust log_event failed: %s", exc)


def log_error(name: str, error: BaseException | str, metadata: dict[str, Any] | None = None) -> None:
    braintrust_logger = get_braintrust_logger()
    if braintrust_logger is None or not hasattr(braintrust_logger, "log"):
        return
    try:
        braintrust_logger.log(
            input=None,
            error=redact_value(str(error), log_inputs=True),
            metadata=redact_value({"event": name, "status": "error", **(metadata or {})}, log_inputs=True),
            allow_concurrent_with_spans=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Braintrust log_error failed: %s", exc)
