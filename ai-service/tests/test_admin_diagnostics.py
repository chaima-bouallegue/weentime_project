from __future__ import annotations

from app.intelligence.admin_diagnostics import AdminDiagnostics, redact_secrets


def section(tool_name: str, *, count: int = 0, status: str = "ok", items=None, summary: str | None = None):
    return {
        "title": tool_name,
        "summary": summary or f"summary:{tool_name}",
        "status": status,
        "toolName": tool_name,
        "count": count,
        "items": items or [],
        "data": {},
    }


def runtime_status(**overrides):
    values = {
        "provider": {
            "mode": "ollama",
            "chatModel": "qwen2.5:3b",
            "coderModel": "qwen2.5-coder:3b-instruct",
            "fallbackModel": "phi3",
            "cpuMode": True,
            "availability": None,
        },
        "redis": {"enabled": False, "mode": "noop", "channel": "ai.events.generated", "sdk_available": True},
        "rag": {
            "provider": "local_keyword",
            "chromaEnabled": False,
            "collectionName": "weentime_policy",
            "topK": 5,
            "citationRequired": True,
            "tenantFilterRequired": True,
        },
        "optionalRouters": [{"module": "app.api.document_generation", "moduleStatus": "UNAVAILABLE"}],
        "configuration": {"legacyCloudProviderPlaceholder": False},
    }
    values.update(overrides)
    return values


def test_admin_diagnostics_include_provider_redis_and_rag_status() -> None:
    diagnostics = AdminDiagnostics().build_admin_diagnostics(
        [section("admin.system_health", count=1)],
        runtime_status=runtime_status(),
    )

    types = {item.type for item in diagnostics}
    assert "provider_status" in types
    assert "redis_realtime_status" in types
    assert "rag_status" in types
    provider = next(item for item in diagnostics if item.type == "provider_status")
    assert provider.evidence["chatModel"] == "qwen2.5:3b"
    assert provider.evidence["cpuMode"] is True


def test_admin_diagnostics_flag_misconfigured_users_without_writes() -> None:
    diagnostics = AdminDiagnostics().build_admin_diagnostics(
        [
            section(
                "admin.misconfigured_users",
                count=2,
                items=[{"id": 10, "issues": ["company_missing"]}, {"id": 11, "issues": ["not_exactly_one_role"]}],
            )
        ],
        runtime_status=runtime_status(optionalRouters=[]),
    )

    item = next(item for item in diagnostics if item.type == "user_configuration")
    assert item.severity == "warning"
    assert item.evidence["misconfiguredCount"] == 2
    assert item.requires_confirmation is False
    assert "admin.misconfigured_users" in item.source_tools


def test_admin_diagnostics_represent_unavailable_optional_router_safely() -> None:
    diagnostics = AdminDiagnostics().build_admin_diagnostics([], runtime_status=runtime_status())

    item = next(item for item in diagnostics if item.type == "optional_router_warning")
    assert item.severity == "warning"
    assert item.evidence["missingModules"] == ["app.api.document_generation"]


def test_admin_diagnostics_redact_secrets_recursively() -> None:
    raw = {
        "jwt": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456789",
        "db": "postgres://user:password@localhost:5432/ween",
        "key": "sk-1234567890abcdef",
        "nested": [{"url": "redis://:secret@localhost:6379/0"}],
    }

    redacted = redact_secrets(raw)

    text = str(redacted)
    assert "eyJhbGci" not in text
    assert "postgres://" not in text
    assert "redis://" not in text
    assert "sk-123" not in text
    assert "[REDACTED]" in text
