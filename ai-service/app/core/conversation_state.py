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
    language: str | None = None
    role: str | None = None
    current_page: str | None = None
    last_action: str | None = None

    @property
    def expired(self) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at


class ConversationStateStore:
    def __init__(self, ttl_minutes: int = DEFAULT_FLOW_TTL_MINUTES) -> None:
        self.ttl = timedelta(minutes=ttl_minutes)
        self._flows: dict[tuple[int, int | None, str, str, str, str, str], PendingConversationFlow] = {}
        self._last_errors: dict[tuple[int, int | None, str, str, str, str, str], str] = {}

    def get(self, context: CurrentUserContext, session_id: str | None = None) -> PendingConversationFlow | None:
        flow: PendingConversationFlow | None = None
        stale_key: tuple[int, int | None, str, str, str, str, str] | None = None
        for key in self._candidate_keys(context, session_id):
            flow = self._flows.get(key)
            if flow:
                stale_key = key
                break
        if not flow:
            return None
        if flow.expired or flow.status != "pending":
            if stale_key is not None:
                self._flows.pop(stale_key, None)
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
        for key in self._candidate_keys(context, session_id):
            self._flows.pop(key, None)

    def reset_session(self, context: CurrentUserContext, session_id: str | None = None) -> dict[str, bool]:
        """Drop the pending flow AND the last-error breadcrumb for a session.

        Returned dict reports what was cleared (useful for client UX so the
        widget can say "demande en cours annulee" only when there was one).
        """
        keys = self._candidate_keys(context, session_id)
        had_flow = any(key in self._flows for key in keys)
        had_error = any(key in self._last_errors for key in keys)
        for key in keys:
            self._flows.pop(key, None)
            self._last_errors.pop(key, None)
        return {"flow": had_flow, "lastError": had_error}

    def record_last_error(self, context: CurrentUserContext, message: str, session_id: str | None = None) -> None:
        text = (message or "").strip()
        if text:
            self._last_errors[self._key(context, session_id)] = text

    def get_last_error(self, context: CurrentUserContext, session_id: str | None = None) -> str | None:
        for key in self._candidate_keys(context, session_id):
            value = self._last_errors.get(key)
            if value:
                return value
        return None

    @staticmethod
    def _key(context: CurrentUserContext, session_id: str | None) -> tuple[int, int | None, str, str, str, str, str]:
        metadata = context.metadata if isinstance(context.metadata, dict) else {}
        channel = str(metadata.get("channel") or "chat").strip().lower() or "chat"
        role = str(context.role or "EMPLOYEE").upper().replace("ROLE_", "") or "EMPLOYEE"
        resolved_session = str(session_id or metadata.get("session_id") or "default").strip() or "default"
        conversation_id = str(metadata.get("conversation_id") or resolved_session).strip() or resolved_session
        current_page = str(metadata.get("current_page") or "global").strip().lower() or "global"
        return (
            int(context.user_id),
            context.tenant_id,
            channel,
            resolved_session,
            role,
            conversation_id,
            current_page,
        )

    @classmethod
    def _candidate_keys(
        cls,
        context: CurrentUserContext,
        session_id: str | None,
    ) -> list[tuple[int, int | None, str, str, str, str, str]]:
        primary = cls._key(context, session_id)
        user_id, tenant_id, channel, resolved_session, role, conversation_id, current_page = primary
        alternate_channel = "voice" if channel == "chat" else "chat"
        candidates = [
            primary,
            (user_id, tenant_id, alternate_channel, resolved_session, role, conversation_id, current_page),
        ]
        if current_page != "global":
            candidates.extend(
                [
                    (user_id, tenant_id, channel, resolved_session, role, conversation_id, "global"),
                    (user_id, tenant_id, alternate_channel, resolved_session, role, conversation_id, "global"),
                ]
            )
        return candidates
