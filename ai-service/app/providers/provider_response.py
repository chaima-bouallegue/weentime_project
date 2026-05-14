from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProviderResponse(BaseModel):
    success: bool
    text: str = ""
    provider_name: str
    model: str | None = None
    latency_ms: float | None = None
    finish_reason: str | None = None
    fallback_reason: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def ok(
        cls,
        text: str,
        *,
        provider_name: str,
        model: str | None = None,
        latency_ms: float | None = None,
        finish_reason: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "ProviderResponse":
        return cls(
            success=True,
            text=text,
            provider_name=provider_name,
            model=model,
            latency_ms=latency_ms,
            finish_reason=finish_reason,
            metadata=metadata or {},
        )

    @classmethod
    def fail(
        cls,
        fallback_reason: str,
        *,
        provider_name: str,
        error_code: str | None = None,
        error_message: str | None = None,
        latency_ms: float | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "ProviderResponse":
        return cls(
            success=False,
            provider_name=provider_name,
            latency_ms=latency_ms,
            fallback_reason=fallback_reason,
            error_code=error_code or fallback_reason,
            error_message=error_message,
            metadata=metadata or {},
        )
