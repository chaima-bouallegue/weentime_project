from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class RealtimeEventEnvelope(BaseModel):
    eventId: str = Field(default_factory=lambda: str(uuid4()))
    eventType: str
    version: int = 1
    tenantId: int | None = None
    actorUserId: int | None = None
    targetUserIds: list[int] = Field(default_factory=list)
    aggregateType: str | None = None
    aggregateId: str | None = None
    occurredAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    sourceService: str = "ai-service"
    traceId: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class EventPublishResult(BaseModel):
    success: bool
    enabled: bool
    channel: str
    eventType: str | None = None
    error: str | None = None
    fallback: str | None = None
