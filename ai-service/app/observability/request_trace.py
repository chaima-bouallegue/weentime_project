from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .metrics import record_request_lifecycle
from .redaction import redact_value
from .tracing import log_event


@dataclass(slots=True)
class RequestTrace:
    request_id: str | None
    endpoint: str
    status_code: int
    latency_ms: float
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return redact_value(
            {
                "request_id": self.request_id,
                "endpoint": self.endpoint,
                "status_code": self.status_code,
                "latency_ms": round(float(self.latency_ms or 0.0), 2),
                "metadata": self.metadata,
            },
            log_inputs=True,
        )


def trace_request_lifecycle(
    *,
    endpoint: str,
    status_code: int,
    latency_ms: float,
    request_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> RequestTrace:
    trace = RequestTrace(
        request_id=request_id,
        endpoint=endpoint,
        status_code=int(status_code),
        latency_ms=float(latency_ms or 0.0),
        metadata=metadata or {},
    )
    record_request_lifecycle(endpoint=endpoint, status_code=trace.status_code, latency_ms=trace.latency_ms, request_id=request_id)
    log_event("request.lifecycle", metadata=trace.to_dict())
    return trace


def sanitize_trace_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    redacted = redact_value(metadata or {}, log_inputs=True)
    return redacted if isinstance(redacted, dict) else {}
