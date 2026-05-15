from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.workflows.session_recovery import (
    build_resume_response,
    build_resume_unavailable_response,
    classify_recovery_message,
)
from app.workflows.session_state import SessionState


def verified_context() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role="EMPLOYEE",
        entreprise_id=9,
        token="token",
        language="fr",
        metadata={"jwt_verified": True},
    )


def test_classify_recovery_messages() -> None:
    assert classify_recovery_message("continue").action == "continue"
    assert classify_recovery_message("approve").action == "approve"
    assert classify_recovery_message("non").action == "reject"
    assert classify_recovery_message("besoin de mon statut").action == "none"


def test_build_resume_response_prefers_last_safe_response() -> None:
    session = SessionState.from_context(
        request_id="req-1",
        session_id="sess-1",
        context=verified_context(),
        channel="chat",
        language="fr",
    )
    session.last_safe_response = AgentResponse(
        type="ask",
        text="Quel motif souhaitez-vous indiquer ?",
        intent="leave.create",
        confidence=0.91,
    ).model_dump(mode="json")

    response = build_resume_response(session)

    assert response is not None
    assert response.type == "ask"
    assert response.text == "Quel motif souhaitez-vous indiquer ?"


def test_build_resume_response_falls_back_to_pending_confirmation() -> None:
    session = SessionState.from_context(
        request_id="req-2",
        session_id="sess-2",
        context=verified_context(),
        channel="chat",
        language="fr",
    )
    session.pending_confirmation = {
        "confirmation_id": "conf-1",
        "tool_name": "leave.create_request",
        "tool_arguments": {"start_date": "2026-06-01"},
        "status": "pending_confirmation",
    }

    response = build_resume_response(session)

    assert response is not None
    assert response.type == "confirm_action"
    assert response.confirmationId == "conf-1"
    assert response.requiresConfirmation is True


def test_build_resume_unavailable_response_is_controlled() -> None:
    response = build_resume_unavailable_response()

    assert response.intent == "conversation.resume_unavailable"
    assert response.text == "Aucune action en cours a reprendre."
