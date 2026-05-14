from __future__ import annotations

from .base import LLMProvider
from .provider_request import ProviderRequest
from .provider_response import ProviderResponse
from .result import ProviderHealth


class DisabledProvider(LLMProvider):
    def provider_name(self) -> str:
        return "disabled"

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        return ProviderResponse.fail(
            "provider_disabled",
            provider_name=self.provider_name(),
            error_code="provider_disabled",
            error_message="Provider mode is disabled.",
            metadata={"fallback_used": True, "request_id": request.context.request_id},
        )

    async def health(self) -> ProviderHealth:
        return ProviderHealth(
            ok=True,
            provider_name=self.provider_name(),
            mode="disabled",
            status="disabled",
            message="Provider router is disabled. Deterministic runtime remains authoritative.",
            supports_streaming=self.supports_streaming(),
            supports_tools=self.supports_tools(),
        )
