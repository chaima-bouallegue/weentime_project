from __future__ import annotations

import asyncio

import pytest

from app.agents.router_agent import RouterAgent
from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse


class FakeAttendanceAgent:
    name = "attendance"

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        return 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        return AgentResponse(
            type="answer",
            text="attendance",
            intent=str(context.metadata.get("route_intent") or "attendance.status"),
            confidence=1.0,
        )


class FakeAuthorizationAgent:
    name = "authorization"

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        return 0.9 if "autorisation" in message or "authorization" in message else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        return AgentResponse(type="ask", text="authorization", intent="authorization.create", confidence=0.9)


def make_context() -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role="EMPLOYEE", token="token")


@pytest.mark.parametrize(
    ("message", "language"),
    [
        ("je veux un congé", "fr"),
        ("I want a leave", "en"),
        ("نحب عطلة", "ar"),
        ("nheb conge ghodwa", "tn"),
    ],
)
def test_multilingual_leave_requests_map_to_create_leave(message: str, language: str) -> None:
    router = RouterAgent(attendance_agent=FakeAttendanceAgent())  # type: ignore[arg-type]
    context = make_context()

    response = asyncio.run(router.handle(message, context))

    assert response.intent == "CREATE_LEAVE"
    assert context.language == language
    assert context.metadata["matched_intent"] == "CREATE_LEAVE"
    assert "congé" in str(context.metadata["normalized_text"])


def test_tunisian_pointage_request_routes_to_attendance_check_in() -> None:
    router = RouterAgent(attendance_agent=FakeAttendanceAgent())  # type: ignore[arg-type]
    context = make_context()

    response = asyncio.run(router.handle("nheb npointi", context))

    assert response.intent == "attendance.check_in"
    assert context.language == "tn"
    assert context.metadata["matched_intent"] == "CHECK_IN"
    assert context.metadata["selected_agent"] == "attendance"


def test_tunisian_authorization_request_routes_to_authorization_agent() -> None:
    router = RouterAgent(
        attendance_agent=FakeAttendanceAgent(),  # type: ignore[arg-type]
        extra_agents=[FakeAuthorizationAgent()],  # type: ignore[list-item]
    )
    context = make_context()

    response = asyncio.run(router.handle("nheb autorisation ghodwa", context))

    assert response.intent == "authorization.create"
    assert context.language == "tn"
    assert context.metadata["selected_agent"] == "authorization"
