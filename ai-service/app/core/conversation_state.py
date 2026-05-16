from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from app.context.current_user import CurrentUserContext


DEFAULT_FLOW_TTL_MINUTES = 12


@dataclass(slots=True)
class PendingConversationFlow:
    intent: str
    agent: str
    collected_fields: dict[str, Any] = field(default_factory=dict)
    missing_fields: list[str] = field(default_factory=list)
    last_question: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(minutes=DEFAULT_FLOW_TTL_MINUTES))
    status: str = "pending"

    @property
    def expired(self) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at


class ConversationStateStore:
    def __init__(self, ttl_minutes: int = DEFAULT_FLOW_TTL_MINUTES) -> None:
        self.ttl = timedelta(minutes=ttl_minutes)
        self._flows: dict[tuple[int, int | None, str], PendingConversationFlow] = {}
        self._last_errors: dict[tuple[int, int | None, str], str] = {}

    def get(self, context: CurrentUserContext, session_id: str | None = None) -> PendingConversationFlow | None:
        key = self._key(context, session_id)
        flow = self._flows.get(key)
        if not flow:
            return None
        if flow.expired or flow.status != "pending":
            self._flows.pop(key, None)
            return None
        return flow

    def save(
        self,
        context: CurrentUserContext,
        flow: PendingConversationFlow,
        session_id: str | None = None,
    ) -> PendingConversationFlow:
        flow.expires_at = datetime.now(timezone.utc) + self.ttl
        self._flows[self._key(context, session_id)] = flow
        return flow

    def clear(self, context: CurrentUserContext, session_id: str | None = None) -> None:
        self._flows.pop(self._key(context, session_id), None)

    def reset_session(self, context: CurrentUserContext, session_id: str | None = None) -> dict[str, bool]:
        """Drop the pending flow AND the last-error breadcrumb for a session.

        Returned dict reports what was cleared (useful for client UX so the
        widget can say "demande en cours annulee" only when there was one).
        """
        key = self._key(context, session_id)
        had_flow = key in self._flows
        had_error = key in self._last_errors
        self._flows.pop(key, None)
        self._last_errors.pop(key, None)
        return {"flow": had_flow, "lastError": had_error}

    def record_last_error(self, context: CurrentUserContext, message: str, session_id: str | None = None) -> None:
        text = (message or "").strip()
        if text:
            self._last_errors[self._key(context, session_id)] = text

    def get_last_error(self, context: CurrentUserContext, session_id: str | None = None) -> str | None:
        return self._last_errors.get(self._key(context, session_id))

    @staticmethod
    def _key(context: CurrentUserContext, session_id: str | None) -> tuple[int, int | None, str]:
        return (int(context.user_id), context.tenant_id, (session_id or "default").strip() or "default")
