from __future__ import annotations

import asyncio
from typing import Any

from app.agents.attendance_agent import AttendanceAgent
from app.agents.leave_agent import LeaveAgent
from app.agents.router_agent import RouterAgent
from app.agents.role_copilots import AdminCopilot, EmployeeCopilot, ManagerCopilot, RHCopilot
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult, build_read_result


class FakeExecutor:
    def __init__(self, results: dict[str, ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any], bool]] = []

    async def execute(self, tool_name, payload, context, *, confirmed=False, **kwargs):
        self.calls.append((tool_name, payload or {}, confirmed))
        if tool_name in self.results:
            return self.results[tool_name]
        return ToolResult.ok(
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


class EmptyAttendance:
    name = "attendance"

    def can_handle(self, message, context):
        return 0.0

    async def handle(self, message, context):
        return AgentResponse(type="answer", text="attendance", intent="attendance.status", confidence=1.0)


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token")


def unavailable_result(tool_name: str) -> ToolResult:
    summary = "Cette vue n'est pas disponible pour le moment."
    return ToolResult.fail(
        "capability_unavailable",
        summary,
        status_code=403,
        data={
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=summary,
                items=[],
                count=0,
                data={},
                empty=True,
                backend_status=403,
                error={"code": "capability_unavailable", "message": summary},
            )
        },
    )


def test_employee_summary_routes_to_employee_copilot() -> None:
    executor = FakeExecutor()
    router = RouterAgent(EmptyAttendance(), extra_agents=[EmployeeCopilot(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("resume de ma journee", context("EMPLOYEE")))

    assert response.type == "answer"
    assert response.intent == "employee.daily_briefing"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "role_summary"
    assert response.actionResult["agent"] == "EmployeeCopilot"


def test_employee_copilot_returns_role_summary_sections() -> None:
    executor = FakeExecutor()
    agent = EmployeeCopilot(executor)  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("resume de ma journee", context("EMPLOYEE")))

    assert response.requiresConfirmation is False
    assert response.type == "answer"
    assert response.actionResult is not None
    sections = response.actionResult["sections"]
    assert len(sections) >= 4
    assert any(section["title"] == "Pointage" for section in sections)
    assert all(call.status == "success" for call in response.toolCalls)


def test_manager_summary_routes_to_manager_copilot() -> None:
    executor = FakeExecutor()
    router = RouterAgent(EmptyAttendance(), extra_agents=[ManagerCopilot(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("resume de mon equipe", context("MANAGER")))

    assert response.type == "answer"
    assert response.intent == "manager.team_summary"
    assert response.actionResult is not None
    assert response.actionResult["agent"] == "ManagerCopilot"


def test_manager_copilot_handles_unavailable_team_presence_gracefully() -> None:
    executor = FakeExecutor({"get_team_presence": unavailable_result("get_team_presence")})
    agent = ManagerCopilot(executor)  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("resume de mon equipe", context("MANAGER")))

    assert response.type == "answer"
    assert response.requiresConfirmation is False
    assert response.actionResult is not None
    sections = response.actionResult["sections"]
    assert sections[0]["title"] == "Presence equipe"
    assert sections[0]["status"] in {"warning", "unavailable"}
    assert response.actionResult["warnings"]


def test_rh_summary_routes_to_rh_copilot() -> None:
    executor = FakeExecutor()
    router = RouterAgent(EmptyAttendance(), extra_agents=[RHCopilot(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("resume rh du jour", context("RH")))

    assert response.type == "answer"
    assert response.intent == "rh.daily_briefing"
    assert response.actionResult is not None
    assert response.actionResult["agent"] == "RHCopilot"
    assert any(call.name == "rh.get_stats" for call in response.toolCalls)
    assert not any(call.name == "legacy.get_rh_stats" for call in response.toolCalls)


def test_admin_summary_routes_to_admin_copilot_with_unavailable_sections() -> None:
    executor = FakeExecutor(
        {
            "admin.list_users": unavailable_result("admin.list_users"),
            "admin.list_enterprises": unavailable_result("admin.list_enterprises"),
            "admin.system_health": unavailable_result("admin.system_health"),
        }
    )
    router = RouterAgent(EmptyAttendance(), extra_agents=[AdminCopilot(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("resume systeme", context("ADMIN")))

    assert response.type == "answer"
    assert response.intent == "admin.system_summary"
    assert response.actionResult is not None
    assert response.actionResult["agent"] == "AdminCopilot"
    assert all(section["status"] in {"warning", "unavailable"} for section in response.actionResult["sections"])


def test_explicit_leave_create_stays_with_leave_agent() -> None:
    executor = FakeExecutor()
    router = RouterAgent(
        EmptyAttendance(),
        extra_agents=[LeaveAgent(executor, ConfirmationStore()), EmployeeCopilot(executor)],  # type: ignore[arg-type]
        legacy_agent=None,
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("je veux un conge demain", context("EMPLOYEE")))

    assert response.intent == "leave.create"
    assert response.actionResult is None


def test_explicit_check_in_stays_with_attendance_agent() -> None:
    executor = FakeExecutor()
    router = RouterAgent(AttendanceAgent(executor, ConfirmationStore()), extra_agents=[EmployeeCopilot(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("pointer mon entree", context("EMPLOYEE")))

    assert response.type == "confirm_action"
    assert response.intent == "attendance.check_in"
    assert response.toolCalls[0].name == "check_in"


def test_employee_cannot_access_manager_copilot() -> None:
    agent = ManagerCopilot(FakeExecutor())  # type: ignore[arg-type]

    assert agent.can_handle("resume de mon equipe", context("EMPLOYEE")) == 0.0
    response = asyncio.run(agent.handle("resume de mon equipe", context("EMPLOYEE")))

    assert response.type == "error"
    assert response.intent == "ManagerCopilot.forbidden"


def test_role_summary_never_creates_write_confirmation() -> None:
    for agent, role, message in (
        (EmployeeCopilot(FakeExecutor()), "EMPLOYEE", "resume de ma journee"),
        (ManagerCopilot(FakeExecutor()), "MANAGER", "resume de mon equipe"),
        (RHCopilot(FakeExecutor()), "RH", "resume rh du jour"),
        (AdminCopilot(FakeExecutor()), "ADMIN", "resume systeme"),
    ):
        response = asyncio.run(agent.handle(message, context(role)))
        assert response.type == "answer"
        assert response.requiresConfirmation is False
        assert response.confirmationId is None
        assert not any(call.status == "pending_confirmation" for call in response.toolCalls)
