from __future__ import annotations

import asyncio

from app.agents.authorization_agent import AuthorizationAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.result import ToolResult


class FakeExecutor:
    async def execute(self, tool_name, payload, context, **kwargs):
        return ToolResult.ok({"text": "ok"})


def context() -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role="EMPLOYEE", entreprise_id=9, token="token")


def test_authorization_create_asks_reason_when_missing() -> None:
    agent = AuthorizationAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Demande autorisation de sortie demain de 10h a 12h", context()))

    assert response.type == "ask"
    assert response.intent == "authorization.create"
    assert "motif" in response.text.lower()


def test_authorization_with_reason_requires_confirmation() -> None:
    agent = AuthorizationAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Demande autorisation de sortie demain de 10h a 12h pour rendez vous medical", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "authorization.create_request"
    assert response.toolCalls[0].arguments["reason"] == "rendez-vous medical"
