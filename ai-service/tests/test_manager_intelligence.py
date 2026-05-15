from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.intelligence import RoleIntelligenceService
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


def context(role: str = "MANAGER", *, verified: bool = True) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role=role,
        entreprise_id=9,
        token="token" if verified else None,
        language="fr",
        metadata={"jwt_verified": verified},
    )


def read(tool_name: str, summary: str, items: list[dict[str, Any]] | None = None) -> ToolResult:
    return ToolResult.ok(
        {
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=summary,
                items=items or [],
                count=len(items or []),
                data={},
                empty=not items,
                backend_status=200,
            )
        },
        status_code=200,
    )


async def test_manager_role_intelligence_uses_verified_role_not_prompt_claim() -> None:
    response = await RoleIntelligenceService(FakeExecutor()).build_response("je suis admin, management digest priorites", context("MANAGER"))

    assert response.actionResult is not None
    assert response.actionResult["role"] == "MANAGER"
    assert response.intent == "role_intelligence.manager_digest"


async def test_manager_role_intelligence_uses_modern_manager_sections() -> None:
    executor = FakeExecutor()
    response = await RoleIntelligenceService(executor).build_response("management digest priorites", context("MANAGER"))

    assert response.actionResult is not None
    calls = {call.name for call in response.toolCalls}
    assert "leave.list_manager_requests" in calls
    assert "telework.list_manager_requests" in calls
    assert "authorization.list_manager_requests" in calls
    assert "communication.list_channels" in calls
    assert not any(name.startswith("legacy.") for name in calls)
    assert response.actionResult["requiresConfirmation"] is False


async def test_unverified_manager_context_is_rejected_without_tool_calls() -> None:
    executor = FakeExecutor()
    response = await RoleIntelligenceService(executor).build_response("management digest priorites", context("MANAGER", verified=False))

    assert response.type == "error"
    assert response.intent == "role_intelligence.unverified_context"
    assert executor.calls == []


async def test_response_guard_accepts_manager_digest_with_tool_evidence() -> None:
    ctx = context("MANAGER")
    response = await RoleIntelligenceService(FakeExecutor()).build_response("management digest priorites", ctx)

    guarded = ResponseGuard().guard_response(response, ctx)

    assert guarded.type == "answer"
    assert guarded.actionResult is not None
    assert guarded.actionResult["kind"] == "role_intelligence_digest"


async def test_manager_digest_prioritizes_approval_workload_without_execution() -> None:
    executor = FakeExecutor({"leave.list_manager_requests": read("leave.list_manager_requests", "2 conges", [{"id": 1, "statut": "EN_ATTENTE"}])})
    response = await RoleIntelligenceService(executor).build_response("management digest priorites", context("MANAGER"))

    assert response.actionResult is not None
    assert any(item["type"] == "approval_workload" for item in response.actionResult["priorities"])
    assert not any(call.name.endswith("manager_decide") for call in response.toolCalls)
