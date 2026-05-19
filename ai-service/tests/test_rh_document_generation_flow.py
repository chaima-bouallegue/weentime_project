from __future__ import annotations

import asyncio

from app.core.copilot_engine import process_copilot_message
from chatbot_test_helpers import make_context_with_metadata, make_state, send_chatbot_message


def test_document_generate_partial_employee_asks_choice() -> None:
    response, state = asyncio.run(
        send_chatbot_message("generi attestation Amin", role="RH", current_page="/app/rh/documents", session_id="doc-choice")
    )

    assert response.type == "ask"
    assert response.intent == "rh.document_generate"
    assert "plusieurs" in response.text.lower()
    assert any(call[0] == "GET" for call in state.copilot_backend_client.calls)


def test_document_generate_followup_continues_pending_flow() -> None:
    async def run_flow():
        state = make_state()
        session_id = "doc-followup"
        ctx1 = make_context_with_metadata("RH", current_page="/app/rh/documents", conversation_id=session_id)
        first = await process_copilot_message(
            ctx1.user_id,
            "generi attestation Amin",
            None,
            ctx1.role,
            metadata={"app_state": state, "session_id": session_id, "conversation_id": session_id, "current_page": "/app/rh/documents", "language": "fr"},
            context=ctx1,
        )
        ctx2 = make_context_with_metadata("RH", current_page="/app/rh/documents", conversation_id=session_id)
        second = await process_copilot_message(
            ctx2.user_id,
            "amin dupont",
            None,
            ctx2.role,
            metadata={"app_state": state, "session_id": session_id, "conversation_id": session_id, "current_page": "/app/rh/documents", "language": "fr"},
            context=ctx2,
        )
        return first, second, state

    first, second, state = asyncio.run(run_flow())

    assert first.type == "ask"
    assert second.type == "confirm_action"
    assert second.toolCalls[0].name == "rh.document.generate"
    assert second.toolCalls[0].arguments["employe_nom"] == "Dupont"
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)
