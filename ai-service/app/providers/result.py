from __future__ import annotations

from pydantic import BaseModel, Field


class ProviderHealth(BaseModel):
    ok: bool
    provider_name: str
    mode: str
    status: str
    message: str | None = None
    model: str | None = None
    latency_ms: float | None = None
    supports_streaming: bool = False
    supports_tools: bool = False
    details: dict = Field(default_factory=dict)
