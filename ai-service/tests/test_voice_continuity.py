from __future__ import annotations

import asyncio

from chatbot_test_helpers import make_context_with_metadata, make_state
from app.core.copilot_engine import process_copilot_message


async def _send(state, message: str, *, role: str = "EMPLOYEE", language: str = "fr", session_id: str = "memory-test", channel: str = "chat", current_page: str = "/app/chat"):
    ctx = make_context_with_metadata(
        role,
        language=language,
        current_page=current_page,
        conversation_id=session_id,
        channel=channel,
    )
    return await process_copilot_message(
        ctx.user_id,
        message,
        None,
        ctx.role,
        channel=channel,
        metadata={
            "app_state": state,
            "session_id": session_id,
            "conversation_id": session_id,
            "current_page": current_page,
            "language": language,
        },
        context=ctx,
    )


def test_text_and_voice_share_pending_telework_flow() -> None:
    state = make_state()
    first = asyncio.run(_send(state, "je veux un teletravail", session_id="shared-flow", channel="chat"))
    second = asyncio.run(_send(state, "ghodwa", language="tn", session_id="shared-flow", channel="voice"))

    assert first.type == "ask"
    assert second.type == "confirm_action"
    assert second.intent == "telework.create"
    assert second.requiresConfirmation is True


def test_voice_cancel_clears_text_started_flow() -> None:
    state = make_state()
    first = asyncio.run(_send(state, "je veux un teletravail", session_id="cancel-flow", channel="chat"))
    cancelled = asyncio.run(_send(state, "batel", language="tn", session_id="cancel-flow", channel="voice"))
    followup = asyncio.run(_send(state, "ghodwa", language="tn", session_id="cancel-flow", channel="chat"))

    assert first.type == "ask"
    assert cancelled.intent.endswith(".cancelled")
    assert followup.intent != "telework.create"
    assert followup.type != "confirm_action"


def test_arabic_cancel_clears_pending_flow() -> None:
    state = make_state()
    asyncio.run(_send(state, "I need leave", language="en", session_id="arabic-cancel"))
    cancelled = asyncio.run(_send(state, "\u0625\u0644\u063a\u0627\u0621", language="ar", session_id="arabic-cancel"))
    assert cancelled.intent.endswith(".cancelled")


def test_tunisian_why_explains_last_safe_error() -> None:
    state = make_state()
    ctx = make_context_with_metadata("EMPLOYEE", language="tn", conversation_id="why-flow", channel="chat")
    from app.core.copilot_engine import ensure_copilot_services

    services = ensure_copilot_services(state)
    services["conversation_store"].record_last_error(ctx, "Le backend teletravail est indisponible", session_id="why-flow")
    response = asyncio.run(
        process_copilot_message(
            ctx.user_id,
            "3leh ?",
            None,
            ctx.role,
            metadata={"app_state": state, "session_id": "why-flow", "conversation_id": "why-flow", "language": "tn"},
            context=ctx,
        )
    )

    assert response.intent == "conversation.explain_last_error"
    assert "backend teletravail" in response.text.lower()