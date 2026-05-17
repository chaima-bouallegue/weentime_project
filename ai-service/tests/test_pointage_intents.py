from __future__ import annotations

import asyncio

from app.agents.attendance_agent import AttendanceAgent
from app.core.copilot_engine import ensure_copilot_services
from chatbot_test_helpers import make_context, make_state, send_chatbot_message


def test_pointage_status_prompt_routes_to_status() -> None:
    response, _ = asyncio.run(send_chatbot_message("Check my pointage", role="EMPLOYEE"))
    assert response.intent == "attendance.status"
    assert response.actionResult["success"] is True


def test_multilingual_pointage_status_routes_to_personal_status() -> None:
    for message in [
        "est ce que jai pointé",
        "pointit ou nn",
        "هل سجلت الحضور اليوم؟",
    ]:
        response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE"))
        assert response.intent == "attendance.status", message
        assert response.actionResult["success"] is True


def test_pointage_check_in_requires_confirmation() -> None:
    response, _ = asyncio.run(send_chatbot_message("Je viens d'arriver", role="EMPLOYEE"))
    assert response.intent == "attendance.check_in"
    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "check_in"


def test_tunisian_pointage_actions_require_confirmation() -> None:
    check_in, _ = asyncio.run(send_chatbot_message("rani jit", role="EMPLOYEE"))
    check_out, _ = asyncio.run(send_chatbot_message("rani khrajt", role="EMPLOYEE"))
    assert check_in.intent == "attendance.check_in"
    assert check_in.type == "confirm_action"
    assert check_in.toolCalls[0].name == "check_in"
    assert check_out.intent == "attendance.check_out"
    assert check_out.type == "confirm_action"
    assert check_out.toolCalls[0].name == "check_out"


def test_forgot_checkout_is_read_only_advice() -> None:
    response, _ = asyncio.run(send_chatbot_message("Did I forget checkout?", role="EMPLOYEE"))
    assert response.intent == "attendance.forgot_checkout"
    assert response.type == "answer"
    assert any(call.name == "get_pointage_status" for call in response.toolCalls)


def test_arabic_forgot_checkout_is_read_only_advice() -> None:
    response, _ = asyncio.run(send_chatbot_message("هل نسيت تسجيل الخروج؟", role="EMPLOYEE"))
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
