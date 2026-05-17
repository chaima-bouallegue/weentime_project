from __future__ import annotations

import asyncio

from chatbot_test_helpers import send_chatbot_message


def test_manager_pending_approvals_use_manager_agent() -> None:
    response, _ = asyncio.run(send_chatbot_message("Pending approvals", role="MANAGER"))
    assert response.intent == "manager.pending_approvals"
    assert response.actionResult["kind"] == "manager_pending_summary"
    assert not response.intent.startswith("fallback.")


def test_manager_can_point_personally() -> None:
    response, _ = asyncio.run(send_chatbot_message("Did I check in?", role="MANAGER"))
    assert response.intent == "attendance.status"
    assert any(call.name == "get_pointage_status" for call in response.toolCalls)


def test_manager_team_presence_uses_attendance_tool() -> None:
    response, _ = asyncio.run(send_chatbot_message("Pointage equipe", role="MANAGER"))
    assert response.intent == "attendance.team_presence"
    assert response.actionResult["success"] is True


def test_manager_approval_creates_confirmation_after_details() -> None:
    response, _ = asyncio.run(send_chatbot_message("Approuve le conge 42", role="MANAGER"))
    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.actionResult["kind"] == "approval_confirmation"
