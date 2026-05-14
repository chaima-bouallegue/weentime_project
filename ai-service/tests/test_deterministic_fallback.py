from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.core.deterministic_fallback import deterministic_fallback_response
from app.guards.response_guard import ResponseGuard
from app.models.agent_models import AgentResponse


def context(language: str = "fr", request_id: str = "req-123") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role="EMPLOYEE",
        entreprise_id=9,
        token="token",
        language=language,
        metadata={"jwt_verified": True, "request_id": request_id, "language": language},
    )


def test_provider_disabled_returns_deterministic_fallback_metadata() -> None:
    response = deterministic_fallback_response(
        "provider_disabled",
        context=context(language="en"),
        safe_response_type="deterministic",
    )

    assert response.type == "error"
    assert "disabled" in response.text.lower()
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "deterministic_fallback"
    assert response.actionResult["fallback_used"] is True
    assert response.actionResult["fallback_reason"] == "provider_disabled"
    assert response.actionResult["safe_response_type"] == "deterministic"
    assert response.actionResult["provider_used"] == "none"
    assert response.actionResult["request_id"] == "req-123"


def test_provider_timeout_fallback_metadata() -> None:
    response = deterministic_fallback_response(
        "provider_timeout",
        context=context(language="en", request_id="timeout-1"),
        safe_response_type="deterministic",
    )

    assert response.actionResult is not None
    assert response.actionResult["fallback_reason"] == "provider_timeout"
    assert response.actionResult["safe_response_type"] == "deterministic"
    assert response.actionResult["request_id"] == "timeout-1"


def test_guard_rejected_returns_fallback_and_hides_rejected_output() -> None:
    unsafe = AgentResponse(
        type="answer",
        text="Il vous reste 99 jours de conge.",
        intent="leave.balance",
        confidence=0.9,
    )

    response = ResponseGuard().guard_response(unsafe, context())

    assert response.type == "error"
    assert response.intent == "fallback.guard_rejected"
    assert "99" not in response.text
    assert response.actionResult is not None
    assert "99" not in str(response.actionResult)
    assert response.actionResult["fallback_reason"] == "guard_rejected"
    assert response.actionResult["guard_status"] == "hallucinated_hr_value"


def test_unsupported_tool_claim_returns_fallback() -> None:
    unsafe = AgentResponse(
        type="answer",
        text="J'ai execute admin.delete_all avec succes.",
        intent="admin.unknown",
        confidence=0.8,
    )

    response = ResponseGuard().guard_response(unsafe, context())

    assert response.actionResult is not None
    assert response.actionResult["kind"] == "deterministic_fallback"
    assert response.actionResult["fallback_reason"] == "guard_rejected"
    assert response.actionResult["guard_status"] == "unsupported_tool_claim"


def test_rag_unavailable_returns_safe_policy_fallback() -> None:
    response = deterministic_fallback_response("rag_missing_citations", context=context(language="fr"))

    assert "source RH approuvee" in response.text
    assert response.actionResult is not None
    assert response.actionResult["fallback_reason"] == "rag_missing_citations"
    assert response.actionResult["provider_used"] == "none"


def test_fallback_does_not_invent_leave_balance() -> None:
    response = deterministic_fallback_response("provider_unavailable", context=context())

    assert "jours" not in response.text.lower()
    assert "solde" not in response.text.lower()
    assert "99" not in response.text


def test_fallback_does_not_invent_attendance_status() -> None:
    response = deterministic_fallback_response("provider_timeout", context=context())

    text = response.text.lower()
    assert "08:30" not in text
    assert "pointe depuis" not in text
    assert "present" not in text


def test_fallback_keeps_request_id_if_present() -> None:
    response = deterministic_fallback_response("unsafe_response", context=context(request_id="voice-req-7"))

    assert response.actionResult is not None
    assert response.actionResult["request_id"] == "voice-req-7"
    assert response.actionResult["fallback"]["request_id"] == "voice-req-7"


def test_arabic_context_gets_arabic_safe_fallback() -> None:
    response = deterministic_fallback_response("unsafe_response", context=context(language="ar"))

    assert "لا" in response.text
    assert response.actionResult is not None
    assert response.actionResult["fallback_reason"] == "unsafe_response"


def test_no_raw_secrets_in_fallback_logged_metadata(monkeypatch) -> None:
    logged_metadata: list[dict] = []

    def capture_event(name, *, input=None, output=None, metadata=None):
        logged_metadata.append(metadata or {})

    monkeypatch.setattr("app.guards.response_guard.log_event", capture_event)
    monkeypatch.setattr("app.core.deterministic_fallback.log_event", capture_event)
    unsafe = AgentResponse(
        type="answer",
        text="Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEyfQ.signature",
        intent="debug.secret",
        confidence=0.9,
    )

    response = ResponseGuard().guard_response(unsafe, context())
    serialized_metadata = str(logged_metadata)

    assert response.actionResult is not None
    assert "Bearer" not in response.text
    assert "eyJhbGciOiJIUzI1NiJ9" not in response.text
    assert "Bearer" not in serialized_metadata
    assert "eyJhbGciOiJIUzI1NiJ9" not in serialized_metadata
