from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass, field
from statistics import mean
from threading import RLock
from time import time
from typing import Any

from .redaction import redact_value

_MAX_RECENT_EVENTS = 200

_LOCK = RLock()
_COUNTERS: Counter[str] = Counter()
_LATENCIES: dict[str, list[float]] = {}
_RECENT_EVENTS: deque[dict[str, Any]] = deque(maxlen=_MAX_RECENT_EVENTS)


@dataclass(slots=True)
class MetricEvent:
    name: str
    tags: dict[str, Any] = field(default_factory=dict)
    value: float | int | None = None
    latency_ms: float | None = None
    success: bool | None = None
    timestamp: float = field(default_factory=time)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": self.name,
            "tags": redact_value(self.tags, log_inputs=True),
            "timestamp": self.timestamp,
        }
        if self.value is not None:
            payload["value"] = self.value
        if self.latency_ms is not None:
            payload["latency_ms"] = round(float(self.latency_ms), 2)
        if self.success is not None:
            payload["success"] = bool(self.success)
        return payload


def increment_counter(name: str, *, amount: int = 1, tags: dict[str, Any] | None = None) -> None:
    key = _metric_key(name, tags)
    event = MetricEvent(name=name, tags=tags or {}, value=amount)
    with _LOCK:
        _COUNTERS[key] += amount
        _RECENT_EVENTS.append(event.to_dict())


def record_latency(name: str, latency_ms: float, *, tags: dict[str, Any] | None = None, success: bool | None = None) -> None:
    key = _metric_key(name, tags)
    value = max(0.0, float(latency_ms or 0.0))
    event = MetricEvent(name=name, tags=tags or {}, latency_ms=value, success=success)
    with _LOCK:
        _LATENCIES.setdefault(key, []).append(value)
        _RECENT_EVENTS.append(event.to_dict())


def record_request_lifecycle(*, endpoint: str, status_code: int, latency_ms: float, request_id: str | None = None) -> None:
    tags = {"endpoint": endpoint, "status_code": int(status_code)}
    increment_counter("request.lifecycle", tags=tags)
    record_latency("request.lifecycle", latency_ms, tags=tags, success=int(status_code) < 500)
    if request_id:
        with _LOCK:
            _RECENT_EVENTS.append(
                MetricEvent("request.correlation", tags={"endpoint": endpoint, "request_id": request_id}).to_dict()
            )


def record_provider_event(
    *,
    provider: str,
    mode: str,
    model: str | None = None,
    fallback_reason: str | None = None,
    latency_ms: float | None = None,
    success: bool | None = None,
) -> None:
    tags = {
        "provider": provider or "unknown",
        "mode": mode or "unknown",
        "model": model or "none",
        "fallback_reason": fallback_reason or "none",
    }
    increment_counter("provider.request", tags=tags)
    if fallback_reason:
        increment_counter("provider.fallback", tags={"reason": fallback_reason, "provider": provider or "unknown"})
    if latency_ms is not None:
        record_latency("provider.request", latency_ms, tags=tags, success=success)


def record_tool_event(
    *,
    tool_name: str,
    category: str,
    role: str | None,
    tenant_id: int | str | None,
    success: bool,
    status: str,
    latency_ms: float | None = None,
) -> None:
    tags = {
        "tool": tool_name,
        "category": category,
        "role": role or "unknown",
        "tenant": str(tenant_id) if tenant_id is not None else "none",
        "status": status,
    }
    increment_counter("tool.execution", tags=tags)
    if latency_ms is not None:
        record_latency("tool.execution", latency_ms, tags=tags, success=success)


def record_role_intelligence_event(*, role: str, digest_type: str, duration_ms: float, success: bool = True) -> None:
    tags = {"role": role or "unknown", "digest_type": digest_type or "unknown"}
    increment_counter("role_intelligence.digest", tags=tags)
    record_latency("role_intelligence.digest", duration_ms, tags=tags, success=success)


def record_rag_event(
    *,
    provider: str,
    tenant_id: int | str | None,
    retrieved_docs_count: int,
    citation_count: int,
    fallback_used: bool,
    duration_ms: float,
    success: bool = True,
) -> None:
    tags = {
        "provider": provider or "unknown",
        "tenant": str(tenant_id) if tenant_id is not None else "none",
        "fallback_used": str(bool(fallback_used)).lower(),
    }
    increment_counter("rag.retrieval", tags=tags)
    increment_counter("rag.citations", amount=max(0, int(citation_count)), tags=tags)
    record_latency("rag.retrieval", duration_ms, tags=tags, success=success)
    with _LOCK:
        _RECENT_EVENTS.append(
            MetricEvent(
                "rag.retrieval.summary",
                tags={**tags, "retrieved_docs_count": int(retrieved_docs_count), "citation_count": int(citation_count)},
                success=success,
            ).to_dict()
        )


def record_voice_event(
    *,
    stage: str,
    language: str | None = None,
    duration_ms: float | None = None,
    audio_duration_seconds: float | None = None,
    fallback_path: str | None = None,
    success: bool | None = None,
) -> None:
    tags = {
        "stage": stage,
        "language": language or "unknown",
        "fallback_path": fallback_path or "none",
    }
    increment_counter("voice.pipeline", tags=tags)
    if duration_ms is not None:
        record_latency("voice.pipeline", duration_ms, tags=tags, success=success)
    if audio_duration_seconds is not None:
        with _LOCK:
            _RECENT_EVENTS.append(
                MetricEvent("voice.audio.duration", tags=tags, value=round(float(audio_duration_seconds), 3), success=success).to_dict()
            )


def record_confirmation_event(*, action: str, tool_name: str | None, status: str, tenant_id: int | str | None = None) -> None:
    tags = {
        "action": action,
        "tool": tool_name or "unknown",
        "status": status,
        "tenant": str(tenant_id) if tenant_id is not None else "none",
    }
    increment_counter("confirmation.flow", tags=tags)


def snapshot_metrics() -> dict[str, Any]:
    with _LOCK:
        counters = dict(_COUNTERS)
        latency_summary = {
            key: {
                "count": len(values),
                "avg_ms": round(mean(values), 2) if values else 0.0,
                "max_ms": round(max(values), 2) if values else 0.0,
                "last_ms": round(values[-1], 2) if values else 0.0,
            }
            for key, values in _LATENCIES.items()
        }
        recent_events = list(_RECENT_EVENTS)
    return redact_value({"counters": counters, "latencies": latency_summary, "recent_events": recent_events}, log_inputs=True)


def reset_metrics_for_tests() -> None:
    with _LOCK:
        _COUNTERS.clear()
        _LATENCIES.clear()
        _RECENT_EVENTS.clear()


def _metric_key(name: str, tags: dict[str, Any] | None = None) -> str:
    if not tags:
        return name
    safe_tags = redact_value(tags, log_inputs=True)
    parts = [f"{key}={safe_tags[key]}" for key in sorted(safe_tags)]
    return f"{name}|" + ",".join(parts)
