from __future__ import annotations

from time import perf_counter
from typing import Any

import httpx

from .base import LLMProvider
from .provider_request import ProviderRequest
from .provider_response import ProviderResponse
from .result import ProviderHealth

SYSTEM_PROMPT = (
    "You are WeenTime AI Copilot in non-authoritative drafting mode. "
    "You may explain, summarize, clarify, or reformulate. "
    "You must not execute tools, approve requests, create HR actions, invent HR balances, "
    "invent attendance status, invent users, or claim backend action success. "
    "Business actions require ToolRegistry and confirmation outside the model."
)


class OllamaProvider(LLMProvider):
    def __init__(
        self,
        *,
        base_url: str = "http://localhost:11434",
        model: str = "qwen2.5:3b",
        fallback_model: str | None = None,
        timeout_seconds: float = 20.0,
        max_tokens: int = 512,
        temperature: float = 0.2,
        local_device: str = "cpu",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or "http://localhost:11434").rstrip("/")
        self.model = model or "qwen2.5:3b"
        self.fallback_model = (fallback_model or "").strip() or None
        self.timeout_seconds = max(0.1, float(timeout_seconds or 20.0))
        self.max_tokens = max(1, int(max_tokens or 512))
        self.temperature = float(temperature if temperature is not None else 0.2)
        self.local_device = (local_device or "cpu").strip().lower()
        self.transport = transport

    def provider_name(self) -> str:
        return "ollama"

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        response = await self._generate_with_model(self.model, request)
        if response.success or not self.fallback_model or self.fallback_model == self.model:
            return response
        if response.error_code not in {"provider_timeout", "provider_unavailable"}:
            fallback_response = await self._generate_with_model(self.fallback_model, request)
            if fallback_response.success:
                fallback_response.metadata["fallback_model_used"] = True
                return fallback_response
        return response

    async def health(self) -> ProviderHealth:
        started = perf_counter()
        try:
            async with self._client() as client:
                response = await client.get("/api/tags")
            latency_ms = round((perf_counter() - started) * 1000, 2)
            ok = response.status_code < 500
            return ProviderHealth(
                ok=ok,
                provider_name=self.provider_name(),
                mode="ollama",
                status="available" if ok else "unavailable",
                message=None if ok else f"Ollama returned HTTP {response.status_code}.",
                model=self.model,
                latency_ms=latency_ms,
                supports_streaming=self.supports_streaming(),
                supports_tools=self.supports_tools(),
                details={"base_url": self.base_url, "device": self.local_device},
            )
        except httpx.TimeoutException:
            return ProviderHealth(
                ok=False,
                provider_name=self.provider_name(),
                mode="ollama",
                status="unavailable",
                message="Ollama health check timed out.",
                model=self.model,
                supports_streaming=self.supports_streaming(),
                supports_tools=self.supports_tools(),
                details={"base_url": self.base_url, "device": self.local_device},
            )
        except httpx.RequestError:
            return ProviderHealth(
                ok=False,
                provider_name=self.provider_name(),
                mode="ollama",
                status="unavailable",
                message="Ollama is not reachable.",
                model=self.model,
                supports_streaming=self.supports_streaming(),
                supports_tools=self.supports_tools(),
                details={"base_url": self.base_url, "device": self.local_device},
            )

    def supports_streaming(self) -> bool:
        return False

    def supports_tools(self) -> bool:
        return False

    async def _generate_with_model(self, model: str, request: ProviderRequest) -> ProviderResponse:
        started = perf_counter()
        try:
            async with self._client() as client:
                response = await client.post("/api/chat", json=self._payload(model, request))
        except httpx.TimeoutException:
            return ProviderResponse.fail(
                "provider_timeout",
                provider_name=self.provider_name(),
                error_code="provider_timeout",
                error_message="Ollama request timed out.",
                latency_ms=round((perf_counter() - started) * 1000, 2),
                metadata={"model": model},
            )
        except httpx.RequestError:
            return ProviderResponse.fail(
                "provider_unavailable",
                provider_name=self.provider_name(),
                error_code="provider_unavailable",
                error_message="Ollama is not reachable.",
                latency_ms=round((perf_counter() - started) * 1000, 2),
                metadata={"model": model},
            )

        latency_ms = round((perf_counter() - started) * 1000, 2)
        if response.status_code >= 500:
            return ProviderResponse.fail(
                "provider_unavailable",
                provider_name=self.provider_name(),
                error_code="provider_unavailable",
                error_message=f"Ollama returned HTTP {response.status_code}.",
                latency_ms=latency_ms,
                metadata={"model": model, "status_code": response.status_code},
            )
        if response.status_code >= 400:
            return ProviderResponse.fail(
                "provider_invalid_output",
                provider_name=self.provider_name(),
                error_code="provider_invalid_output",
                error_message=f"Ollama rejected request with HTTP {response.status_code}.",
                latency_ms=latency_ms,
                metadata={"model": model, "status_code": response.status_code},
            )

        try:
            payload = response.json()
        except ValueError:
            return ProviderResponse.fail(
                "provider_invalid_output",
                provider_name=self.provider_name(),
                error_code="provider_invalid_output",
                error_message="Ollama returned invalid JSON.",
                latency_ms=latency_ms,
                metadata={"model": model},
            )

        text = self._extract_text(payload)
        if not text:
            return ProviderResponse.fail(
                "provider_invalid_output",
                provider_name=self.provider_name(),
                error_code="provider_invalid_output",
                error_message="Ollama returned an empty response.",
                latency_ms=latency_ms,
                metadata={"model": model},
            )
        return ProviderResponse.ok(
            text,
            provider_name=self.provider_name(),
            model=model,
            latency_ms=latency_ms,
            finish_reason=str(payload.get("done_reason") or payload.get("finish_reason") or "") or None,
            metadata={"model": model, "device": self.local_device},
        )

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout_seconds, transport=self.transport)

    def _payload(self, model: str, request: ProviderRequest) -> dict[str, Any]:
        context = request.context.model_dump(mode="json")
        safe_context = {
            "role": context.get("role"),
            "language": context.get("language"),
            "locale": context.get("locale"),
            "channel": context.get("channel"),
            "intent": context.get("intent"),
            "tenant_present": context.get("tenant_present"),
        }
        user_content = (
            f"Safe context: {safe_context}\n\n"
            f"User request:\n{request.prompt}\n\n"
            "Return plain text only. Do not return tool calls."
        )
        return {
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            },
        }

    @staticmethod
    def _extract_text(payload: dict[str, Any]) -> str:
        message = payload.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str):
                return content.strip()
        response = payload.get("response")
        if isinstance(response, str):
            return response.strip()
        content = payload.get("content")
        if isinstance(content, str):
            return content.strip()
        return ""
