from __future__ import annotations

from app.observability.metrics import (
    record_confirmation_event,
    record_provider_event,
    record_rag_event,
    record_tool_event,
    record_voice_event,
    reset_metrics_for_tests,
    snapshot_metrics,
)
from app.observability.monitoring import build_ai_monitoring_snapshot


class Settings:
    ai_provider_mode = "ollama"
    ollama_model = "qwen2.5:3b"
    ollama_coder_model = "qwen2.5-coder:3b-instruct"
    ollama_fallback_model = "phi3"
    ai_local_device = "cpu"
    rag_provider = "chromadb"
    chroma_enabled = True
    rag_require_citations = True
    rag_tenant_filter_required = True
    redis_enabled = False
    redis_url = "redis://localhost:6379"
    redis_events_channel = "weentime.events"


def test_observability_metrics_capture_runtime_domains():
    reset_metrics_for_tests()
    record_provider_event(provider="ollama", mode="ollama", model="qwen2.5:3b", latency_ms=10, success=True)
    record_tool_event(tool_name="leave.get_balance", category="leave", role="EMPLOYEE", tenant_id=9, success=True, status="success", latency_ms=5)
    record_rag_event(provider="chromadb", tenant_id=9, retrieved_docs_count=2, citation_count=2, fallback_used=False, duration_ms=7)
    record_voice_event(stage="stt", language="fr", duration_ms=20, audio_duration_seconds=1.2, success=True)
    record_confirmation_event(action="created", tool_name="leave.create", status="pending", tenant_id=9)

    snapshot = snapshot_metrics()
    keys = " ".join(snapshot["counters"].keys())
    assert "provider.request" in keys
    assert "tool.execution" in keys
    assert "rag.retrieval" in keys
    assert "voice.pipeline" in keys
    assert "confirmation.flow" in keys


def test_monitoring_snapshot_is_safe_and_includes_provider_rag_redis():
    reset_metrics_for_tests()
    snapshot = build_ai_monitoring_snapshot(Settings())

    assert snapshot["provider"]["chat_model"] == "qwen2.5:3b"
    assert snapshot["rag"]["chroma_enabled"] is True
    assert "redis://" not in str(snapshot)
    assert "braintrust" in snapshot
