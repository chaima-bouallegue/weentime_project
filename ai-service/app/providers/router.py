from __future__ import annotations

from time import perf_counter
from typing import Any

from app.context.current_user import CurrentUserContext
from app.core.deterministic_fallback import deterministic_fallback_response
from app.models.agent_models import AgentResponse
from app.observability.metrics import record_provider_event
from app.observability.tracing import log_error, log_event, start_span

from .base import LLMProvider
from .disabled_provider import DisabledProvider
from .ollama_provider import OllamaProvider
from .provider_request import ProviderRequest
from .provider_response import ProviderResponse
from .result import ProviderHealth
from .types import SUPPORTED_PROVIDER_MODES


class ProviderRouter:
    def __init__(
        self,
        *,
        mode: str = "disabled",
        providers: dict[str, LLMProvider] | None = None,
        timeout_seconds: float = 20.0,
        default_model: str | None = None,
        optional_model: str | None = None,
        coder_model: str | None = None,
        fallback_model: str | None = None,
    ) -> None:
        raw_mode = (mode or "disabled").strip().lower()
        self.mode_error: str | None = None
        if raw_mode not in SUPPORTED_PROVIDER_MODES:
            self.mode = "disabled"
            self.mode_error = f"unsupported_provider_mode:{raw_mode}"
        else:
            self.mode = raw_mode
        self.timeout_seconds = max(0.1, float(timeout_seconds or 20.0))
        self.default_model = default_model
        self.optional_model = optional_model
        self.coder_model = coder_model
        self.fallback_model = fallback_model
        self.providers = {"disabled": DisabledProvider(), **(providers or {})}
        if self.mode in {"ollama", "cloud"} and self.mode not in self.providers:
            self.mode_error = f"provider_not_configured:{self.mode}"
            self.mode = "disabled"

    @classmethod
    def from_settings(cls, settings: Any | None = None, *, providers: dict[str, LLMProvider] | None = None) -> "ProviderRouter":
        resolved_providers = dict(providers or {})
        mode = str(getattr(settings, "ai_provider_mode", "disabled") if settings else "disabled").strip().lower()
        if mode == "ollama" and "ollama" not in resolved_providers:
            resolved_providers["ollama"] = OllamaProvider(
                base_url=str(getattr(settings, "ollama_base_url", "http://localhost:11434") if settings else "http://localhost:11434"),
                model=str(getattr(settings, "ollama_model", "qwen2.5:3b") if settings else "qwen2.5:3b"),
                coder_model=str(getattr(settings, "ollama_coder_model", "qwen2.5-coder:3b-instruct") if settings else "qwen2.5-coder:3b-instruct"),
                fallback_model=getattr(settings, "ollama_fallback_model", None) if settings else None,
                timeout_seconds=float(getattr(settings, "ollama_timeout_seconds", 20.0) if settings else 20.0),
                max_tokens=int(getattr(settings, "ollama_max_tokens", 512) if settings else 512),
                temperature=float(getattr(settings, "ollama_temperature", 0.2) if settings else 0.2),
                local_device=str(getattr(settings, "ai_local_device", "cpu") if settings else "cpu"),
            )
        return cls(
            mode=mode,
            providers=resolved_providers,
            timeout_seconds=float(getattr(settings, "ai_provider_timeout_seconds", 20.0) if settings else 20.0),
            default_model=getattr(settings, "ai_provider_model", None) if settings else None,
            optional_model=getattr(settings, "ai_provider_optional_model", None) if settings else None,
            coder_model=str(getattr(settings, "ollama_coder_model", "qwen2.5-coder:3b-instruct") if settings else "qwen2.5-coder:3b-instruct"),
            fallback_model=str(getattr(settings, "ollama_fallback_model", "phi3") if settings else "phi3"),
        )

    def selected_provider(self) -> LLMProvider:
        return self.providers.get(self.mode) or self.providers["disabled"]

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        provider = self.selected_provider()
        request = self._route_request(request)
        if self.mode_error:
            log_event("provider.mode_invalid", metadata={"mode": self.mode, "mode_error": self.mode_error})
            record_provider_event(
                provider=provider.provider_name(),
                mode=self.mode,
                model=request.metadata.get("model_override"),
                fallback_reason="provider_disabled",
                success=False,
            )
            return ProviderResponse.fail(
                "provider_disabled",
                provider_name=provider.provider_name(),
                error_code="unsupported_provider_mode",
                error_message="Provider mode is not supported or not configured.",
                metadata={"mode_error": self.mode_error, "request_id": request.context.request_id},
            )

        started = perf_counter()
        with start_span(
            "provider.request",
            {
                "provider": provider.provider_name(),
                "mode": self.mode,
                "request_id": request.context.request_id,
                "prompt_length": len(request.prompt or ""),
                "model": request.metadata.get("model_override"),
                "model_role": request.metadata.get("model_role"),
            },
        ):
            try:
                response = await provider.generate(request)
            except TimeoutError as exc:
                latency_ms = round((perf_counter() - started) * 1000, 2)
                log_error("provider.timeout", exc, {"provider": provider.provider_name(), "latency_ms": latency_ms})
                record_provider_event(
                    provider=provider.provider_name(),
                    mode=self.mode,
                    model=request.metadata.get("model_override"),
                    fallback_reason="provider_timeout",
                    latency_ms=latency_ms,
                    success=False,
                )
                return ProviderResponse.fail(
                    "provider_timeout",
                    provider_name=provider.provider_name(),
                    error_code="provider_timeout",
                    error_message="Provider timed out.",
                    latency_ms=latency_ms,
                )
            except Exception as exc:  # noqa: BLE001
                latency_ms = round((perf_counter() - started) * 1000, 2)
                log_error("provider.error", exc, {"provider": provider.provider_name(), "latency_ms": latency_ms})
                record_provider_event(
                    provider=provider.provider_name(),
                    mode=self.mode,
                    model=request.metadata.get("model_override"),
                    fallback_reason="provider_unavailable",
                    latency_ms=latency_ms,
                    success=False,
                )
                return ProviderResponse.fail(
                    "provider_unavailable",
                    provider_name=provider.provider_name(),
                    error_code="provider_unavailable",
                    error_message="Provider unavailable.",
                    latency_ms=latency_ms,
                )

        latency_ms = response.latency_ms if response.latency_ms is not None else round((perf_counter() - started) * 1000, 2)
        response.latency_ms = latency_ms
        log_event(
            "provider.response",
            metadata={
                "provider": response.provider_name,
                "mode": self.mode,
                "success": response.success,
                "latency_ms": latency_ms,
                "fallback_reason": response.fallback_reason,
                "request_id": request.context.request_id,
                "model": response.model or request.metadata.get("model_override"),
                "model_role": request.metadata.get("model_role"),
            },
        )
        record_provider_event(
            provider=response.provider_name,
            mode=self.mode,
            model=response.model or request.metadata.get("model_override"),
            fallback_reason=response.fallback_reason,
            latency_ms=latency_ms,
            success=response.success,
        )
        return response

    def _route_request(self, request: ProviderRequest) -> ProviderRequest:
        if self.mode != "ollama":
            return request
        model_role = "coder" if _is_coding_request(request) else "chat"
        selected_model = self.coder_model if model_role == "coder" else self.default_model
        metadata = dict(request.metadata or {})
        metadata.setdefault("model_role", model_role)
        if selected_model:
            metadata.setdefault("model_override", selected_model)
        if self.fallback_model:
            metadata.setdefault("fallback_model", self.fallback_model)
        return request.model_copy(update={"metadata": metadata})

    async def generate_agent_response(
        self,
        request: ProviderRequest,
        *,
        context: CurrentUserContext | None = None,
        response_guard: Any | None = None,
    ) -> AgentResponse:
        provider_response = await self.generate(request)
        if not provider_response.success:
            fallback_reason = provider_response.fallback_reason or "provider_unavailable"
            return deterministic_fallback_response(fallback_reason, context=context, safe_response_type="deterministic")

        candidate = AgentResponse(
            type="answer",
            text=provider_response.text,
            intent="provider.response",
            confidence=0.0,
            requiresConfirmation=False,
            confirmationId=None,
            toolCalls=[],
            actionResult={
                "kind": "provider_response",
                "authoritative": False,
                "providerName": provider_response.provider_name,
                "model": provider_response.model,
                "latencyMs": provider_response.latency_ms,
            },
        )
        if response_guard is not None and hasattr(response_guard, "guard_response"):
            guarded = response_guard.guard_response(candidate, context)
            if guarded.actionResult and isinstance(guarded.actionResult, dict):
                guarded.actionResult.setdefault("provider_used", provider_response.provider_name)
            return guarded
        return candidate

    async def health(self) -> ProviderHealth:
        provider = self.selected_provider()
        if self.mode_error:
            return ProviderHealth(
                ok=False,
                provider_name=provider.provider_name(),
                mode=self.mode,
                status="error",
                message=self.mode_error,
                model=self.default_model,
                supports_streaming=provider.supports_streaming(),
                supports_tools=provider.supports_tools(),
            )
        return await provider.health()


_CODING_INTENT_MARKERS = (
    "code",
    "coding",
    "debug",
    "stacktrace",
    "traceback",
    "bug",
    "architecture_debug",
    "developer",
)

_CODING_PROMPT_MARKERS = (
    "stacktrace",
    "traceback",
    "bug",
    "fix this code",
    "code explanation",
    "explain this code",
    "debug",
    "exception",
    "compile error",
    "typescript",
    "python",
    "java",
    "spring boot",
    "fastapi",
    "angular",
)


def _is_coding_request(request: ProviderRequest) -> bool:
    intent = str(request.context.intent or "").lower()
    prompt = str(request.prompt or "").lower()
    metadata = request.metadata if isinstance(request.metadata, dict) else {}
    task_type = str(metadata.get("task_type") or metadata.get("model_role") or "").lower()
    return (
        task_type in {"coder", "coding", "debug"}
        or any(marker in intent for marker in _CODING_INTENT_MARKERS)
        or any(marker in prompt for marker in _CODING_PROMPT_MARKERS)
    )
