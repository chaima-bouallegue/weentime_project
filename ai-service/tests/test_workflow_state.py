from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.workflows.workflow_state import WorkflowState


def test_workflow_state_from_context_copies_identity_and_channel() -> None:
    context = CurrentUserContext(
        user_id=12,
        role="EMPLOYEE",
        entreprise_id=9,
        token="token",
        language="tn",
        metadata={"jwt_verified": True},
    )

    state = WorkflowState.from_context("req-1", context, channel="voice")

    assert state.request_id == "req-1"
    assert state.user_id == 12
    assert state.tenant_id == 9
    assert state.role == "EMPLOYEE"
    assert state.channel == "voice"
    assert state.language == "tn"


def test_workflow_state_mark_fallback_updates_error_code() -> None:
    context = CurrentUserContext(
        user_id=12,
        role="RH",
        entreprise_id=13,
        token="token",
        metadata={"jwt_verified": True},
    )

    state = WorkflowState.from_context("req-2", context, channel="chat", language="fr")
    state.mark_fallback("provider_unavailable")

    payload = state.to_dict()
    assert payload["fallback_used"] is True
    assert payload["error_code"] == "provider_unavailable"
