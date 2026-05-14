from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


FallbackReason = Literal[
    "provider_disabled",
    "provider_unavailable",
    "provider_timeout",
    "provider_invalid_output",
    "guard_rejected",
    "rag_unavailable",
    "rag_missing_citations",
    "unsupported_tool",
    "unsafe_response",
]

SafeResponseType = Literal["deterministic", "clarification", "unavailable"]

ALLOWED_FALLBACK_REASONS: set[str] = {
    "provider_disabled",
    "provider_unavailable",
    "provider_timeout",
    "provider_invalid_output",
    "guard_rejected",
    "rag_unavailable",
    "rag_missing_citations",
    "unsupported_tool",
    "unsafe_response",
}


class FallbackMetadata(BaseModel):
    fallback_used: bool = True
    fallback_reason: FallbackReason
    safe_response_type: SafeResponseType
    provider_used: Literal["none"] = "none"
    guard_status: str | None = None
    request_id: str | None = None
