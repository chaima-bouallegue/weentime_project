from __future__ import annotations

import asyncio
from typing import Any

from app.agents.role_copilots.manager_copilot import ManagerCopilot
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


def context(role: str = "MANAGER") -> CurrentUserContext:
    return CurrentUserContext(user_id=7, role=role, entreprise_id=42, token="verified-token", metadata={"jwt_verified": True})


def read(tool_name: str, summary: str, items: list[dict[str, Any]] | None = None) -> ToolResult:
    return ToolResult.ok(
        {
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=summary,
                items=items or [],
                count=len(items or []),
                data={},
                empty=not items,
                backend_status=200,
            )
        },
        status_code=200,
    )


def test_manager_copilot_uses_modern_manager_digest() -> None:
    executor = FakeExecutor()
    agent = ManagerCopilot(executor)

    response = asyncio.run(agent.handle("resume de mon equipe", context()))

    assert response.type == "answer"
    assert response.intent == "manager.team_summary"
    assert response.requiresConfirmation is False
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "role_summary"
    calls = {call.name for call in response.toolCalls}
    assert "leave.list_manager_requests" in calls
    assert "telework.list_manager_requests" in calls
    assert "authorization.list_manager_requests" in calls
    assert "legacy.get_pending_validations" not in calls
    assert "legacy.get_team_requests" not in calls


def test_manager_copilot_surfaces_operational_points_without_confirmation() -> None:
    executor = FakeExecutor(
        {
            "leave.list_manager_requests": read("leave.list_manager_requests", "1 conge", [{"id": 8, "statut": "EN_ATTENTE"}])
        }
    )
    agent = ManagerCopilot(executor)

    response = asyncio.run(agent.handle("resume de mon equipe", context()))

    assert response.actionResult is not None
    assert any(item["type"] == "approval_workload" for item in response.actionResult["reminders"])
    assert response.confirmationId is None
    assert "Points d'attention:" in response.text


def test_employee_cannot_access_manager_copilot_digest() -> None:
    executor = FakeExecutor()
    agent = ManagerCopilot(executor)

    response = asyncio.run(agent.handle("resume de mon equipe", context("EMPLOYEE")))

    assert response.type == "error"
    assert response.intent == "ManagerCopilot.forbidden"
    assert executor.calls == []
