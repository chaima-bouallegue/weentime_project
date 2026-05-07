from __future__ import annotations

import asyncio
from typing import Any

from app.agents.authorization_agent import AuthorizationAgent
from app.agents.legacy_agent import LegacyAgent
from app.agents.router_agent import RouterAgent
from app.agents.telework_agent import TeleworkAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any], bool]] = []

    async def execute(self, tool_name, payload, context, *, confirmed=False, **kwargs):
        self.calls.append((tool_name, payload or {}, confirmed))
        return ToolResult.ok({"read_result": {"kind": "read_result", "summary": f"ok:{tool_name}", "items": [], "count": 0}})


class FakeAttendance:
    name = "attendance"

    def can_handle(self, message, context):
        return 0.0

    async def handle(self, message, context):
        return AgentResponse(type="answer", text="attendance", intent="attendance.status", confidence=1.0)


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token")


def test_telework_create_asks_date_if_missing() -> None:
    agent = TeleworkAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux teletravail", context()))

    assert response.type == "ask"
    assert response.intent == "telework.create"
    assert "date" in response.text.lower()


def test_telework_create_requires_confirmation() -> None:
    agent = TeleworkAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Je veux teletravail demain", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "telework.create_request"


def test_telework_list_uses_modern_tool() -> None:
    executor = FakeExecutor()
    agent = TeleworkAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Montre mes demandes de teletravail", context()))

    assert response.type == "answer"
    assert response.intent == "telework.list"
    assert executor.calls[0][0] == "telework.list_my_requests"


def test_tunisian_telework_routes_through_router_to_telework_agent() -> None:
    executor = FakeExecutor()
    telework_agent = TeleworkAgent(executor, ConfirmationStore())  # type: ignore[arg-type]
    router = RouterAgent(FakeAttendance(), extra_agents=[telework_agent], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("nheb teletravail ghodwa", context()))

    assert response.type == "confirm_action"
    assert response.intent == "telework.create"
    assert response.toolCalls[0].name == "telework.create_request"


def test_authorization_create_asks_time_or_date_if_missing() -> None:
    agent = AuthorizationAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux une autorisation de sortie", context()))

    assert response.type == "ask"
    assert response.intent == "authorization.create"
    assert "date" in response.text.lower()


def test_authorization_create_requires_confirmation() -> None:
    agent = AuthorizationAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Demande autorisation de sortie demain de 10h a 12h pour rendez vous medical", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "authorization.create_request"
    assert response.toolCalls[0].arguments["authorization_type"] == "SORTIE_ANTICIPEE"


def test_authorization_list_uses_modern_tool() -> None:
    executor = FakeExecutor()
    agent = AuthorizationAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Montre mes autorisations", context()))

    assert response.type == "answer"
    assert response.intent == "authorization.list"
    assert executor.calls[0][0] == "authorization.list_my_requests"


def test_arabic_authorization_intent_routes_correctly() -> None:
    agent = AuthorizationAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("أريد إذن خروج", context()))

    assert response.type == "ask"
    assert response.intent == "authorization.create"


def test_router_priority_keeps_telework_before_legacy() -> None:
    executor = FakeExecutor()

    async def legacy_handler(request):
        return AgentResponse(type="answer", text="legacy", intent="legacy.intent", confidence=0.5)

    router = RouterAgent(
        FakeAttendance(),
        extra_agents=[TeleworkAgent(executor, ConfirmationStore())],  # type: ignore[arg-type]
        legacy_agent=LegacyAgent(legacy_handler),
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Show my remote work requests", context()))

    assert response.intent == "telework.list"
    assert executor.calls[0][0] == "telework.list_my_requests"


def test_legacy_fallback_still_works_for_unsupported_flow() -> None:
    async def legacy_handler(request):
        return AgentResponse(type="answer", text="legacy", intent="legacy.intent", confidence=0.5)

    router = RouterAgent(
        FakeAttendance(),
        extra_agents=[TeleworkAgent(FakeExecutor(), ConfirmationStore()), AuthorizationAgent(FakeExecutor(), ConfirmationStore())],  # type: ignore[arg-type]
        legacy_agent=LegacyAgent(legacy_handler),
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("message hors domaine", context()))

    assert response.intent == "legacy.intent"
