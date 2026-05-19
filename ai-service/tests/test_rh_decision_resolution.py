from __future__ import annotations

import asyncio

from chatbot_test_helpers import send_chatbot_message


def test_telework_approve_by_employee_name_resolves_pending_request() -> None:
    response, state = asyncio.run(
        send_chatbot_message("valide teletravaille du Amin", role="RH", current_page="/app/rh/teletravail")
    )

    assert response.type == "confirm_action"
    assert response.intent == "rh.telework.approve"
    assert response.toolCalls[0].name == "rh.telework.approve"
    assert response.toolCalls[0].arguments["request_id"] == 44
    assert any(call[0] == "GET" and call[1] == "/rh/teletravail/en-attente-rh" for call in state.copilot_backend_client.calls)
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_leave_reject_by_missing_employee_returns_no_data_not_fallback() -> None:
    response, state = asyncio.run(send_chatbot_message("Refuse conge de Awa", role="RH", current_page="/app/rh/conges"))

    assert response.type == "answer"
    assert response.intent == "rh.leave.reject"
    assert response.actionResult["kind"] == "no_data"
    assert "aucune demande" in response.text.lower()
    assert any(call[0] == "GET" and call[1] == "/rh/conges/rh/pending" for call in state.copilot_backend_client.calls)


def test_approve_by_name_and_date_filters_pending_requests() -> None:
    response, _ = asyncio.run(
        send_chatbot_message("Valide teletravail de Amin demain", role="RH", current_page="/app/rh/teletravail")
    )

    assert response.type == "confirm_action"
    assert response.toolCalls[0].arguments["request_id"] == 44
