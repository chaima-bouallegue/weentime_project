from __future__ import annotations

import asyncio

from chatbot_test_helpers import send_chatbot_message


def test_my_meetings_returns_meeting_read_or_unavailable_not_fallback() -> None:
    response, _ = asyncio.run(send_chatbot_message("My meetings", role="EMPLOYEE"))
    assert response.intent in {"reunion.list_mine", "meeting.unavailable"}
    assert not response.intent.startswith("fallback.")


def test_tunisian_meeting_prompt_routes_to_reunion_handler() -> None:
    response, _ = asyncio.run(send_chatbot_message("aandi meeting", role="EMPLOYEE", language="tn"))
    assert response.intent in {"reunion.list_mine", "meeting.unavailable"}
    assert not response.intent.startswith("fallback.")


def test_multilingual_meeting_prompts_route_to_reunion_handler() -> None:
    for message in ["هل لدي اجتماع؟", "fama réunion ?"]:
        response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE"))
        assert response.intent in {"reunion.list_mine", "meeting.unavailable"}, message
        assert not response.intent.startswith("fallback.")


def test_next_meeting_routes_to_reunion_next() -> None:
    response, _ = asyncio.run(send_chatbot_message("Quand est ma prochaine reunion ?", role="EMPLOYEE"))
    assert response.intent == "reunion.next"
    assert not response.intent.startswith("fallback.")


def test_personal_planning_returns_clean_capability_unavailable() -> None:
    response, _ = asyncio.run(send_chatbot_message("Quel est mon planning aujourd'hui ?", role="EMPLOYEE"))
    assert response.intent == "planning.unavailable"
    assert response.actionResult["kind"] == "capability_unavailable"


def test_manager_team_schedule_returns_manager_capability_unavailable() -> None:
    response, _ = asyncio.run(send_chatbot_message("Horaires equipe", role="MANAGER"))
    assert response.intent == "manager.team_schedule"
    assert response.actionResult["kind"] == "capability_unavailable"


def test_meeting_creation_returns_capability_unavailable_not_guard_fallback() -> None:
    response, _ = asyncio.run(send_chatbot_message("Create meeting tomorrow", role="MANAGER", language="en"))
    assert response.intent == "meeting.create.unavailable"
    assert response.actionResult["kind"] == "capability_unavailable"
    assert not response.intent.startswith("fallback.")
