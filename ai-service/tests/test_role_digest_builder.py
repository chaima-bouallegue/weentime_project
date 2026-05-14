from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.intelligence import RoleDigestBuilder
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
                    summary=f"ok:{tool_name}",
                    items=[],
                    count=0,
                    data={},
                    empty=True,
                    backend_status=200,
                )
            },
            status_code=200,
        )


def context(role: str = "EMPLOYEE", tenant_id: int | None = 42) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=7,
        role=role,
        entreprise_id=tenant_id,
        token="verified-token",
        language="fr",
        metadata={"jwt_verified": True},
    )


def read(tool: str, summary: str, items: list[dict[str, Any]] | None = None, data: dict[str, Any] | None = None) -> ToolResult:
    return ToolResult.ok(
        {
            "read_result": build_read_result(
                tool_name=tool,
                summary=summary,
                items=items or [],
                count=len(items or []),
                data=data or {},
                empty=not items,
                backend_status=200,
            )
        },
        status_code=200,
    )


async def test_employee_digest_uses_personal_read_tools_only() -> None:
    executor = FakeExecutor({"leave.list_my_requests": read("leave.list_my_requests", "1 demande en attente", [{"id": 1}])})
    digest = await RoleDigestBuilder(executor).build_digest(context("EMPLOYEE"))

    assert digest.role == "EMPLOYEE"
    assert digest.tenant_id == 42
    assert digest.sections
    assert any(section.tool_name == "leave.list_my_requests" for section in digest.sections)
    assert any(priority.type == "personal_pending_or_unread" for priority in digest.priorities)
    assert all(call.name not in {"leave.create_request", "admin.create_user", "communication.send_message"} for call in digest.tool_calls)
    assert all(call[2].tenant_id == 42 for call in executor.calls)


async def test_manager_digest_prioritizes_pending_work() -> None:
    executor = FakeExecutor({"legacy.get_pending_validations": read("legacy.get_pending_validations", "2 validations", [{"id": 10}, {"id": 11}])})
    digest = await RoleDigestBuilder(executor).build_digest(context("MANAGER"))

    assert digest.role == "MANAGER"
    assert any(priority.type == "manager_pending_work" for priority in digest.priorities)
    assert any(call.name == "legacy.get_pending_validations" for call in digest.tool_calls)


async def test_rh_digest_prioritizes_backlog() -> None:
    executor = FakeExecutor({"legacy.get_all_requests": read("legacy.get_all_requests", "3 demandes RH", [{"id": 1}, {"id": 2}, {"id": 3}])})
    digest = await RoleDigestBuilder(executor).build_digest(context("RH"))

    assert digest.role == "RH"
    assert any(priority.type == "rh_backlog" for priority in digest.priorities)


async def test_admin_digest_prioritizes_misconfigured_users() -> None:
    executor = FakeExecutor({"admin.misconfigured_users": read("admin.misconfigured_users", "1 utilisateur mal configure", [{"id": 99}])})
    digest = await RoleDigestBuilder(executor).build_digest(context("ADMIN", tenant_id=None))

    assert digest.role == "ADMIN"
    assert digest.tenant_id is None
    assert any(priority.type == "admin_configuration_attention" for priority in digest.priorities)


async def test_policy_citations_are_preserved_when_policy_focus_is_requested() -> None:
    citation = {"sourceId": "policy-1", "title": "Policy", "chunkId": "policy-1:0", "excerpt": "Approved source."}
    executor = FakeExecutor({"policy.search": read("policy.search", "Selon la source RH", [citation], {"citations": [citation], "policyAvailable": True})})

    digest = await RoleDigestBuilder(executor).build_digest(context("EMPLOYEE"), policy_query="politique conge maladie")

    assert executor.calls[-1][0] == "policy.search"
    assert digest.citations == [citation]
    assert digest.to_dict()["citations"] == [citation]


async def test_unavailable_tool_becomes_warning_not_crash() -> None:
    failure = ToolResult.fail("tool_not_found", "Tool missing", status_code=404)
    executor = FakeExecutor({"get_week_hours": failure})

    digest = await RoleDigestBuilder(executor).build_digest(context("EMPLOYEE"))

    assert digest.warnings
    assert any(section.tool_name == "get_week_hours" and section.status == "unavailable" for section in digest.sections)
