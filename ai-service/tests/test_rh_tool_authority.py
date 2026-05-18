from __future__ import annotations

import asyncio

from chatbot_test_helpers import send_chatbot_message


def test_rh_schedule_read_uses_toolregistry_backend_not_fake_text() -> None:
    response, state = asyncio.run(send_chatbot_message("warini horaires", role="RH", current_page="/app/rh/horaires"))

    assert response.intent == "rh.schedule.list"
    assert response.actionResult["success"] is True
    assert response.toolCalls[0].name == "schedule.list"
    assert any(call[1] == "/horaires" for call in state.copilot_backend_client.calls)


def test_rh_write_intent_does_not_execute_backend_without_confirmation() -> None:
    response, state = asyncio.run(
        send_chatbot_message("aamel departement engineering", role="RH", current_page="/app/rh/structure/departments")
    )

    assert response.intent == "organisation.create_department"
    assert response.type == "ask"
    assert not any(call[0] in {"POST", "PUT", "PATCH", "DELETE"} for call in state.copilot_backend_client.calls)


def test_rh_policy_question_routes_to_policy_not_live_tools() -> None:
    response, state = asyncio.run(send_chatbot_message("Quelle est la politique teletravail ?", role="RH"))

    assert response.intent.startswith("policy.") or response.intent == "rh.policy.question"
    assert not any(call[1] in {"/rh/stats", "/presence/company/today", "/rh/conges/rh/pending"} for call in state.copilot_backend_client.calls)


def test_unsupported_future_rh_module_returns_capability_unavailable() -> None:
    response, _ = asyncio.run(send_chatbot_message("Comparer CV candidat", role="RH"))

    assert response.actionResult["kind"] == "capability_unavailable"
    assert not response.intent.startswith("fallback.")
