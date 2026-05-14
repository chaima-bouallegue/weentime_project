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
    executor = FakeExecutor({"leave.list_manager_requests": read("leave.list_manager_requests", "2 conges equipe", [{"id": 10}, {"id": 11}])})
    digest = await RoleDigestBuilder(executor).build_digest(context("MANAGER"))

    assert digest.role == "MANAGER"
    assert any(priority.type == "manager_pending_work" for priority in digest.priorities)
    calls = {call.name for call in digest.tool_calls}
    assert "legacy.get_pending_validations" not in calls
    assert "legacy.get_team_requests" not in calls
    assert {"leave.list_manager_requests", "telework.list_manager_requests", "authorization.list_manager_requests"}.issubset(calls)


async def test_rh_digest_prioritizes_backlog() -> None:
    executor = FakeExecutor({"leave.list_rh_pending": read("leave.list_rh_pending", "3 conges RH", [{"id": 1}, {"id": 2}, {"id": 3}])})
    digest = await RoleDigestBuilder(executor).build_digest(context("RH"))

    assert digest.role == "RH"
    assert any(priority.type == "rh_backlog" for priority in digest.priorities)
    calls = {call.name for call in digest.tool_calls}
    assert "legacy.get_all_requests" not in calls
    assert "legacy.get_rh_stats" not in calls
    assert "rh.get_stats" in calls
    assert {"leave.list_rh_pending", "telework.list_rh_pending", "authorization.list_rh_requests"}.issubset(calls)


async def test_rh_digest_uses_modern_stats_tool() -> None:
    executor = FakeExecutor({"rh.get_stats": read("rh.get_stats", "Stats RH disponibles", [{"metric": "pendingRequests", "value": 4}])})
    digest = await RoleDigestBuilder(executor).build_digest(context("RH"))

    assert any(call.name == "rh.get_stats" for call in digest.tool_calls)
    assert not any(call.name == "legacy.get_rh_stats" for call in digest.tool_calls)
    assert any(section.tool_name == "rh.get_stats" and section.status == "ok" for section in digest.sections)


async def test_rh_stats_unavailable_becomes_clean_digest_section() -> None:
    failure = ToolResult.fail(
        "capability_unavailable",
        "Les statistiques RH ne sont pas encore disponibles dans le backend.",
        status_code=404,
        data={
            "read_result": build_read_result(
                tool_name="rh.get_stats",
                summary="Les statistiques RH ne sont pas encore disponibles dans le backend.",
                items=[],
                count=0,
                data={},
                empty=True,
                backend_status=404,
            )
        },
    )
    executor = FakeExecutor({"rh.get_stats": failure})
    digest = await RoleDigestBuilder(executor).build_digest(context("RH"))

    assert any(section.tool_name == "rh.get_stats" and section.status == "unavailable" for section in digest.sections)
    assert any("statistiques RH" in warning for warning in digest.warnings)


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


async def test_role_intelligence_digests_never_plan_write_tools() -> None:
    write_tools = {
        "leave.create_request",
        "leave.manager_decide",
        "leave.rh_decide",
        "telework.create_request",
        "telework.manager_decide",
        "telework.rh_decide",
        "authorization.create_request",
        "authorization.manager_decide",
        "authorization.rh_decide",
        "document.create_request",
        "communication.send_message",
        "admin.create_user",
    }
    for role in ("EMPLOYEE", "MANAGER", "RH", "ADMIN"):
        executor = FakeExecutor()
        digest = await RoleDigestBuilder(executor).build_digest(context(role, tenant_id=None if role == "ADMIN" else 42))
        assert write_tools.isdisjoint({call.name for call in digest.tool_calls})
        assert not digest.to_dict()["requiresConfirmation"]


async def test_modern_manager_reads_preserve_verified_tenant_context() -> None:
    executor = FakeExecutor()
    await RoleDigestBuilder(executor).build_digest(context("MANAGER", tenant_id=77))

    modern_manager_tools = {"leave.list_manager_requests", "telework.list_manager_requests", "authorization.list_manager_requests"}
    assert all(call[2].tenant_id == 77 for call in executor.calls if call[0] in modern_manager_tools)


async def test_communication_digest_does_not_fake_unread_counts() -> None:
    channels = [{"id": "channel-1", "name": "General"}, {"id": "channel-2", "name": "RH"}]
    executor = FakeExecutor({"communication.list_channels": read("communication.list_channels", "2 canaux visibles", channels)})

    digest = await RoleDigestBuilder(executor).build_digest(context("EMPLOYEE"))

    communication = next(section for section in digest.sections if section.tool_name == "communication.list_channels")
    assert "non lu" not in communication.summary.lower()
    assert all("unreadCount" not in item for item in communication.items if isinstance(item, dict))
    assert all(call.name != "communication.get_channel_messages" for call in digest.tool_calls)
