from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from .braintrust_client import get_braintrust_logger, get_braintrust_status
from .metrics import increment_counter
from .redaction import redact_value
from .tracing import NoopSpan, log_error, log_event, start_span


def log_observation(
    name: str,
    *,
    input: Any | None = None,
    output: Any | None = None,
    metadata: dict[str, Any] | None = None,
    metrics: dict[str, Any] | None = None,
) -> None:
    safe_metadata = redact_value(metadata or {}, log_inputs=True)
    safe_input = redact_value(input, log_inputs=False) if input is not None else None
    safe_output = redact_value(output, log_inputs=True) if output is not None else None
    increment_counter("braintrust.observation", tags={"name": name})
    log_event(name, input=safe_input, output=safe_output, metadata=safe_metadata if isinstance(safe_metadata, dict) else {})
    logger = get_braintrust_logger()
    if logger is None:
        return
    try:
        logger.log(
            input=safe_input,
            output=safe_output,
            metadata={"event": name, **(safe_metadata if isinstance(safe_metadata, dict) else {})},
            metrics=redact_value(metrics or {}, log_inputs=True),
            allow_concurrent_with_spans=True,
        )
    except Exception as exc:  # noqa: BLE001 - observability must never break runtime
        log_error("braintrust.log_observation_failed", exc, {"event": name})


@contextmanager
def braintrust_span(name: str, metadata: dict[str, Any] | None = None) -> Iterator[Any]:
    span = start_span(name, metadata=redact_value(metadata or {}, log_inputs=True))
    try:
        with span:
            yield span
    except Exception:
        raise


def braintrust_health_summary() -> dict[str, Any]:
    status = get_braintrust_status()
    return redact_value(status, log_inputs=True) if isinstance(status, dict) else {"available": False}


__all__ = ["NoopSpan", "braintrust_health_summary", "braintrust_span", "log_observation"]
