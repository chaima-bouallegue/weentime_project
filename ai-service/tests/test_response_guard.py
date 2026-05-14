from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.guards.response_guard import SAFE_FALLBACK_TEXT, ResponseGuard
from app.models.agent_models import AgentResponse, ToolCallRecord


def context(role: str = "EMPLOYEE", tenant_id: int | None = 9) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role=role,
        entreprise_id=tenant_id,
        token="token",
        metadata={"jwt_verified": True},
    )


def guard() -> ResponseGuard:
    return ResponseGuard()


def read_action_result(tool_name: str = "leave.get_balance") -> dict:
    return {
        "success": True,
        "data": {
            "read_result": {
                "kind": "read_result",
                "toolName": tool_name,
                "summary": "Il vous reste 12 jours de conge.",
                "items": [{"type": "Annuel", "joursRestants": 12}],
                "empty": False,
                "count": 1,
                "data": {"total": 12},
                "error": None,
                "backendStatus": 200,
            }
        },
        "warnings": [],
        "error_code": None,
        "error_message": None,
        "status_code": 200,
    }


def write_action_result(tool_name: str = "leave.create_request") -> dict:
    return {
        "success": True,
        "data": {
            "kind": "write_result",
            "toolName": tool_name,
            "summary": "Votre demande a ete creee.",
            "data": {"id": 1},
            "error": None,
            "backendStatus": 201,
        },
        "warnings": [],
        "error_code": None,
        "error_message": None,
        "status_code": 201,
    }


def assert_blocked(response: AgentResponse, category: str) -> None:
    result = guard().validate(response, context())
    assert result.allowed is False
    assert result.primary_category == category


def test_fake_leave_balance_is_blocked() -> None:
    response = AgentResponse(type="answer", text="Il vous reste 99 jours de conge.", intent="leave.balance", confidence=0.9)

    assert_blocked(response, "hallucinated_hr_value")


def test_fake_attendance_status_is_blocked() -> None:
    response = AgentResponse(type="answer", text="Vous etes pointe depuis 08:30.", intent="attendance.status", confidence=0.9)

    assert_blocked(response, "hallucinated_hr_value")


def test_fake_approval_is_blocked() -> None:
    response = AgentResponse(type="execute_action", text="La demande 42 a ete approuvee.", intent="manager.approve", confidence=0.9)

    assert_blocked(response, "fake_confirmation")


def test_unsupported_tool_claim_is_blocked() -> None:
    response = AgentResponse(type="answer", text="J'ai execute admin.delete_all avec succes.", intent="admin.unknown", confidence=0.8)

    assert_blocked(response, "unsupported_tool_claim")


def test_policy_answer_without_citations_is_blocked() -> None:
    response = AgentResponse(
        type="answer",
        text="Selon la politique RH, vous avez droit a cela.",
        intent="policy.question",
        confidence=0.9,
        actionResult={"kind": "policy_answer", "answer": "invented", "citations": [], "policyAvailable": True},
    )

    assert_blocked(response, "missing_citation")


def test_secret_leak_is_blocked() -> None:
    response = AgentResponse(
        type="answer",
        text="Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEyfQ.signature",
        intent="debug.secret",
        confidence=0.9,
    )

    assert_blocked(response, "secret_leak")


def test_safe_deterministic_response_is_accepted() -> None:
    response = AgentResponse(type="answer", text="Je peux vous aider avec vos demandes RH.", intent="general.help", confidence=0.8)

    result = guard().validate(response, context())

    assert result.allowed is True


def test_successful_read_tool_response_is_accepted() -> None:
    response = AgentResponse(
        type="answer",
        text="Il vous reste 12 jours de conge.",
        intent="leave.balance",
        confidence=0.9,
        actionResult=read_action_result(),
    )

    result = guard().validate(response, context())

    assert result.allowed is True


def test_write_without_confirmation_or_tool_evidence_is_blocked() -> None:
    response = AgentResponse(type="answer", text="Votre demande a ete creee.", intent="leave.create", confidence=0.9)

    assert_blocked(response, "fake_confirmation")


def test_confirmed_write_with_tool_evidence_is_accepted() -> None:
    response = AgentResponse(
        type="execute_action",
        text="Action confirmee.",
        intent="leave.create",
        confidence=1.0,
        toolCalls=[ToolCallRecord(name="leave.create_request", arguments={}, status="success")],
        actionResult=write_action_result(),
    )

    result = guard().validate(response, context())

    assert result.allowed is True


def test_fallback_returned_when_guard_rejects() -> None:
    response = AgentResponse(type="answer", text="Il vous reste 99 jours de conge.", intent="leave.balance", confidence=0.9)

    guarded = guard().guard_response(response, context())

    assert guarded.type == "error"
    assert guarded.intent == "response.guard_rejected"
    assert guarded.text == SAFE_FALLBACK_TEXT
    assert guarded.actionResult is not None
    assert guarded.actionResult["category"] == "hallucinated_hr_value"


def test_unsafe_tenant_claim_is_blocked() -> None:
    response = AgentResponse(
        type="answer",
        text="Resultat trouve.",
        intent="admin.summary",
        confidence=0.9,
        actionResult={"success": True, "data": {"entrepriseId": 999}},
    )

    assert_blocked(response, "unsafe_tenant_claim")


def test_unsupported_status_is_blocked() -> None:
    response = AgentResponse(
        type="answer",
        text="Statut charge.",
        intent="leave.status",
        confidence=0.9,
        actionResult={"success": True, "data": {"status": "MAGICALLY_DONE"}},
    )

    assert_blocked(response, "unsupported_status")
