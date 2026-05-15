from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.intelligence.admin_digest_builder import AdminDigestBuilder
from app.tools.result import ToolResult, build_read_result

pytestmark = pytest.mark.asyncio


class FakeExecutor:
    def __init__(self, results: dict[str, ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any], CurrentUserContext]] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append((tool_name, payload or {}, context))
        return self.results.get(tool_name) or read(tool_name, f"ok:{tool_name}")


def context(role: str = "ADMIN", *, tenant_id: int | None = None, verified: bool = True) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=7,
        role=role,
        entreprise_id=tenant_id,
        token="verified-token" if verified else None,
        language="fr",
        metadata={"jwt_verified": verified},
    )


def read(
    tool_name: str,
    summary: str,
    items: list[dict[str, Any]] | None = None,
    data: dict[str, Any] | None = None,
    *,
    count: int | None = None,
) -> ToolResult:
    items = items or []
    return ToolResult.ok(
        {
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=summary,
                items=items,
                count=len(items) if count is None else count,
                data=data or {},
                empty=not items and not data,
                backend_status=200,
            )
        },
        status_code=200,
    )


def runtime_status() -> dict[str, Any]:
    return {
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
        "optionalRouters": [],
        "configuration": {"legacyCloudProviderPlaceholder": False},
    }


async def test_admin_digest_uses_admin_read_tools_only() -> None:
    executor = FakeExecutor()
    digest = await AdminDigestBuilder(executor, runtime_status=runtime_status()).build_digest(context())

    calls = {call[0] for call in executor.calls}
    assert digest.role == "ADMIN"
    assert {
        "admin.system_health",
        "admin.misconfigured_users",
        "admin.list_users",
        "admin.list_enterprises",
    }.issubset(calls)
    assert not any(name.startswith("legacy.") for name in calls)
    assert not any(name in {"admin.create_user", "admin.update_user_role", "admin.assign_manager"} for name in calls)
    assert digest.to_dict()["requiresConfirmation"] is False


async def test_admin_digest_surfaces_governance_and_infra_diagnostics() -> None:
    executor = FakeExecutor(
        {
            "admin.misconfigured_users": read(
                "admin.misconfigured_users",
                "1 utilisateur mal configure",
                [{"id": 99, "issues": ["company_missing"]}],
            )
        }
    )

    digest = await AdminDigestBuilder(executor, runtime_status=runtime_status()).build_digest(context())

    reminder_types = {item["type"] for item in digest.reminders}
    assert "user_configuration" in reminder_types
    assert "provider_status" in reminder_types
    assert "redis_realtime_status" in reminder_types
    assert "rag_status" in reminder_types
    assert any(priority.type == "user_configuration" for priority in digest.priorities)


async def test_admin_digest_denies_non_admin_without_tool_calls() -> None:
    executor = FakeExecutor()
    digest = await AdminDigestBuilder(executor, runtime_status=runtime_status()).build_digest(context("EMPLOYEE", tenant_id=42))

    assert digest.role == "EMPLOYEE"
    assert digest.sections == []
    assert digest.tool_calls == []
    assert "admin_intelligence_requires_verified_admin" in digest.warnings


async def test_admin_digest_handles_backend_unavailable_cleanly() -> None:
    failure = ToolResult.fail(
        "backend_unavailable",
        "Service admin indisponible.",
        status_code=503,
        data={
            "read_result": build_read_result(
                tool_name="admin.system_health",
                summary="Service admin indisponible.",
                items=[],
                count=0,
                data={},
                empty=True,
                backend_status=503,
            )
        },
    )
    executor = FakeExecutor({"admin.system_health": failure})

    digest = await AdminDigestBuilder(executor, runtime_status=runtime_status()).build_digest(context())

    assert any(section.tool_name == "admin.system_health" and section.status == "unavailable" for section in digest.sections)
    assert any(item["type"] == "capability_unavailable" for item in digest.reminders)
    assert digest.warnings
