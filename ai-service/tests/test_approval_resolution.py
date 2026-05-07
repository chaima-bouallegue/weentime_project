from __future__ import annotations

import asyncio
from typing import Any

from app.agents.manager_agent import ManagerAgent
from app.agents.rh_agent import RHAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.result import ToolResult, build_read_result


class FakeExecutor:
    def __init__(self, items: list[dict[str, Any]] | None = None) -> None:
        self.items = items or []
        self.calls: list[str] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append(tool_name)
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary="pending",
                    items=self.items,
                    count=len(self.items),
                )
            },
            status_code=200,
        )


def context(role: str) -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token")


def test_manager_approval_fetches_details_before_confirmation() -> None:
    executor = FakeExecutor([{"id": 42, "employee": "Amin Dupont", "type": "CONGE", "dateDebut": "2026-05-20", "statut": "EN_ATTENTE", "motif": "repos"}])
    agent = ManagerAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve le conge 42", context("MANAGER")))

    assert response.type == "confirm_action"
    assert executor.calls[0] == "legacy.get_pending_validations"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "approval_confirmation"
    assert "Amin Dupont" in response.text


def test_manager_approval_without_match_asks_for_clarification() -> None:
    agent = ManagerAgent(FakeExecutor([]), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve le conge 42", context("MANAGER")))

    assert response.type == "ask"
    assert response.intent == "manager.approve"


def test_rh_approval_fetches_details_before_confirmation() -> None:
    executor = FakeExecutor([{"id": 8, "employee": "Amin Dupont", "type": "TELETRAVAIL", "dateDebut": "2026-05-20", "statut": "EN_ATTENTE_RH"}])
    agent = RHAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve la demande teletravail 8", context("RH")))

    assert response.type == "confirm_action"
    assert executor.calls[0] == "legacy.get_all_requests"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "approval_confirmation"
    assert "Amin Dupont" in response.text
