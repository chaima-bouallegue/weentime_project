from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any
from uuid import uuid4

from app.context.current_user import CurrentUserContext
from app.observability.metrics import record_confirmation_event
from app.observability.tracing import log_event


@dataclass(slots=True)
class ConfirmationRecord:
    confirmation_id: str
    user_id: int
    tenant_id: int | None
    tool_name: str
    tool_input: dict[str, Any]
    expires_at: datetime
    status: str = "pending"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def expired(self) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at


class ConfirmationStore:
    def __init__(self, ttl_seconds: int = 300) -> None:
        self.ttl_seconds = ttl_seconds
        self._records: dict[str, ConfirmationRecord] = {}
        self._lock = RLock()

    def create(self, context: CurrentUserContext, tool_name: str, tool_input: dict[str, Any] | None = None) -> ConfirmationRecord:
        record = ConfirmationRecord(
            confirmation_id=str(uuid4()),
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            tool_name=tool_name,
            tool_input=tool_input or {},
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=self.ttl_seconds),
        )
        with self._lock:
            self._records[record.confirmation_id] = record
        log_event(
            "confirmation.created",
            metadata={
                "confirmation_id": record.confirmation_id,
                "tool_name": record.tool_name,
                "status": record.status,
            },
        )
        record_confirmation_event(action="created", tool_name=record.tool_name, status=record.status, tenant_id=record.tenant_id)
        return record

    def get(self, confirmation_id: str) -> ConfirmationRecord | None:
        with self._lock:
            record = self._records.get(confirmation_id)
        if not record:
            return None
        if record.expired and record.status == "pending":
            record.status = "expired"
            log_event(
                "confirmation.expired",
                metadata={
                    "confirmation_id": record.confirmation_id,
                    "tool_name": record.tool_name,
                    "status": record.status,
                },
            )
            record_confirmation_event(action="expired", tool_name=record.tool_name, status=record.status, tenant_id=record.tenant_id)
        return record

    def consume(self, confirmation_id: str) -> ConfirmationRecord | None:
        with self._lock:
            record = self._records.get(confirmation_id)
            if record and record.status == "pending" and not record.expired:
                record.status = "approved"
                log_event(
                    "confirmation.approved",
                    metadata={
                        "confirmation_id": record.confirmation_id,
                        "tool_name": record.tool_name,
                        "status": record.status,
                    },
                )
                record_confirmation_event(action="approved", tool_name=record.tool_name, status=record.status, tenant_id=record.tenant_id)
            return record

    def reject(self, confirmation_id: str) -> ConfirmationRecord | None:
        with self._lock:
            record = self._records.get(confirmation_id)
            if record and record.status == "pending":
                record.status = "rejected"
                log_event(
                    "confirmation.rejected",
                    metadata={
                        "confirmation_id": record.confirmation_id,
                        "tool_name": record.tool_name,
                        "status": record.status,
                    },
                )
                record_confirmation_event(action="rejected", tool_name=record.tool_name, status=record.status, tenant_id=record.tenant_id)
            return record

    def find_pending_for_user(self, user_id: int, tenant_id: int | None = None) -> ConfirmationRecord | None:
        with self._lock:
            records = sorted(self._records.values(), key=lambda item: item.created_at, reverse=True)
        for record in records:
            if record.user_id != user_id:
                continue
            if tenant_id is not None and record.tenant_id != tenant_id:
                continue
            if record.status == "pending" and not record.expired:
                return record
            if record.expired and record.status == "pending":
                record.status = "expired"
                log_event(
                    "confirmation.expired",
                    metadata={
                        "confirmation_id": record.confirmation_id,
                        "tool_name": record.tool_name,
                        "status": record.status,
                    },
                )
                record_confirmation_event(action="expired", tool_name=record.tool_name, status=record.status, tenant_id=record.tenant_id)
        return None

    def clear_for_user(self, user_id: int) -> None:
        with self._lock:
            stale = [key for key, record in self._records.items() if record.user_id == user_id]
            for key in stale:
                self._records.pop(key, None)
