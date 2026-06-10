from __future__ import annotations

from time import perf_counter
from typing import Any

import httpx

from app.observability.braintrust_client import log_ollama_interaction

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
    " Always answer in the same language/dialect as the user's latest message. "
    "Use response_language from context. Do not translate to French by default. "
    "For Tunisian dialect, use Latin script if the user used Latin script and Arabic script if the user used Arabic script."
)


class OllamaProvider(LLMProvider):
    def __init__(
        self,
        *,
        base_url: str = "http://localhost:11434",
        model: str = "qwen2.5:3b",
        coder_model: str = "qwen2.5-coder:3b-instruct",
        fallback_model: str | None = None,
        timeout_seconds: float = 20.0,
        max_tokens: int = 512,
        temperature: float = 0.2,
        local_device: str = "cpu",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or "http://localhost:11434").rstrip("/")
        self.model = model or "qwen2.5:3b"
        self.coder_model = (coder_model or "qwen2.5-coder:3b-instruct").strip()
        self.fallback_model = (fallback_model or "").strip() or None
        self.timeout_seconds = max(0.1, float(timeout_seconds or 20.0))
        self.max_tokens = max(1, int(max_tokens or 512))
        self.temperature = float(temperature if temperature is not None else 0.2)
        self.local_device = (local_device or "cpu").strip().lower()
        self.transport = transport

    def provider_name(self) -> str:
        return "ollama"

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        total_started = perf_counter()
        selected_model = self._model_for_request(request)
        fallback_model = str(request.metadata.get("fallback_model") or self.fallback_model or "").strip() or None
        response = await self._generate_with_model(selected_model, request, fallback_used=False)
        if response.success or not fallback_model or fallback_model == selected_model:
            response.metadata.setdefault("total_latency_ms", round((perf_counter() - total_started) * 1000, 2))
            return response
        if response.error_code != "provider_timeout":
            fallback_response = await self._generate_with_model(fallback_model, request, fallback_used=True)
            if fallback_response.success:
                fallback_response.metadata["fallback_model_used"] = True
                fallback_response.metadata["primary_model_failed"] = selected_model
                fallback_response.metadata["total_latency_ms"] = round((perf_counter() - total_started) * 1000, 2)
                fallback_response.latency_ms = fallback_response.metadata["total_latency_ms"]
                return fallback_response
        response.metadata.setdefault("total_latency_ms", round((perf_counter() - total_started) * 1000, 2))
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
                details={
                    "base_url": self.base_url,
                    "device": self.local_device,
                    "cpu_mode_enabled": self.local_device == "cpu",
                    "chat_model": self.model,
                    "coder_model": self.coder_model,
                    "fallback_model": self.fallback_model,
                },
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
                details={
                    "base_url": self.base_url,
                    "device": self.local_device,
                    "cpu_mode_enabled": self.local_device == "cpu",
                    "chat_model": self.model,
                    "coder_model": self.coder_model,
                    "fallback_model": self.fallback_model,
                },
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
                details={
                    "base_url": self.base_url,
                    "device": self.local_device,
                    "cpu_mode_enabled": self.local_device == "cpu",
                    "chat_model": self.model,
                    "coder_model": self.coder_model,
                    "fallback_model": self.fallback_model,
                },
            )

    def supports_streaming(self) -> bool:
        return False

    def supports_tools(self) -> bool:
        return False

    def _model_for_request(self, request: ProviderRequest) -> str:
        override = str(request.metadata.get("model_override") or "").strip()
        if override:
            return override
        role = str(request.metadata.get("model_role") or "").strip().lower()
        return self.coder_model if role in {"coder", "coding", "debug"} else self.model

    async def _generate_with_model(
        self,
        model: str,
        request: ProviderRequest,
        *,
        fallback_used: bool,
    ) -> ProviderResponse:
        started = perf_counter()
        timeout_seconds = _float_metadata(request.metadata.get("timeout_seconds"), self.timeout_seconds)
        max_tokens = max(1, int(_float_metadata(request.metadata.get("max_tokens"), self.max_tokens)))
        temperature = _float_metadata(request.metadata.get("temperature"), self.temperature)
        payload = self._payload(model, request)
        try:
            async with self._client(timeout_seconds=timeout_seconds) as client:
                response = await client.post("/api/chat", json=payload)
        except httpx.TimeoutException as exc:
            result = ProviderResponse.fail(
                "provider_timeout",
                provider_name=self.provider_name(),
                error_code="provider_timeout",
                error_message="Ollama request timed out.",
                latency_ms=round((perf_counter() - started) * 1000, 2),
                metadata={"model": model},
            )
            self._trace_interaction(
                request,
                result,
                model=model,
                fallback_used=fallback_used,
                timeout_seconds=timeout_seconds,
                max_tokens=max_tokens,
                temperature=temperature,
                error_type=exc.__class__.__name__,
            )
            return result
        except httpx.RequestError as exc:
            result = ProviderResponse.fail(
                "provider_unavailable",
                provider_name=self.provider_name(),
                error_code="provider_unavailable",
                error_message="Ollama is not reachable.",
                latency_ms=round((perf_counter() - started) * 1000, 2),
                metadata={"model": model},
            )
            self._trace_interaction(
                request,
                result,
                model=model,
                fallback_used=fallback_used,
                timeout_seconds=timeout_seconds,
                max_tokens=max_tokens,
                temperature=temperature,
                error_type=exc.__class__.__name__,
            )
            return result

        latency_ms = round((perf_counter() - started) * 1000, 2)
        if response.status_code >= 500:
            result = ProviderResponse.fail(
                "provider_unavailable",
                provider_name=self.provider_name(),
                error_code="provider_unavailable",
                error_message=f"Ollama returned HTTP {response.status_code}.",
                latency_ms=latency_ms,
                metadata={"model": model, "status_code": response.status_code},
            )
            self._trace_interaction(
                request,
                result,
                model=model,
                fallback_used=fallback_used,
                timeout_seconds=timeout_seconds,
                max_tokens=max_tokens,
                temperature=temperature,
                error_type="OllamaHTTPError",
            )
            return result
        if response.status_code >= 400:
            result = ProviderResponse.fail(
                "provider_invalid_output",
                provider_name=self.provider_name(),
                error_code="provider_invalid_output",
                error_message=f"Ollama rejected request with HTTP {response.status_code}.",
                latency_ms=latency_ms,
                metadata={"model": model, "status_code": response.status_code},
            )
            self._trace_interaction(
                request,
                result,
                model=model,
                fallback_used=fallback_used,
                timeout_seconds=timeout_seconds,
                max_tokens=max_tokens,
                temperature=temperature,
                error_type="OllamaHTTPError",
            )
            return result

        try:
            payload = response.json()
        except ValueError as exc:
            result = ProviderResponse.fail(
                "provider_invalid_output",
                provider_name=self.provider_name(),
                error_code="provider_invalid_output",
                error_message="Ollama returned invalid JSON.",
                latency_ms=latency_ms,
                metadata={"model": model},
            )
            self._trace_interaction(
                request,
                result,
                model=model,
                fallback_used=fallback_used,
                timeout_seconds=timeout_seconds,
                max_tokens=max_tokens,
                temperature=temperature,
                error_type=exc.__class__.__name__,
            )
            return result

        text = self._extract_text(payload)
        if not text:
            result = ProviderResponse.fail(
                "provider_invalid_output",
                provider_name=self.provider_name(),
                error_code="provider_invalid_output",
                error_message="Ollama returned an empty response.",
                latency_ms=latency_ms,
                metadata={"model": model},
            )
            self._trace_interaction(
                request,
                result,
                model=model,
                fallback_used=fallback_used,
                timeout_seconds=timeout_seconds,
                max_tokens=max_tokens,
                temperature=temperature,
                error_type="EmptyOllamaResponse",
            )
            return result
        result = ProviderResponse.ok(
            text,
            provider_name=self.provider_name(),
            model=model,
            latency_ms=latency_ms,
            finish_reason=str(payload.get("done_reason") or payload.get("finish_reason") or "") or None,
            metadata={"model": model, "device": self.local_device},
        )
        self._trace_interaction(
            request,
            result,
            model=model,
            fallback_used=fallback_used,
            timeout_seconds=timeout_seconds,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return result

    def _client(self, *, timeout_seconds: float | None = None) -> httpx.AsyncClient:
        timeout = max(0.1, float(timeout_seconds if timeout_seconds is not None else self.timeout_seconds))
        return httpx.AsyncClient(base_url=self.base_url, timeout=timeout, transport=self.transport)

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
        max_tokens = max(1, int(_float_metadata(request.metadata.get("max_tokens"), self.max_tokens)))
        temperature = _float_metadata(request.metadata.get("temperature"), self.temperature)
        return {
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

    def _trace_interaction(
        self,
        request: ProviderRequest,
        response: ProviderResponse,
        *,
        model: str,
        fallback_used: bool,
        timeout_seconds: float,
        max_tokens: int,
        temperature: float,
        error_type: str | None = None,
    ) -> None:
        channel = str(request.context.channel or "chat").lower()
        log_ollama_interaction(
            input_text=request.prompt,
            output_text=response.text,
            model=model,
            module=str(request.metadata.get("module") or "ollama_provider"),
            role=request.context.role,
            intent=request.context.intent,
            language=request.context.language,
            tenant_id=request.context.tenant_id,
            company_id=request.context.company_id,
            user_id=request.context.user_id,
            latency_ms=response.latency_ms,
            status="success" if response.success else "error",
            error_type=error_type or response.error_code,
            error_message=response.error_message,
            endpoint="/api/chat",
            request_id=request.context.request_id,
            channel="voice" if channel == "voice" else "text",
            fallback_used=fallback_used,
            timeout=response.error_code == "provider_timeout",
            max_tokens=max_tokens,
            temperature=temperature,
            metadata_extra={
                "base_url": self.base_url,
                "timeout_seconds": timeout_seconds,
                "model_role": request.metadata.get("model_role"),
                "selected_agent": request.metadata.get("selected_agent"),
                "application_endpoint": "/v2/voice" if channel == "voice" else "/v2/chat",
                "device": self.local_device,
                "finish_reason": response.finish_reason,
            },
        )

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


def _float_metadata(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(fallback)
