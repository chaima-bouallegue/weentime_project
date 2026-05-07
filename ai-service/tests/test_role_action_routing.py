from __future__ import annotations

import asyncio

from app.agents.authorization_agent import AuthorizationAgent
from app.agents.telework_agent import TeleworkAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.result import ToolResult


class FakeExecutor:
    async def execute(self, tool_name, payload, context, **kwargs):
        return ToolResult.ok({"text": "ok"})


def context(role: str) -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token")


def test_rh_telework_context_does_not_start_employee_create_flow() -> None:
    agent = TeleworkAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("de teletravail", context("RH")))

    assert response.type == "ask"
    assert response.intent == "telework.approval_context"
    assert "approuver" in response.text.lower() or "refuser" in response.text.lower()


def test_admin_write_action_requires_confirmation() -> None:
    # AdminAgent has dedicated coverage; this regression protects the invariant at role-routing level.
    from app.agents.admin_agent import AdminAgent

    agent = AdminAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]
    response = asyncio.run(agent.handle("modifier role utilisateur 7 RH", context("ADMIN")))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True


def test_authorization_create_still_requires_confirmation_when_complete() -> None:
    agent = AuthorizationAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]
    response = asyncio.run(agent.handle("Demande autorisation de sortie demain de 10h a 11h pour rendez vous medical", context("EMPLOYEE")))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
