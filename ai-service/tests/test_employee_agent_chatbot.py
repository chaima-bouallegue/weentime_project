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


def test_multilingual_employee_daily_summary_routes_to_digest() -> None:
    for message in [
        "Que dois-je faire aujourd’hui ?",
        "ماذا يجب أن أفعل اليوم؟",
        "chnowa najem naamel tawa",
        "aatini résumé",
    ]:
        response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE"))
        assert response.intent == "role_intelligence.employee_digest", message
        assert response.actionResult is not None


def test_employee_meetings_and_planning_do_not_guard_fallback() -> None:
    meetings, _ = asyncio.run(send_chatbot_message("My meetings", role="EMPLOYEE"))
    planning, _ = asyncio.run(send_chatbot_message("My planning", role="EMPLOYEE"))
    assert not meetings.intent.startswith("fallback.")
    assert planning.intent == "planning.unavailable"


def test_employee_multilingual_leave_read_and_create_routes() -> None:
    balance_prompts = [
        "Combien me reste de congé ?",
        "Check my leave balance",
        "كم بقي لدي من الإجازات؟",
        "9adech mazeli congé",
    ]
    for message in balance_prompts:
        response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE"))
        assert response.intent == "leave.balance", message
        assert any(call.name == "leave.get_balance" for call in response.toolCalls)

    create_prompts = [
        "Je veux un congé demain",
        "I need leave tomorrow",
        "أريد إجازة غدا",
        "nheb congé ghodwa",
        "nheb repos ghodwa",
    ]
    for message in create_prompts:
        response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE"))
        assert response.intent == "leave.create", message
        assert response.type in {"ask", "confirm_action"}
        assert not response.intent.startswith("fallback.")


def test_employee_multilingual_telework_routes_to_flow() -> None:
    for message in [
        "Je veux télétravailler demain",
        "I want remote work tomorrow",
        "أريد العمل عن بعد غدا",
        "nheb nkhdem remote ghodwa",
        "nheb teletravail ghodwa",
    ]:
        response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE"))
        assert response.intent == "telework.create", message
        assert response.type in {"ask", "confirm_action"}
        assert not response.intent.startswith("fallback.")


def test_employee_multilingual_document_routes_to_document_flow() -> None:
    for message in [
        "Je veux une attestation",
        "I need a work certificate",
        "أريد شهادة عمل",
        "nheb war9a khidma",
    ]:
        response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE"))
        assert response.intent == "document.create", message
        assert response.type == "confirm_action"
        assert response.toolCalls[0].name == "document.create_request"


def test_employee_multilingual_meetings_and_planning_routes_safely() -> None:
    planning, _ = asyncio.run(send_chatbot_message("C’est quoi mon planning ?", role="EMPLOYEE"))
    assert planning.intent == "planning.unavailable"
    assert planning.actionResult["kind"] == "capability_unavailable"

    for message in ["My meetings", "هل لدي اجتماع؟", "aandi meeting", "fama réunion ?"]:
        response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE"))
        assert response.intent == "reunion.list_mine", message
        assert not response.intent.startswith("fallback.")


def test_employee_policy_question_routes_to_policy_without_fake_answer() -> None:
    response, _ = asyncio.run(send_chatbot_message("Comment déclarer une absence ?", role="EMPLOYEE"))
    assert response.intent == "policy.question"
    assert response.actionResult["kind"] == "policy_answer"
    assert response.actionResult["citations"] == []
    assert "source RH" in response.text
