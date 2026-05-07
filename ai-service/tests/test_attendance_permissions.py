from __future__ import annotations

import pytest

from app.agents.attendance_agent import AttendanceAgent
from app.context.current_user import CurrentUserContext
from app.context.permissions import permissions_for_role
from app.memory.confirmation_store import ConfirmationStore
from app.tools.attendance_tools import TEAM_PRESENCE_UNAVAILABLE, register_attendance_tools
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult


class FakeBackendClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict | None]] = []

    async def get(self, path, *, context, params=None):
        self.calls.append((path, params))
        if path == "/presence/team/today":
            return ToolResult.ok({"scope": "TEAM", "totalMembers": 4, "presentMembers": 3, "absentMembers": 1, "lateMembers": 0})
        if path == "/presence/company/today":
            return ToolResult.ok({"scope": "COMPANY", "totalMembers": 20, "presentMembers": 18, "absentMembers": 2, "lateMembers": 1})
        if path == "/presence/global/analytics":
            return ToolResult.ok({"totalTrackedUsers": 42, "presentToday": 39, "absentToday": 3, "lateToday": 2})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        self.calls.append((path, None))
        return ToolResult.ok({})


def context(role: str) -> CurrentUserContext:
    normalized_role = role.upper()
    return CurrentUserContext(
        user_id=1,
        role=normalized_role,
        entreprise_id=10,
        permissions=permissions_for_role(normalized_role),
        token="token",
    )


def make_executor(fake: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_attendance_tools(registry, fake)  # type: ignore[arg-type]
    return ToolExecutor(registry)


def make_agent(fake: FakeBackendClient) -> AttendanceAgent:
    return AttendanceAgent(make_executor(fake), ConfirmationStore())


@pytest.mark.asyncio
async def test_employee_team_presence_returns_capability_unavailable_without_backend_call() -> None:
    fake = FakeBackendClient()
    result = await make_executor(fake).execute("get_team_presence", {}, context("EMPLOYEE"))

    assert result.success is False
    assert result.error_code == "capability_unavailable"
    assert result.error_message == TEAM_PRESENCE_UNAVAILABLE
    assert fake.calls == []


@pytest.mark.asyncio
async def test_manager_team_presence_calls_manager_endpoint() -> None:
    fake = FakeBackendClient()
    result = await make_executor(fake).execute("get_team_presence", {"team_id": 7}, context("MANAGER"))

    assert result.success is True
    assert fake.calls == [("/presence/team/today", {"teamId": 7})]


@pytest.mark.asyncio
async def test_rh_team_presence_uses_company_endpoint_not_manager_endpoint() -> None:
    fake = FakeBackendClient()
    response = await make_agent(fake).handle("Qui est present dans mon equipe ?", context("RH"))

    assert response.type == "answer"
    assert response.intent == "attendance.team_presence"
    assert fake.calls == [("/presence/company/today", None)]
    assert "/presence/team/today" not in [path for path, _ in fake.calls]
    assert "company" in response.text.lower()


@pytest.mark.asyncio
async def test_admin_team_presence_uses_global_endpoint_not_manager_endpoint() -> None:
    fake = FakeBackendClient()
    response = await make_agent(fake).handle("Qui est present dans mon equipe ?", context("ADMIN"))

    assert response.type == "answer"
    assert response.intent == "attendance.team_presence"
    assert fake.calls == [("/presence/global/analytics", None)]
    assert "/presence/team/today" not in [path for path, _ in fake.calls]
    assert "global" in response.text.lower()


@pytest.mark.asyncio
async def test_capability_unavailable_is_user_friendly() -> None:
    fake = FakeBackendClient()
    response = await make_agent(fake).handle("Qui est present dans mon equipe ?", context("EMPLOYEE"))

    assert response.type == "error"
    assert response.intent == "attendance.team_presence"
    assert TEAM_PRESENCE_UNAVAILABLE in response.text
    assert "403" not in response.text
    assert fake.calls == []
