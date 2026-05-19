from __future__ import annotations

import asyncio

from app.tools.result import ToolResult
from chatbot_test_helpers import ChatbotFakeBackend, send_chatbot_message


class NoEntryBackend(ChatbotFakeBackend):
    async def get(self, path, *, context, params=None):
        if path == "/presence/me/today":
            self.calls.append(("GET", path, params))
            return ToolResult.ok({"status": "ABSENT", "state": "NOT_STARTED", "checkIn": None, "checkOut": None})
        return await super().get(path, context=context, params=params)


def test_arabic_check_in_on_rh_pointage_reads_status_then_confirms() -> None:
    response, state = asyncio.run(
        send_chatbot_message("سجل الحضور", role="RH", current_page="/app/rh/pointage", backend=NoEntryBackend(), language="ar")
    )

    assert response.type == "confirm_action"
    assert response.intent == "attendance.check_in"
    assert response.toolCalls[0].name == "get_pointage_status"
    assert response.toolCalls[1].name == "check_in"
    assert any(call[0] == "GET" and call[1] == "/presence/me/today" for call in state.copilot_backend_client.calls)
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_checkout_with_no_entry_returns_no_data() -> None:
    response, state = asyncio.run(
        send_chatbot_message("pointe sortie", role="RH", current_page="/app/rh/pointage", backend=NoEntryBackend())
    )

    assert response.type == "answer"
    assert response.intent == "attendance.check_out"
    assert response.actionResult["kind"] == "no_data"
    assert "aucun pointage" in response.text.lower()
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)
