from __future__ import annotations

import asyncio

from chatbot_test_helpers import make_context_with_metadata, make_state
from app.core.copilot_engine import process_copilot_message


async def _send(message: str, *, page: str, role: str = "RH", session_id: str = "rh-page"):
    state = make_state()
    ctx = make_context_with_metadata(role, current_page=page, conversation_id=session_id)
    response = await process_copilot_message(
        ctx.user_id,
        message,
        None,
        ctx.role,
        metadata={"app_state": state, "session_id": session_id, "conversation_id": session_id, "current_page": page, "language": "fr"},
        context=ctx,
    )
    return response, ctx, state


def test_rh_department_page_prioritizes_department_create_not_attendance() -> None:
    response, ctx, _ = asyncio.run(_send("je veux creer departement Data", page="/app/rh/structure/departments"))

    assert response.intent == "organisation.create_department"
    assert response.type == "ask"
    assert ctx.metadata["selected_agent"] == "organisation"
    assert response.actionResult["pendingFlow"]["currentPage"] == "/app/rh/structure/departments"
    assert not response.intent.startswith("attendance.")


def test_rh_team_page_prioritizes_team_create() -> None:
    response, ctx, _ = asyncio.run(_send("creer equipe IA", page="/app/rh/structure/equipes"))

    assert response.intent == "rh.structure.team.create"
    assert response.type == "ask"
    assert ctx.metadata["selected_agent"] == "organisation"


def test_rh_pointage_page_prioritizes_global_presence_read() -> None:
    response, ctx, state = asyncio.run(_send("Presence aujourd hui", page="/app/rh/pointage"))

    assert response.intent in {"rh.presence_today", "rh.attendance.today"}
    assert ctx.metadata["selected_agent"] == "rh"
    assert any(call[1] == "/presence/company/today" for call in state.copilot_backend_client.calls)


def test_rh_attendance_write_blocked_unless_explicit_personal_pointage() -> None:
    blocked, _, _ = asyncio.run(_send("je veux creer departement", page="/app/rh/structure/departments"))
    explicit, _, _ = asyncio.run(_send("rani khrajt", page="/app/rh/structure/departments", session_id="rh-explicit"))

    assert not blocked.intent.startswith("attendance.")
    assert explicit.intent == "attendance.check_out"
    assert explicit.type == "confirm_action"


def test_rh_leave_page_prioritizes_rh_leave_workflow() -> None:
    response, ctx, _ = asyncio.run(_send("demandes en attente", page="/app/rh/conges"))

    assert response.intent.startswith("rh.")
    assert ctx.metadata["selected_agent"] == "rh"
