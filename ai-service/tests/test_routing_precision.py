from __future__ import annotations

import asyncio
from typing import Any

from app.agents.attendance_agent import AttendanceAgent
from app.agents.document_agent import DocumentAgent
from app.agents.leave_agent import LeaveAgent
from app.agents.router_agent import RouterAgent
from app.agents.role_copilots import EmployeeCopilot
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult, build_read_result


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append((tool_name, payload or {}))
        if tool_name == "document.list_my_requests":
            return ToolResult.ok(
                {
                    "read_result": build_read_result(
                        tool_name=tool_name,
                        summary="documents",
                        count=1,
                        items=[{"id": 7, "type": "ATTESTATION_TRAVAIL", "statut": "EN_ATTENTE", "dateDemande": "2026-05-07"}],
                    )
                },
                status_code=200,
            )
        return ToolResult.ok({"read_result": build_read_result(tool_name=tool_name, summary=f"ok:{tool_name}", items=[], count=0)})


class EmptyAttendance:
    name = "attendance"

    def can_handle(self, message, context):
        return 0.0

    async def handle(self, message, context):
        return AgentResponse(type="answer", text="attendance", intent="attendance.status", confidence=1.0)


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token")


def test_show_my_documents_routes_to_document_agent_not_employee_summary() -> None:
    executor = FakeExecutor()
    router = RouterAgent(
        EmptyAttendance(),
        extra_agents=[DocumentAgent(executor, ConfirmationStore()), EmployeeCopilot(executor)],  # type: ignore[arg-type]
        legacy_agent=None,
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Montre mes documents", context()))

    assert response.intent == "document.list"
    assert response.actionResult is not None
    assert response.actionResult.get("kind") != "role_summary"
    assert executor.calls[0][0] == "document.list_my_requests"


def test_generic_show_my_requests_can_route_to_employee_summary() -> None:
    executor = FakeExecutor()
    router = RouterAgent(
        EmptyAttendance(),
        extra_agents=[DocumentAgent(executor, ConfirmationStore()), LeaveAgent(executor, ConfirmationStore()), EmployeeCopilot(executor)],  # type: ignore[arg-type]
        legacy_agent=None,
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Montre mes demandes", context()))

    assert response.intent == "employee.my_pending_items"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "role_summary"


def test_show_leave_requests_routes_to_leave_agent() -> None:
    executor = FakeExecutor()
    router = RouterAgent(
        EmptyAttendance(),
        extra_agents=[LeaveAgent(executor, ConfirmationStore()), EmployeeCopilot(executor)],  # type: ignore[arg-type]
        legacy_agent=None,
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Montre mes demandes de conge", context()))

    assert response.intent in {"leave.list", "leave.status"}
    assert response.actionResult is not None
    assert response.actionResult.get("kind") != "role_summary"
