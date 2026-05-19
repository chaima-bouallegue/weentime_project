from __future__ import annotations

import asyncio

from chatbot_test_helpers import send_chatbot_message


def test_affecter_employe_equipe_asks_slots_not_unavailable() -> None:
    response, state = asyncio.run(
        send_chatbot_message("Affecter employe equipe", role="RH", current_page="/app/rh/structure/equipes")
    )

    assert response.type == "ask"
    assert response.intent == "rh.structure.employee.assign_team"
    assert "employe" in response.text.lower()
    assert "equipe" in response.text.lower()
    assert response.actionResult["kind"] == "slot_filling"
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_tn_assign_name_to_team_prepares_confirmation() -> None:
    response, state = asyncio.run(
        send_chatbot_message("affecti Amin lel frontend", role="RH", current_page="/app/rh/structure/equipes")
    )

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "rh.structure.employee.assign_team"
    assert response.toolCalls[0].arguments["employee_name"].lower().startswith("amin")
    assert response.toolCalls[0].arguments["team_name"] == "Frontend"
    assert any(call[0] == "GET" for call in state.copilot_backend_client.calls)
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)
