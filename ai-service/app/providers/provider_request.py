from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.observability.redaction import redact_value

from .provider_context import ProviderContext

_JWT_PATTERN = re.compile(r"\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
_BEARER_PATTERN = re.compile(r"Bearer\s+[A-Za-z0-9._-]+", re.IGNORECASE)
_SECRET_ASSIGNMENT_PATTERN = re.compile(
    r"\b(?:authorization|access_token|token|jwt|api[_-]?key|secret|password|database_url|redis_url)\s*[:=]\s*[^\s,;]+",
    re.IGNORECASE,
)
_KEY_PATTERN = re.compile(r"\b(?:sk-[A-Za-z0-9_-]{12,}|bt_[A-Za-z0-9_-]{12,})\b")
_URL_SECRET_PATTERN = re.compile(r"\b(?:postgresql|postgres|mysql|mongodb|redis)://[^\s]+", re.IGNORECASE)


class ProviderRequest(BaseModel):
    prompt: str
    context: ProviderContext
    citations: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def build(
        cls,
        prompt: str,
        *,
        context: CurrentUserContext | None = None,
        channel: str = "chat",
        intent: str | None = None,
        citations: list[dict[str, Any]] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "ProviderRequest":
        safe_metadata = sanitize_provider_payload(dict(metadata or {}))
        safe_context = ProviderContext.from_current_user(
            context,
            channel=channel,
            intent=intent,
            metadata=safe_metadata.get("context_metadata") if isinstance(safe_metadata.get("context_metadata"), dict) else None,
        )
        safe_citations = sanitize_provider_payload(citations or [])
        return cls(
            prompt=sanitize_provider_text(prompt),
            context=safe_context,
            citations=safe_citations if isinstance(safe_citations, list) else [],
            metadata=safe_metadata,
        )


def sanitize_provider_text(value: str | None) -> str:
    text = redact_value(value or "", log_inputs=True)
    text = str(text)
    text = _BEARER_PATTERN.sub("Bearer [redacted]", text)
    text = _JWT_PATTERN.sub("[redacted-jwt]", text)
    text = _SECRET_ASSIGNMENT_PATTERN.sub("[redacted-secret]", text)
    text = _KEY_PATTERN.sub("[redacted-key]", text)
    text = _URL_SECRET_PATTERN.sub("[redacted-url]", text)
    return text.strip()


def sanitize_provider_payload(value: Any) -> Any:
    redacted = redact_value(value, log_inputs=True)
    if isinstance(redacted, str):
        return sanitize_provider_text(redacted)
    if isinstance(redacted, dict):
        safe: dict[str, Any] = {}
        for key, item in redacted.items():
            normalized = str(key).lower()
            if normalized in {"authorization", "access_token", "token", "jwt", "api_key", "secret", "password"}:
                safe[str(key)] = "[redacted]"
            else:
                safe[str(key)] = sanitize_provider_payload(item)
        return safe
    if isinstance(redacted, list):
        return [sanitize_provider_payload(item) for item in redacted]
    if isinstance(redacted, tuple):
        return [sanitize_provider_payload(item) for item in redacted]
    return redacted
