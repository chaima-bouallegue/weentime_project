from __future__ import annotations

from typing import Any

import pytest
from pydantic import BaseModel

from app.context.current_user import CurrentUserContext
from app.insights import InsightEngine
from app.models.tool_models import ToolDefinition
from app.tools.executor import ToolExecutor
from app.tools.insight_tools import register_insight_tools
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult, build_read_result, get_read_result


class EmptyInput(BaseModel):
    pass


class Recorder:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def handler(self, tool_name: str, data: Any):
        async def run(payload: BaseModel, context: CurrentUserContext) -> ToolResult:
            self.calls.append(tool_name)
            return ToolResult.ok(data)

        return run


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=42, token="token", permissions={"attendance:read:self"})


def register_fake_read(registry: ToolRegistry, name: str, recorder: Recorder, data: Any, roles=None) -> None:
    registry.register(
        ToolDefinition(
            name=name,
            description=f"fake {name}",
            input_model=EmptyInput,
            output_model=None,
            type="read",
            allowed_roles=set(roles or {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}),
        ),
        recorder.handler(name, data),
    )


def read_result(tool_name: str, items=None, data=None, count=None) -> dict[str, Any]:
    return {
        "read_result": build_read_result(
            tool_name=tool_name,
            summary=f"summary:{tool_name}",
            items=items or [],
            count=count,
            data=data or {},
            empty=not bool(items),
        )
    }


@pytest.mark.asyncio
async def test_employee_daily_insight_tool_collects_read_tools_only() -> None:
    registry = ToolRegistry()
    recorder = Recorder()
    for name, data in (
        ("get_pointage_status", {"checkedIn": True, "checkedOut": False}),
        ("get_week_hours", {"hours": 32}),
        ("get_presence_history", []),
        ("leave.get_balance", read_result("leave.get_balance", data={"total": 2})),
        ("leave.list_my_requests", read_result("leave.list_my_requests", items=[])),
    ):
        register_fake_read(registry, name, recorder, data)
    executor = ToolExecutor(registry)
    register_insight_tools(registry, executor, InsightEngine())

    result = await executor.execute("insights.employee_daily", {}, context())

    assert result.success is True
    read = get_read_result(result.data)
    assert read is not None
    assert read["data"]["kind"] == "insight_report"
    assert "check_in" not in recorder.calls
    assert "check_out" not in recorder.calls


@pytest.mark.asyncio
async def test_employee_cannot_access_manager_team_insight() -> None:
    registry = ToolRegistry()
    executor = ToolExecutor(registry)
    register_insight_tools(registry, executor, InsightEngine())

    result = await executor.execute("insights.manager_team", {}, context("EMPLOYEE"))

    assert result.success is False
    assert result.error_code == "role_not_allowed"


@pytest.mark.asyncio
async def test_manager_team_summary_is_read_only() -> None:
    registry = ToolRegistry()
    recorder = Recorder()
    register_fake_read(registry, "legacy.get_pending_validations", recorder, read_result("legacy.get_pending_validations", items=[{"id": i} for i in range(7)]), roles={"MANAGER"})
    register_fake_read(registry, "legacy.get_team_requests", recorder, read_result("legacy.get_team_requests", items=[]), roles={"MANAGER"})
    register_fake_read(registry, "get_team_presence", recorder, {"total": 8, "absents": 2}, roles={"MANAGER"})
    executor = ToolExecutor(registry)
    register_insight_tools(registry, executor, InsightEngine())

    result = await executor.execute("insights.manager_team", {}, context("MANAGER"))

    assert result.success is True
    assert set(recorder.calls) == {"legacy.get_pending_validations", "legacy.get_team_requests", "get_team_presence"}
    assert all(not name.startswith(("check_", "legacy.approve", "legacy.reject")) for name in recorder.calls)


@pytest.mark.asyncio
async def test_rh_insight_summary_uses_rh_role_only() -> None:
    registry = ToolRegistry()
    recorder = Recorder()
    register_fake_read(registry, "rh.get_stats", recorder, read_result("rh.get_stats", data={"totalEmployees": 22, "pendingRequests": 7}), roles={"RH"})
    register_fake_read(registry, "legacy.get_all_requests", recorder, read_result("legacy.get_all_requests", items=[{"id": i} for i in range(6)]), roles={"RH"})
    executor = ToolExecutor(registry)
    register_insight_tools(registry, executor, InsightEngine())

    result = await executor.execute("insights.rh_daily", {}, context("RH"))

    assert result.success is True
    assert set(recorder.calls) == {"rh.get_stats", "legacy.get_all_requests"}
    assert "legacy.get_rh_stats" not in recorder.calls
    read = get_read_result(result.data)
    assert read is not None
    assert any(item["sourceTools"] == ["rh.get_stats"] for item in read["data"]["insights"])


@pytest.mark.asyncio
async def test_admin_system_insight_returns_capability_unavailable_if_admin_tools_missing() -> None:
    registry = ToolRegistry()
    executor = ToolExecutor(registry)
    register_insight_tools(registry, executor, InsightEngine())

    result = await executor.execute("insights.admin_system", {}, context("ADMIN"))

    assert result.success is False
    assert result.error_code == "capability_unavailable"
    read = get_read_result(result.data)
    assert read is not None
    assert read["error"]["code"] == "capability_unavailable"


@pytest.mark.asyncio
async def test_missing_dependency_endpoint_returns_warning_not_crash() -> None:
    registry = ToolRegistry()
    recorder = Recorder()
    register_fake_read(registry, "get_pointage_status", recorder, {"checkedIn": False})
    executor = ToolExecutor(registry)
    register_insight_tools(registry, executor, InsightEngine())

    result = await executor.execute("insights.employee_daily", {}, context())

    assert result.success is True
    assert result.warnings
    read = get_read_result(result.data)
    assert read is not None
    assert read["data"]["warnings"]
