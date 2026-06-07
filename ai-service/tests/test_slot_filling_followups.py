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


async def _send_context(state, message: str, ctx, *, session_id: str = "slot-test", channel: str = "chat"):
    return await process_copilot_message(
        ctx.user_id,
        message,
        None,
        ctx.role,
        channel=channel,
        metadata={"app_state": state, "session_id": session_id, "language": ctx.language},
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


def test_document_type_followup_continues_pending_flow() -> None:
    state = make_state()
    first = asyncio.run(_send(state, "je veux une demande de document"))
    second = asyncio.run(_send(state, "attestation de travail"))

    assert first.type == "ask"
    assert second.intent == "document.create"
    assert second.type == "confirm_action"
    assert second.toolCalls[0].name == "document.create_request"
    assert second.actionResult["summary"]["type"] == "ATTESTATION_TRAVAIL"


def test_payslip_request_requires_month_then_confirms_with_month() -> None:
    state = make_state()
    first = asyncio.run(_send(state, "je veux un bulletin de paie"))
    second = asyncio.run(_send(state, "avril 2026"))

    assert first.type == "ask"
    assert first.intent == "document.create"
    assert "mois" in first.text.lower()
    pending = first.actionResult["pendingFlow"]
    assert pending["documentType"] == "BULLETIN_PAIE"
    assert pending["missingFields"] == ["month"]

    assert second.intent == "document.create"
    assert second.type == "confirm_action"
    assert second.toolCalls[0].name == "document.create_request"
    assert second.toolCalls[0].arguments == {
        "document_type": "BULLETIN_PAIE",
        "reason": None,
        "month": "Avril 2026",
    }
    assert second.actionResult["summary"]["moisConcerne"] == "Avril 2026"


def test_invalid_payslip_month_asks_again() -> None:
    state = make_state()
    first = asyncio.run(_send(state, "je veux un bulletin de paie"))
    second = asyncio.run(_send(state, "mois invente"))

    assert first.type == "ask"
    assert second.type == "ask"
    assert second.intent == "document.create"
    assert "mois" in second.text.lower()
    assert second.actionResult["pendingFlow"]["missingFields"] == ["month"]


def test_manager_payslip_month_followup_uses_same_personal_document_flow() -> None:
    state = make_state()
    manager = make_context("MANAGER", user_id=21, tenant_id=9)

    first = asyncio.run(_send_context(state, "je veux un bulletin de paie", manager, session_id="manager-docs"))
    second = asyncio.run(_send_context(state, "avril 2026", manager, session_id="manager-docs"))

    assert first.type == "ask"
    assert first.actionResult["pendingFlow"]["role"] == "MANAGER"
    assert second.type == "confirm_action"
    assert second.toolCalls[0].arguments["document_type"] == "BULLETIN_PAIE"
    assert second.toolCalls[0].arguments["month"] == "Avril 2026"


def test_confirm_without_pending_action_returns_controlled_message() -> None:
    state = make_state()
    response = asyncio.run(_send(state, "oui", session_id="no-pending"))

    assert response.intent == "confirmation.no_pending"
    assert response.type == "answer"
    assert response.actionResult["status"] == "unavailable"
    assert response.actionResult["code"] == "no_pending_confirmation"


def test_confirm_after_payslip_month_executes_backend_write_once() -> None:
    state = make_state()
    asyncio.run(_send(state, "je veux un bulletin de paie", session_id="doc-confirm"))
    second = asyncio.run(_send(state, "avril 2026", session_id="doc-confirm"))
    third = asyncio.run(_send(state, "oui", session_id="doc-confirm"))

    assert second.type == "confirm_action"
    assert third.intent == "confirmation.document.create_request"
    backend = state.copilot_backend_client
    assert ("POST", "/documents", {"type": "BULLETIN_PAIE", "moisConcerne": "Avril 2026", "motif": "Avril 2026"}) in backend.calls


def test_public_context_pending_flow_is_role_scoped() -> None:
    state = make_state()
    employee = make_context("EMPLOYEE", user_id=12, tenant_id=9)
    manager = make_context("MANAGER", user_id=12, tenant_id=9)

    first = asyncio.run(_send_context(state, "je veux un teletravail", employee, session_id="shared-session"))
    second = asyncio.run(_send_context(state, "pour demain", manager, session_id="shared-session"))

    assert first.type == "ask"
    assert second.intent != "telework.create"
    assert second.type != "confirm_action"


def test_voice_channel_uses_same_slot_filling_behavior() -> None:
    state = make_state()
    ctx = make_context("EMPLOYEE")
    first = asyncio.run(_send_context(state, "je veux un teletravail", ctx, session_id="voice-session", channel="voice"))
    second = asyncio.run(_send_context(state, "pour demain", ctx, session_id="voice-session", channel="voice"))

    assert first.type == "ask"
    assert second.intent == "telework.create"
    assert second.type == "confirm_action"


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
