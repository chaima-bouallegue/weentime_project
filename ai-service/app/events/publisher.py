from __future__ import annotations

import importlib
import json
import logging
from typing import Any

from config import get_settings

from app.observability.redaction import redact_value
from app.observability.request_context import get_request_id

from .event_models import EventPublishResult, RealtimeEventEnvelope

logger = logging.getLogger(__name__)


class NoopEventPublisher:
    def __init__(self, *, channel: str = "ai.events.generated", reason: str = "redis_disabled") -> None:
        self.channel = channel
        self.reason = reason

    async def publish_event(self, envelope: RealtimeEventEnvelope) -> EventPublishResult:
        return EventPublishResult(
            success=True,
            enabled=False,
            channel=self.channel,
            eventType=envelope.eventType,
            fallback=self.reason,
        )


class RedisEventPublisher:
    def __init__(
        self,
        *,
        redis_url: str,
        channel: str,
        redis_client: Any | None = None,
    ) -> None:
        self.redis_url = redis_url
        self.channel = channel
        self._redis_client = redis_client

    async def publish_event(self, envelope: RealtimeEventEnvelope) -> EventPublishResult:
        payload = json.dumps(_safe_event_payload(envelope), ensure_ascii=False, default=str)
        try:
            client = await self._client()
            await client.publish(self.channel, payload)
            return EventPublishResult(success=True, enabled=True, channel=self.channel, eventType=envelope.eventType)
        except Exception as exc:  # noqa: BLE001 - Redis is optional and must never break business flow.
            logger.warning(
                "Redis event publish failed. channel=%s event_type=%s error=%s",
                self.channel,
                envelope.eventType,
                exc.__class__.__name__,
            )
            return EventPublishResult(
                success=False,
                enabled=True,
                channel=self.channel,
                eventType=envelope.eventType,
                error=exc.__class__.__name__,
                fallback="redis_unavailable",
            )

    async def _client(self) -> Any:
        if self._redis_client is not None:
            return self._redis_client
        redis_module = importlib.import_module("redis.asyncio")
        self._redis_client = redis_module.Redis.from_url(self.redis_url, decode_responses=True)
        return self._redis_client


def get_event_publisher(settings: Any | None = None) -> NoopEventPublisher | RedisEventPublisher:
    resolved = settings or get_settings()
    channel = str(getattr(resolved, "redis_ai_events_channel", "ai.events.generated") or "ai.events.generated")
    if not bool(getattr(resolved, "redis_enabled", False)):
        return NoopEventPublisher(channel=channel, reason="redis_disabled")
    if not _redis_sdk_available():
        return NoopEventPublisher(channel=channel, reason="redis_sdk_unavailable")
    return RedisEventPublisher(redis_url=str(getattr(resolved, "redis_url", "redis://localhost:6379")), channel=channel)


def get_redis_event_status(settings: Any | None = None) -> dict[str, Any]:
    resolved = settings or get_settings()
    enabled = bool(getattr(resolved, "redis_enabled", False))
    channel = str(getattr(resolved, "redis_ai_events_channel", "ai.events.generated") or "ai.events.generated")
    return {
        "enabled": enabled,
        "configured": enabled and bool(getattr(resolved, "redis_url", "")),
        "channel": channel,
        "sdk_available": _redis_sdk_available(),
        "mode": "redis" if enabled and _redis_sdk_available() else "noop",
    }


def build_ai_event(
    event_type: str,
    *,
    payload: dict[str, Any] | None = None,
    tenant_id: int | None = None,
    actor_user_id: int | None = None,
    target_user_ids: list[int] | None = None,
    aggregate_type: str | None = None,
    aggregate_id: str | None = None,
    trace_id: str | None = None,
) -> RealtimeEventEnvelope:
    return RealtimeEventEnvelope(
        eventType=event_type,
        tenantId=tenant_id,
        actorUserId=actor_user_id,
        targetUserIds=target_user_ids or [],
        aggregateType=aggregate_type,
        aggregateId=aggregate_id,
        traceId=trace_id or get_request_id(),
        payload=payload or {},
    )


def _safe_event_payload(envelope: RealtimeEventEnvelope) -> dict[str, Any]:
    data = envelope.model_dump(mode="json")
    data["payload"] = redact_value(data.get("payload") or {}, log_inputs=True)
    return data


def _redis_sdk_available() -> bool:
    try:
        importlib.import_module("redis.asyncio")
        return True
    except Exception:  # noqa: BLE001
        return False
