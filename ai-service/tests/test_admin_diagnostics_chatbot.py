"""AI-FE-MASTER-CHATBOT-01 — Admin diagnostics tools return tool-backed reports.

The chatbot's "AI provider status", "Redis status", "Braintrust status",
"System health" and "Tenant configuration issues" prompts must produce
deterministic actionResult.kind=*_status_report responses derived from
local settings, not LLM invention. These tests pin that behaviour.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from pydantic import BaseModel

from app.context.current_user import CurrentUserContext
from app.tools.admin_tools import AdminTools


class _FakeBackend:
    """Backend client double — admin diagnostics tools must not call it."""

    async def get(self, *args, **kwargs):  # pragma: no cover - explicit
        raise AssertionError("Diagnostic tools must not hit the backend.")

    async def post(self, *args, **kwargs):  # pragma: no cover - explicit
        raise AssertionError("Diagnostic tools must not hit the backend.")


def _admin_context() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=1,
        role="ADMIN",
        entreprise_id=1,
        token=None,
        metadata={"chatbot_public_context": True, "jwt_verified": False},
    )


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class _EmptyInput(BaseModel):
    pass


def test_provider_status_returns_provider_status_report() -> None:
    tools = AdminTools(_FakeBackend())
    result = _run(tools.provider_status(_EmptyInput(), _admin_context()))
    assert result.success
    data = result.data["read_result"]["data"]
    assert data["kind"] == "provider_status_report"
    assert "provider" in data
    assert "mode" in data["provider"]


def test_redis_status_returns_redis_status_report() -> None:
    tools = AdminTools(_FakeBackend())
    result = _run(tools.redis_status(_EmptyInput(), _admin_context()))
    assert result.success
    data = result.data["read_result"]["data"]
    assert data["kind"] == "redis_status_report"
    assert "enabled" in data["redis"]


def test_braintrust_status_does_not_leak_api_key() -> None:
    tools = AdminTools(_FakeBackend())
    result = _run(tools.braintrust_status(_EmptyInput(), _admin_context()))
    assert result.success
    data = result.data["read_result"]["data"]
    assert data["kind"] == "braintrust_status_report"
    # Defence in depth — only the boolean is exposed, never the raw key.
    assert "apiKey" not in data["braintrust"]
    assert "apiKeyConfigured" in data["braintrust"]


def test_rag_status_reports_provider_and_chroma_flag() -> None:
    tools = AdminTools(_FakeBackend())
    result = _run(tools.rag_status(_EmptyInput(), _admin_context()))
    assert result.success
    data = result.data["read_result"]["data"]
    assert data["kind"] == "rag_status_report"
    assert "chromaEnabled" in data["rag"]
    assert "provider" in data["rag"]


def test_system_health_in_chatbot_public_context_skips_backend() -> None:
    tools = AdminTools(_FakeBackend())
    result = _run(tools.system_health(_EmptyInput(), _admin_context()))
    assert result.success, "Local-only fallback must succeed without a backend call."
    data = result.data["read_result"]["data"]
    assert data["kind"] == "system_health_report"
    assert data["scope"] == "local_only"
    # Components must include ai_provider so admin sees model + mode at a glance.
    services = [c["service"] for c in data["components"]]
    assert "ai_provider" in services
    assert "redis" in services
    assert "braintrust" in services
    assert "rag" in services
