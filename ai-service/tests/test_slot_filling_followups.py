from __future__ import annotations

import asyncio

from chatbot_test_helpers import make_state, make_context
from app.core.copilot_engine import process_copilot_message


async def _send(state, message: str, *, session_id: str = "slot-test"):
    ctx = make_context("EMPLOYEE")
    return await process_copilot_message(
        ctx.user_id,
        message,
        None,
        ctx.role,
        metadata={"app_state": state, "session_id": session_id, "language": "fr"},
        context=ctx,
    )


def test_telework_followup_pour_demain_continues_pending_flow() -> None:
    state = make_state()
    first = asyncio.run(_send(state, "je veux un teletravail"))
    second = asyncio.run(_send(state, "pour demain"))
    assert first.intent in {"telework.create.ask", "telework.create"}
    assert first.type == "ask"
    assert second.intent == "telework.create"
    assert second.type == "confirm_action"
    assert second.requiresConfirmation is True


def test_tunisian_telework_followup_keeps_pending_flow() -> None:
    state = make_state()
    first = asyncio.run(_send(state, "nheb teletravail"))
    second = asyncio.run(_send(state, "pour demain"))
    assert first.intent in {"telework.create.ask", "telework.create"}
    assert first.type == "ask"
    assert second.intent == "telework.create"
    assert second.type == "confirm_action"
    assert second.requiresConfirmation is True


def test_document_request_asks_only_missing_type() -> None:
    state = make_state()
    response = asyncio.run(_send(state, "je veux une demande de document"))
    assert response.intent == "document.create"
    assert response.type == "ask"
    assert "type" in response.text.lower()


def test_cancel_pending_flow_clears_request() -> None:
    state = make_state()
    asyncio.run(_send(state, "je veux un teletravail"))
    response = asyncio.run(_send(state, "annuler"))
    assert "annule" in response.intent or "cancel" in response.intent or "annule" in response.text.lower()


def test_pourquoi_explains_last_error() -> None:
    state = make_state()
    ctx = make_context("EMPLOYEE")
    from app.core.copilot_engine import ensure_copilot_services
    services = ensure_copilot_services(state)
    services["conversation_store"].record_last_error(ctx, "Le backend teletravail est indisponible", session_id="slot-test")
    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "pourquoi",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "slot-test", "language": "fr"},
            context=ctx,
        )
    )
    assert response.intent == "conversation.explain_last_error"
    assert "backend teletravail" in response.text.lower()
