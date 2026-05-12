from __future__ import annotations

import asyncio

from app.agents.attendance_agent import AttendanceAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.result import ToolResult


class FakeExecutor:
    async def execute(self, tool_name, payload, context, **kwargs):
        return ToolResult.ok({"status": "ABSENT"}, status_code=200)


def context(role: str) -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token")


def test_all_roles_get_actionable_pointer_choice() -> None:
    for role in ("EMPLOYEE", "MANAGER", "RH", "ADMIN"):
        agent = AttendanceAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]
        response = asyncio.run(agent.handle("je veux pointer", context(role)))

        assert response.type == "ask"
        assert response.intent == "attendance.unknown"
        assert "entree" in response.text.lower() or "sortie" in response.text.lower()


def test_check_me_in_routes_to_confirmation() -> None:
    agent = AttendanceAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("check me in", context("MANAGER")))

    assert response.type == "confirm_action"
    assert response.intent == "attendance.check_in"
