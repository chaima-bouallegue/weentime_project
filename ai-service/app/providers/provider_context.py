from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext


class ProviderContext(BaseModel):
    role: str
    language: str = "fr"
    locale: str = "fr-FR"
    channel: str = "chat"
    intent: str | None = None
    request_id: str | None = None
    tenant_present: bool = False
    permissions: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_current_user(
        cls,
        context: CurrentUserContext | None,
        *,
        channel: str = "chat",
        intent: str | None = None,
        request_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "ProviderContext":
        if context is None:
            return cls(role="UNKNOWN", channel=channel, intent=intent, request_id=request_id, metadata=dict(metadata or {}))
        resolved_request_id = request_id or str(context.metadata.get("request_id") or "") or None
        safe_permissions = sorted(str(permission) for permission in (context.permissions or set()))
        return cls(
            role=str(context.role or "UNKNOWN").upper().replace("ROLE_", ""),
            language=str(context.language or context.metadata.get("language") or "fr").lower(),
            locale=str(context.locale or "fr-FR"),
            channel=channel,
            intent=intent,
            request_id=resolved_request_id,
            tenant_present=context.tenant_id is not None,
            permissions=safe_permissions,
            metadata=dict(metadata or {}),
        )
