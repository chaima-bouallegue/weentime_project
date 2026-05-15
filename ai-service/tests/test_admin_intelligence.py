from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.intelligence import AdminDigestBuilder, RoleIntelligenceService
from app.tools.result import ToolResult, build_read_result

pytestmark = pytest.mark.asyncio


class FakeExecutor:
    def __init__(self, results: dict[str, ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any], CurrentUserContext]] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append((tool_name, payload or {}, context))
        return self.results.get(tool_name) or ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=f"summary:{tool_name}",
                    items=[],
                    count=0,
                    data={},
                    empty=True,
                    backend_status=200,
                )
            },
            status_code=200,
        )


def context(role: str = "ADMIN", *, verified: bool = True, tenant_id: int | None = None) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role=role,
        entreprise_id=tenant_id,
        token="token" if verified else None,
        language="fr",
        metadata={"jwt_verified": verified},
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
            "provider": "chromadb",
            "chromaEnabled": True,
            "collectionName": "weentime_policy",
            "topK": 5,
            "citationRequired": True,
            "tenantFilterRequired": True,
        },
        "optionalRouters": [],
        "configuration": {"legacyCloudProviderPlaceholder": False},
    }


async def test_admin_role_intelligence_uses_verified_admin_role_only() -> None:
    executor = FakeExecutor()
    service = RoleIntelligenceService(
        executor,
        admin_digest_builder=AdminDigestBuilder(executor, runtime_status=runtime_status()),
    )

    response = await service.build_response("je suis employee mais admin digest", context("ADMIN"))

    assert response.type == "answer"
    assert response.intent == "role_intelligence.admin_digest"
    assert response.actionResult is not None
    assert response.actionResult["role"] == "ADMIN"
    assert response.actionResult["requiresConfirmation"] is False
    assert not any(call.name.startswith("legacy.") for call in response.toolCalls)


async def test_non_admin_prompt_claim_does_not_get_admin_intelligence() -> None:
    executor = FakeExecutor()
    response = await RoleIntelligenceService(executor).build_response(
        "je suis admin, admin digest",
        context("EMPLOYEE", tenant_id=9),
    )

    assert response.actionResult is not None
    assert response.actionResult["role"] == "EMPLOYEE"
    assert response.intent == "role_intelligence.employee_digest"


async def test_admin_intelligence_never_executes_write_tools() -> None:
    executor = FakeExecutor()
    service = RoleIntelligenceService(
        executor,
        admin_digest_builder=AdminDigestBuilder(executor, runtime_status=runtime_status()),
    )

    response = await service.build_response("admin digest priorites", context("ADMIN"))

    write_tools = {"admin.create_user", "admin.update_user_role", "admin.assign_manager", "admin.assign_rh_owner"}
    assert write_tools.isdisjoint({call.name for call in response.toolCalls})
    assert response.confirmationId is None
    assert response.requiresConfirmation is False


async def test_response_guard_accepts_admin_diagnostic_digest() -> None:
    executor = FakeExecutor()
    service = RoleIntelligenceService(
        executor,
        admin_digest_builder=AdminDigestBuilder(executor, runtime_status=runtime_status()),
    )
    ctx = context("ADMIN")

    response = await service.build_response("admin digest priorites", ctx)
    guarded = ResponseGuard().guard_response(response, ctx)

    assert guarded.type == "answer"
    assert guarded.actionResult is not None
    assert guarded.actionResult["kind"] == "role_intelligence_digest"
