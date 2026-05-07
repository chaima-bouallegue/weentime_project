from __future__ import annotations

import asyncio
from typing import Any

from app.agents.attendance_agent import AttendanceAgent
from app.agents.document_agent import DocumentAgent
from app.agents.leave_agent import LeaveAgent
from app.agents.legacy_agent import LegacyAgent
from app.agents.manager_agent import ManagerAgent
from app.agents.rh_agent import RHAgent
from app.agents.router_agent import RouterAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any], bool]] = []

    async def execute(self, tool_name, payload, context, *, confirmed=False, **kwargs):
        self.calls.append((tool_name, payload or {}, confirmed))
        return ToolResult.ok({"text": f"ok:{tool_name}"})


class FakeAttendance:
    name = "attendance"

    def can_handle(self, message, context):
        return 0.0

    async def handle(self, message, context):
        return AgentResponse(type="answer", text="attendance", intent="attendance.status", confidence=1.0)


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token")


def test_leave_balance_routes_to_leave_agent() -> None:
    executor = FakeExecutor()
    agent = LeaveAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("combien de jours de conge", context()))

    assert response.intent == "leave.balance"
    assert executor.calls[0][0] == "leave.get_balance"


def test_leave_creation_asks_clarification_if_date_missing() -> None:
    agent = LeaveAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux un conge", context()))

    assert response.type == "ask"
    assert response.intent == "leave.create"


def test_leave_creation_requires_confirmation() -> None:
    store = ConfirmationStore()
    agent = LeaveAgent(FakeExecutor(), store)  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux un conge annuel demain pour repos", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "leave.create_request"


def test_leave_creation_requires_type_before_confirmation() -> None:
    agent = LeaveAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux un conge demain pour repos", context()))

    assert response.type == "ask"
    assert "type de conge" in response.text.lower()


def test_leave_creation_requires_reason_before_confirmation() -> None:
    agent = LeaveAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux un conge annuel demain", context()))

    assert response.type == "ask"
    assert "motif" in response.text.lower()


def test_document_request_asks_document_type_if_missing() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux un document", context()))

    assert response.type == "ask"
    assert response.intent == "document.create"


def test_document_request_requires_confirmation() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("donne moi une attestation de travail", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "document.create_request"


def test_employee_cannot_approve_request() -> None:
    agent = ManagerAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("approuve le conge 42", context("EMPLOYEE")))

    assert response.type == "error"
    assert response.intent == "manager.forbidden"


def test_manager_approval_requires_confirmation() -> None:
    agent = ManagerAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("approuve le conge 42", context("MANAGER")))

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "legacy.approve_request"


def test_rh_stats_routes_to_rh_agent() -> None:
    executor = FakeExecutor()
    agent = RHAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("donne moi les stats rh", context("RH")))

    assert response.intent == "rh.stats"
    assert executor.calls[0][0] == "legacy.get_rh_stats"


def test_legacy_agent_still_works_as_fallback() -> None:
    async def legacy_handler(request):
        return AgentResponse(type="answer", text="legacy", intent="legacy.intent", confidence=0.5)

    router = RouterAgent(FakeAttendance(), extra_agents=[], legacy_agent=LegacyAgent(legacy_handler))  # type: ignore[arg-type]

    response = asyncio.run(router.handle("message inconnu", context()))

    assert response.intent == "legacy.intent"
