from __future__ import annotations

import asyncio

import pytest

from app.agents.attendance_agent import AttendanceAgent
from app.agents.reunion_agent import ReunionAgent
from app.core.copilot_engine import ensure_copilot_services
from app.nlp.intent_patterns import CHECK_IN, CHECK_OUT, GET_STATUS, match_intent
from app.nlp.language_detector import detect_language
from chatbot_test_helpers import make_context, make_state, send_chatbot_message


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Je veux poser un conge demain", "leave."),
        ("I need leave tomorrow", "leave."),
        ("أريد إجازة غدا", "leave."),
        ("nheb conge ghodwa", "leave."),
        ("nheb repos ghodwa", "leave."),
        ("nheb npointi", "attendance."),
        ("pointit ou nn", "attendance."),
        ("rani jit", "attendance."),
        ("Check my pointage", "attendance."),
        ("أريد العمل عن بعد غدا", "telework."),
        ("nheb nkhdem remote ghodwa", "telework."),
        ("أريد شهادة عمل", "document."),
        ("nheb war9a khidma", "document."),
    ],
)
def test_multilingual_prompts_route_to_domain_agents(message: str, expected: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE", language=detect_language(message)))
    assert response.intent.startswith(expected), response.intent
    assert not response.intent.startswith("fallback.")


@pytest.mark.parametrize(
    "message",
    [
        "je veux une demande de document",
        "I need a work certificate",
        "nheb document",
        "أريد وثيقة",
    ],
)
def test_document_request_priority_beats_leave_request_language_variants(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE", language=detect_language(message)))
    assert response.intent.startswith("document."), response.intent
    assert not response.intent.startswith("leave.")


@pytest.mark.parametrize(
    "message",
    [
        "est ce que jai pointé",
        "est ce que jai pointe",
        "pointit ou nn",
        "Did I check in?",
        "هل سجلت الحضور؟",
        "هل سجلت الحضور اليوم؟",
    ],
)
def test_pointage_status_priority_handles_fr_en_ar_questions(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE", language=detect_language(message)))
    assert response.intent == "attendance.status", response.intent
    assert not response.intent.startswith("fallback.")


def test_daily_summary_routes_to_role_intelligence_before_role_copilot() -> None:
    response, _ = asyncio.run(send_chatbot_message("Show my daily summary", role="EMPLOYEE", language="en"))
    assert response.intent == "role_intelligence.employee_digest"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "role_intelligence_digest"


def test_authorization_info_query_does_not_start_create() -> None:
    response, _ = asyncio.run(send_chatbot_message("c quoi les autorisations dispo", role="EMPLOYEE"))
    assert response.intent == "authorization.info"
    assert response.type == "answer"
    assert response.requiresConfirmation is False


@pytest.mark.parametrize(
    ("message", "role", "expected"),
    [
        ("Pending approvals", "MANAGER", "manager.pending_approvals"),
        ("RH backlog", "RH", "rh.all_requests"),
        ("System health", "ADMIN", "admin.system_health"),
    ],
)
def test_role_direct_prompts_use_central_priority(message: str, role: str, expected: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role=role, language="en"))
    assert response.intent == expected
    assert not response.intent.startswith("fallback.")


@pytest.mark.parametrize(
    ("message", "route_intent"),
    [
        ("nheb npointi", CHECK_IN),
        ("check me in", CHECK_IN),
        ("pointer depart", CHECK_OUT),
        ("did i check in", GET_STATUS),
    ],
)
def test_multilingual_pointage_patterns_are_deterministic(message: str, route_intent: str) -> None:
    matched = match_intent(message)
    assert matched is not None
    assert matched.intent == route_intent


def test_router_keeps_planning_as_capability_unavailable() -> None:
    state = make_state()
    services = ensure_copilot_services(state)
    response = asyncio.run(services["router_agent"].handle("My planning", make_context("EMPLOYEE")))
    assert response.intent == "planning.unavailable"
    assert response.actionResult["kind"] == "capability_unavailable"


def test_reunion_agent_routes_my_meetings_to_read_tool() -> None:
    state = make_state()
    services = ensure_copilot_services(state)
    agent = ReunionAgent(services["executor"])
    response = asyncio.run(agent.handle("My meetings", make_context("EMPLOYEE")))
    assert response.intent == "reunion.list_mine"
    assert response.actionResult["success"] is True
