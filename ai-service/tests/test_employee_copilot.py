from __future__ import annotations

import asyncio
from typing import Any

from app.agents.role_copilots.employee_copilot import EmployeeCopilot
from app.context.current_user import CurrentUserContext
from app.tools.result import ToolResult, build_read_result


class FakeExecutor:
    def __init__(self, results: dict[str, ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append((tool_name, payload or {}))
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


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=7, role=role, entreprise_id=42, token="verified-token", metadata={"jwt_verified": True})


def test_employee_copilot_uses_contextual_employee_digest() -> None:
    executor = FakeExecutor()
    agent = EmployeeCopilot(executor)

    response = asyncio.run(agent.handle("resume de ma journee", context()))

    assert response.type == "answer"
    assert response.intent == "employee.daily_briefing"
    assert response.requiresConfirmation is False
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "role_summary"
    assert "communication.list_channels" in {call.name for call in response.toolCalls}


def test_employee_copilot_surfaces_safe_reminders() -> None:
    executor = FakeExecutor(
        {
            "get_pointage_status": ToolResult.ok(
                {
                    "read_result": build_read_result(
                        tool_name="get_pointage_status",
                        summary="Pointage en cours",
                        items=[],
                        count=0,
                        data={"checkIn": "08:30", "checkOut": None, "status": "CHECKED_IN"},
                        empty=False,
                        backend_status=200,
                    )
                },
                status_code=200,
            )
        }
    )
    agent = EmployeeCopilot(executor)

    response = asyncio.run(agent.handle("resume de ma journee", context()))

    assert response.actionResult is not None
    assert any(item["type"] == "missing_checkout" for item in response.actionResult["reminders"])
    assert "Rappels:" in response.text
