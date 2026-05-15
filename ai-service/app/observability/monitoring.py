from __future__ import annotations

from typing import Any

from app.events import get_redis_event_status

from .braintrust_client import get_braintrust_status
from .metrics import snapshot_metrics
from .redaction import redact_value


def build_ai_monitoring_snapshot(settings: Any | None = None) -> dict[str, Any]:
    metrics = snapshot_metrics()
    snapshot = {
        "braintrust": get_braintrust_status(),
        "provider": {
            "mode": getattr(settings, "ai_provider_mode", "disabled") if settings else "disabled",
            "chat_model": getattr(settings, "ollama_model", None) if settings else None,
            "coder_model": getattr(settings, "ollama_coder_model", None) if settings else None,
            "fallback_model": getattr(settings, "ollama_fallback_model", None) if settings else None,
            "device": getattr(settings, "ai_local_device", "cpu") if settings else "cpu",
        },
        "redis": get_redis_event_status(settings),
        "rag": {
            "provider": getattr(settings, "rag_provider", "local_keyword") if settings else "local_keyword",
            "chroma_enabled": bool(getattr(settings, "chroma_enabled", False)) if settings else False,
            "citation_required": bool(getattr(settings, "rag_require_citations", True)) if settings else True,
            "tenant_filter_required": bool(getattr(settings, "rag_tenant_filter_required", True)) if settings else True,
        },
        "metrics": metrics,
    }
    return redact_value(snapshot, log_inputs=True)
