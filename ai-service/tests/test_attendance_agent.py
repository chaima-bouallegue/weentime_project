from __future__ import annotations

import pytest

from app.agents.attendance_agent import AttendanceAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from app.tools.attendance_tools import register_attendance_tools


class FakeBackendClient:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def get(self, path, *, context, params=None):
        self.calls.append(path)
        if path == "/presence/me/today":
            return ToolResult.ok({"status": "ACTIVE", "checkIn": "09:00", "checkOut": None})
        return ToolResult.ok({"weekHours": "37h"})

    async def post(self, path, *, context, json=None, headers=None):
        self.calls.append(path)
        return ToolResult.ok({"status": "ACTIVE"})


def make_context() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=1,
        role="EMPLOYEE",
        entreprise_id=2,
        permissions={"attendance:read:self", "attendance:write:self"},
        token="token",
    )


def make_agent(fake_backend: FakeBackendClient, store: ConfirmationStore | None = None) -> tuple[AttendanceAgent, ToolExecutor, ConfirmationStore]:
    registry = ToolRegistry()
    register_attendance_tools(registry, fake_backend)  # type: ignore[arg-type]
    executor = ToolExecutor(registry)
    confirmation_store = store or ConfirmationStore()
    return AttendanceAgent(executor, confirmation_store), executor, confirmation_store


@pytest.mark.asyncio
async def test_attendance_status_routes_to_get_pointage_status() -> None:
    fake = FakeBackendClient()
    agent, _, _ = make_agent(fake)

    response = await agent.handle("Est-ce que je suis pointe ?", make_context())

    assert response.type == "answer"
    assert response.intent == "attendance.status"
    assert "/presence/me/today" in fake.calls


@pytest.mark.asyncio
async def test_check_in_returns_confirm_action() -> None:
    fake = FakeBackendClient()
    agent, _, _ = make_agent(fake)

    response = await agent.handle("Pointer mon entree", make_context())

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.confirmationId


@pytest.mark.asyncio
async def test_confirmation_executes_check_in_tool() -> None:
    fake = FakeBackendClient()
    agent, executor, store = make_agent(fake)
    context = make_context()
    confirmation = await agent.handle("Pointer mon entree", context)
    record = store.consume(confirmation.confirmationId or "")

    result = await executor.execute(record.tool_name, record.tool_input, context, confirmed=True)

    assert result.success
    assert "/presence/me/check-in" in fake.calls
