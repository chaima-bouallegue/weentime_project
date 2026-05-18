from __future__ import annotations

import asyncio
from typing import Any

from app.context.current_user import CurrentUserContext
from app.tools.result import ToolResult
from chatbot_test_helpers import ChatbotFakeBackend, send_chatbot_message


class NoEntryBackend(ChatbotFakeBackend):
    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params))
        if path == "/presence/me/today":
            return ToolResult.ok({"status": "ABSENT", "active": False, "checkIn": None, "checkOut": None})
        return await super().get(path, context=context, params=params)


def test_rh_structure_prompt_never_routes_to_checkout() -> None:
    response, state = asyncio.run(
        send_chatbot_message(
            "aamel departement engineering",
            role="RH",
            current_page="/app/rh/structure/departments",
        )
    )

    assert response.intent == "organisation.create_department"
    assert not any(call[1] == "/presence/me/check-out" for call in state.copilot_backend_client.calls)


def test_rh_schedule_prompt_never_routes_to_attendance_or_planning_unavailable() -> None:
    response, state = asyncio.run(send_chatbot_message("warini horaires", role="RH", current_page="/app/rh/horaires"))

    assert response.intent == "rh.schedule.list"
    assert any(call[1] == "/horaires" for call in state.copilot_backend_client.calls)
    assert not response.intent.startswith("attendance.")
    assert response.actionResult["success"] is True


def test_rh_checkout_reads_status_and_returns_no_data_when_no_entry() -> None:
    backend = NoEntryBackend()
    response, state = asyncio.run(
        send_chatbot_message("pointe sortie", role="RH", current_page="/app/rh/pointage", backend=backend)
    )

    assert response.intent == "attendance.check_out"
    assert response.type == "answer"
    assert response.actionResult["kind"] == "no_data"
    assert "Aucun pointage" in response.text
    assert any(call[1] == "/presence/me/today" for call in state.copilot_backend_client.calls)
    assert not any(call[1] == "/presence/me/check-out" for call in state.copilot_backend_client.calls)


def test_rh_explicit_checkout_can_create_confirmation_when_entry_exists() -> None:
    response, state = asyncio.run(send_chatbot_message("pointe sortie", role="RH", current_page="/app/rh/pointage"))

    assert response.intent == "attendance.check_out"
    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "get_pointage_status"
    assert response.toolCalls[-1].name == "check_out"
    assert not any(call[1] == "/presence/me/check-out" for call in state.copilot_backend_client.calls)
