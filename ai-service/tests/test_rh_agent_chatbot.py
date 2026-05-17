from __future__ import annotations

import asyncio

from chatbot_test_helpers import send_chatbot_message


def test_rh_backlog_uses_modern_reads() -> None:
    response, _ = asyncio.run(send_chatbot_message("RH backlog", role="RH"))
    assert response.intent == "rh.all_requests"
    assert response.actionResult["kind"] == "rh_request_summary"
    assert any(call.name == "leave.list_rh_pending" for call in response.toolCalls)


def test_rh_presence_today_routes_to_company_presence() -> None:
    response, _ = asyncio.run(send_chatbot_message("Presence aujourd'hui", role="RH"))
    assert response.intent == "rh.presence_today"
    assert any(call.name == "get_team_presence" for call in response.toolCalls)


def test_rh_create_user_is_clean_capability_message() -> None:
    response, _ = asyncio.run(send_chatbot_message("je veux creer un nouveau user", role="RH"))
    assert response.intent == "rh.create_user_unavailable"
    assert response.actionResult["kind"] == "rh_capability_unavailable"


def test_rh_document_workload_uses_document_tool() -> None:
    response, _ = asyncio.run(send_chatbot_message("Document workload", role="RH"))
    assert response.intent == "rh.document_workload"
    assert any(call.name == "document.rh_workload" for call in response.toolCalls)
