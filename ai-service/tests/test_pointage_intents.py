from __future__ import annotations

import asyncio

from app.agents.attendance_agent import AttendanceAgent
from app.core.copilot_engine import ensure_copilot_services
from chatbot_test_helpers import make_context, make_state, send_chatbot_message


def test_pointage_status_prompt_routes_to_status() -> None:
    response, _ = asyncio.run(send_chatbot_message("Check my pointage", role="EMPLOYEE"))
    assert response.intent == "attendance.status"
    assert response.actionResult["success"] is True


def test_pointage_check_in_requires_confirmation() -> None:
    response, _ = asyncio.run(send_chatbot_message("Je viens d'arriver", role="EMPLOYEE"))
    assert response.intent == "attendance.check_in"
    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "check_in"


def test_forgot_checkout_is_read_only_advice() -> None:
    response, _ = asyncio.run(send_chatbot_message("Did I forget checkout?", role="EMPLOYEE"))
    assert response.intent == "attendance.forgot_checkout"
    assert response.type == "answer"
    assert any(call.name == "get_pointage_status" for call in response.toolCalls)


def test_employee_team_presence_returns_capability_unavailable() -> None:
    state = make_state()
    services = ensure_copilot_services(state)
    agent = AttendanceAgent(services["executor"], services["confirmation_store"])
    response = asyncio.run(agent.handle("Pointage equipe", make_context("EMPLOYEE")))
    assert response.intent == "attendance.team_presence"
    assert response.actionResult["error_code"] == "capability_unavailable"
