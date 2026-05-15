from __future__ import annotations

import asyncio
from typing import Any

from app.agents.role_copilots.admin_copilot import AdminCopilot
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


def context(role: str = "ADMIN") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=7,
        role=role,
        entreprise_id=None if role == "ADMIN" else 42,
        token="verified-token",
        metadata={"jwt_verified": True},
    )


def read(tool_name: str, summary: str, items=None) -> ToolResult:
    items = items or []
    return ToolResult.ok(
        {
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=summary,
                items=items,
                count=len(items),
                data={},
                empty=not items,
                backend_status=200,
            )
        },
        status_code=200,
    )


def test_admin_copilot_uses_operational_admin_digest() -> None:
    executor = FakeExecutor(
        {
            "admin.misconfigured_users": read(
                "admin.misconfigured_users",
                "1 utilisateur mal configure",
                [{"id": 99, "issues": ["company_missing"]}],
            )
        }
    )
    agent = AdminCopilot(executor)

    response = asyncio.run(agent.handle("resume systeme", context()))

    assert response.type == "answer"
    assert response.intent == "admin.system_summary"
    assert response.requiresConfirmation is False
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "role_summary"
    assert response.actionResult["agent"] == "AdminCopilot"
    calls = {call.name for call in response.toolCalls}
    assert {"admin.system_health", "admin.misconfigured_users", "admin.list_users", "admin.list_enterprises"}.issubset(calls)
    assert not any(call.name.startswith("legacy.") for call in response.toolCalls)
    assert any(item["type"] == "user_configuration" for item in response.actionResult["reminders"])
    assert response.confirmationId is None


def test_non_admin_cannot_access_admin_copilot_digest() -> None:
    executor = FakeExecutor()
    agent = AdminCopilot(executor)

    response = asyncio.run(agent.handle("resume systeme", context("MANAGER")))

    assert response.type == "error"
    assert response.intent == "AdminCopilot.forbidden"
    assert executor.calls == []
