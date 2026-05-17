from __future__ import annotations

import asyncio

from chatbot_test_helpers import send_chatbot_message


def test_employee_leave_balance_uses_tool_result() -> None:
    response, _ = asyncio.run(send_chatbot_message("Combien il me reste de jours de conge ?", role="EMPLOYEE"))
    assert response.intent == "leave.balance"
    assert response.actionResult["success"] is True
    assert any(call.name == "leave.get_balance" for call in response.toolCalls)


def test_employee_document_request_requires_confirmation() -> None:
    response, _ = asyncio.run(send_chatbot_message("Je veux une attestation de travail", role="EMPLOYEE"))
    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "document.create_request"


def test_employee_daily_summary_is_role_intelligence_not_fallback() -> None:
    response, _ = asyncio.run(send_chatbot_message("Show my daily summary", role="EMPLOYEE"))
    assert response.intent in {
        "employee_intelligence.digest",
        "role_intelligence.digest",
        "employee.summary",
        "employee.daily_briefing",
    } or any(token in response.intent for token in ("digest", "briefing"))
    assert not response.intent.startswith("fallback.")
    assert response.actionResult is not None


def test_employee_meetings_and_planning_do_not_guard_fallback() -> None:
    meetings, _ = asyncio.run(send_chatbot_message("My meetings", role="EMPLOYEE"))
    planning, _ = asyncio.run(send_chatbot_message("My planning", role="EMPLOYEE"))
    assert not meetings.intent.startswith("fallback.")
    assert planning.intent == "planning.unavailable"
