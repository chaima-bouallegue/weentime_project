from __future__ import annotations

from abc import ABC, abstractmethod

from .provider_request import ProviderRequest
from .provider_response import ProviderResponse
from .result import ProviderHealth


class LLMProvider(ABC):
    @abstractmethod
    def provider_name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        raise NotImplementedError

    @abstractmethod
    async def health(self) -> ProviderHealth:
        raise NotImplementedError

    def supports_streaming(self) -> bool:
        return False

    def supports_tools(self) -> bool:
        return False
