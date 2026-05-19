from __future__ import annotations

import asyncio

from app.core.copilot_engine import process_copilot_message
from chatbot_test_helpers import make_context_with_metadata, make_state


def test_team_create_slot_filling_keeps_team_context() -> None:
    async def run_flow():
        state = make_state()
        session_id = "team-slot"
        ctx1 = make_context_with_metadata("RH", current_page="/app/rh/structure/equipes", conversation_id=session_id)
        first = await process_copilot_message(
            ctx1.user_id,
            "aamel equipe ai",
            None,
            ctx1.role,
            metadata={"app_state": state, "session_id": session_id, "conversation_id": session_id, "current_page": "/app/rh/structure/equipes", "language": "fr"},
            context=ctx1,
        )
        ctx2 = make_context_with_metadata("RH", current_page="/app/rh/structure/equipes", conversation_id=session_id)
        second = await process_copilot_message(
            ctx2.user_id,
            "departement 3",
            None,
            ctx2.role,
            metadata={"app_state": state, "session_id": session_id, "conversation_id": session_id, "current_page": "/app/rh/structure/equipes", "language": "fr"},
            context=ctx2,
        )
        return first, second, state

    first, second, state = asyncio.run(run_flow())

    assert first.type == "ask"
    assert first.intent == "rh.structure.team.create"
    assert "departement" in first.text.lower()
    assert "nommer ce departement" not in first.text.lower()
    assert second.type == "confirm_action"
    assert second.toolCalls[0].name == "rh.structure.team.create"
    assert second.toolCalls[0].arguments["nom"].lower() == "ai"
    assert second.toolCalls[0].arguments["departement_id"] == 3
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)
