from __future__ import annotations

from app.intelligence.admin_diagnostics import AdminDiagnostics, collect_admin_runtime_status
from app.observability.metrics import record_provider_event, reset_metrics_for_tests
from app.observability.monitoring import build_ai_monitoring_snapshot


class Settings:
    ai_provider_mode = "ollama"
    ollama_model = "qwen2.5:3b"
    ollama_coder_model = "qwen2.5-coder:3b-instruct"
    ollama_fallback_model = "phi3"
    ai_local_device = "cpu"
    rag_provider = "chromadb"
    chroma_enabled = True
    chroma_collection_name = "weentime_policy"
    chroma_top_k = 5
    rag_require_citations = True
    rag_tenant_filter_required = True
    redis_enabled = False
    redis_url = "redis://localhost:6379"
    redis_events_channel = "weentime.events"
    backend_base_url = "http://localhost:8322/api/v1"
    gemini_api_key = None


def test_admin_monitoring_snapshot_never_exposes_secret_urls():
    reset_metrics_for_tests()
    snapshot = build_ai_monitoring_snapshot(Settings())

    assert snapshot["provider"]["chat_model"] == "qwen2.5:3b"
    assert "redis://" not in str(snapshot)


def test_admin_diagnostics_include_braintrust_and_ai_monitoring():
    reset_metrics_for_tests()
    record_provider_event(provider="ollama", mode="ollama", model="qwen2.5:3b", latency_ms=4, success=True)
    diagnostics = AdminDiagnostics().build_admin_diagnostics([], runtime_status=collect_admin_runtime_status(Settings()))
    ids = {item.id for item in diagnostics}

    assert "admin-braintrust-status" in ids
    assert "admin-ai-monitoring-status" in ids
    assert all(item.requires_confirmation is False for item in diagnostics)
