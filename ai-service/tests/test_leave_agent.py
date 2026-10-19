from __future__ import annotations

import asyncio
from typing import Any

from app.agents.leave_agent import LeaveAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.result import ToolResult


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append((tool_name, payload or {}))
        return ToolResult.ok({"read_result": {"kind": "read_result", "summary": f"ok:{tool_name}", "items": [], "count": 0}})


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token")


def test_leave_balance_uses_modern_tool() -> None:
    executor = FakeExecutor()
    agent = LeaveAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("combien de jours de conge il me reste", context()))

    assert response.type == "answer"
    assert response.intent == "leave.balance"
    assert executor.calls[0][0] == "leave.get_balance"


def test_leave_create_requires_confirmation_when_complete() -> None:
    agent = LeaveAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux un conge annuel demain pour repos", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "leave.create_request"


def test_sick_leave_empathetic_prompt_when_sick_today() -> None:
    agent = LeaveAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    # Test en Français
    response = asyncio.run(agent.handle("je suis malade aujourd'hui", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert "Je suis désolé de l'apprendre. Souhaitez-vous déclarer un congé maladie pour aujourd'hui ?" in response.text
    assert response.toolCalls[0].name == "leave.create_request"
    assert response.toolCalls[0].arguments.get("leave_type_label") == "maladie"

    # Test en Tunisien / Arabe
    ctx_tn = CurrentUserContext(user_id=1, role="EMPLOYEE", entreprise_id=2, token="token", language="tn")
    response_tn = asyncio.run(agent.handle("ena mridh lyoum", ctx_tn))
    assert response_tn.type == "confirm_action"
    assert "Nchallah labes. Theb n3adilek congé maladie lyoum?" in response_tn.text
