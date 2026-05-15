from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.context.current_user import CurrentUserContext

WorkflowChannel = Literal["chat", "voice"]


@dataclass(slots=True)
class WorkflowState:
    request_id: str
    user_id: int | None
    tenant_id: int | None
    role: str
    channel: WorkflowChannel
    language: str
    intent: str | None = None
    selected_agent: str | None = None
    read_evidence: list[dict[str, Any]] = field(default_factory=list)
    pending_confirmation: dict[str, Any] | None = None
    tool_result: dict[str, Any] | None = None
    guard_result: dict[str, Any] | None = None
    fallback_used: bool = False
    error_code: str | None = None

    @classmethod
    def from_context(
        cls,
        request_id: str,
        context: CurrentUserContext,
        *,
        channel: WorkflowChannel,
        language: str | None = None,
    ) -> "WorkflowState":
        return cls(
            request_id=request_id,
            user_id=context.user_id,
            tenant_id=context.tenant_id,
            role=context.role,
            channel=channel,
            language=str(language or context.language or context.metadata.get("language") or "unknown"),
        )

    def mark_fallback(self, error_code: str | None) -> None:
        self.fallback_used = True
        self.error_code = error_code or self.error_code

    def to_dict(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "user_id": self.user_id,
            "tenant_id": self.tenant_id,
            "role": self.role,
            "channel": self.channel,
            "language": self.language,
            "intent": self.intent,
            "selected_agent": self.selected_agent,
            "read_evidence": list(self.read_evidence),
            "pending_confirmation": self.pending_confirmation,
            "tool_result": self.tool_result,
            "guard_result": self.guard_result,
            "fallback_used": self.fallback_used,
            "error_code": self.error_code,
        }
