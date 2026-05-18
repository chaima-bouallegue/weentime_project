from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from app.context.current_user import CurrentUserContext

SessionChannel = Literal["chat", "voice"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class SessionState:
    request_id: str
    session_id: str
    user_id: int
    tenant_id: int | None
    role: str
    language: str
    channel: SessionChannel
    current_page: str | None = None
    conversation_id: str | None = None
    company_id: str | None = None
    intent: str | None = None
    selected_agent: str | None = None
    pending_confirmation: dict[str, Any] | None = None
    recent_context: list[dict[str, Any]] = field(default_factory=list)
    tool_history: list[dict[str, Any]] = field(default_factory=list)
    last_safe_response: dict[str, Any] | None = None
    pending_flow: dict[str, Any] | None = None
    updated_at: datetime = field(default_factory=utc_now)
    expires_at: datetime | None = None

    @classmethod
    def from_context(
        cls,
        *,
        request_id: str,
        session_id: str,
        context: CurrentUserContext,
        channel: SessionChannel,
        language: str | None = None,
    ) -> "SessionState":
        metadata = context.metadata if isinstance(context.metadata, dict) else {}
        return cls(
            request_id=request_id,
            session_id=session_id,
            user_id=int(context.user_id),
            tenant_id=context.tenant_id,
            role=context.role,
            language=str(language or context.language or context.metadata.get("language") or "unknown"),
            channel=channel,
            current_page=_optional_text(metadata.get("current_page")),
            conversation_id=_optional_text(metadata.get("conversation_id") or session_id),
            company_id=_optional_text(metadata.get("company_id") or metadata.get("entreprise_id") or context.entreprise_id),
        )

    def touch(self, ttl_seconds: int) -> None:
        self.updated_at = utc_now()
        self.expires_at = self.updated_at + timedelta(seconds=max(1, ttl_seconds))

    def is_expired(self, now: datetime | None = None) -> bool:
        if self.expires_at is None:
            return False
        return (now or utc_now()) >= self.expires_at

    def remember_context(self, entry: dict[str, Any], *, limit: int = 6) -> None:
        if not entry:
            return
        self.recent_context.append(dict(entry))
        if limit > 0 and len(self.recent_context) > limit:
            self.recent_context = self.recent_context[-limit:]

    def remember_tool(self, entry: dict[str, Any], *, limit: int = 8) -> None:
        if not entry:
            return
        self.tool_history.append(dict(entry))
        if limit > 0 and len(self.tool_history) > limit:
            self.tool_history = self.tool_history[-limit:]


def _optional_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None
