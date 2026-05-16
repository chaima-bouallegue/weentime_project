"""Verify FakeConfirmationRule rejects success-y text when the underlying
tool call indicates failure.

Before this slice, a backend 4xx/5xx wrapped as actionResult={success: False,
error: "..."} could pass guard if its text contained "approved" / "created
successfully" / etc. — leading to the user seeing "Action approved" on a
backend failure (the autorisation screenshot bug).
"""
from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.models.agent_models import AgentResponse, ToolCallRecord


def _context() -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role="EMPLOYEE", entreprise_id=9, token="token")


def test_success_text_with_failed_action_result_is_rejected() -> None:
    response = AgentResponse(
        type="execute_action",
        text="Votre demande a ete creee.",
        intent="authorization.create",
        confidence=0.9,
        toolCalls=[ToolCallRecord(name="authorization.create_request", arguments={}, status="failed")],
        actionResult={
            "kind": "write_result",
            "success": False,
            "error": "404 Not Found",
            "backendStatus": 404,
        },
    )

    result = ResponseGuard().validate(response, _context())

    assert result.allowed is False
    assert result.primary_category == "fake_confirmation"


def test_success_text_with_error_field_is_rejected() -> None:
    response = AgentResponse(
        type="answer",
        text="Action approved",
        intent="authorization.create",
        confidence=0.9,
        actionResult={
            "kind": "write_result",
            "error": "Backend unavailable",
        },
    )

    result = ResponseGuard().validate(response, _context())

    assert result.allowed is False
    assert result.primary_category == "fake_confirmation"


def test_success_text_with_failed_tool_call_status_is_rejected() -> None:
    response = AgentResponse(
        type="answer",
        text="Created successfully",
        intent="leave.create",
        confidence=0.9,
        toolCalls=[ToolCallRecord(name="leave.create_request", arguments={}, status="failed")],
    )

    result = ResponseGuard().validate(response, _context())

    assert result.allowed is False
    assert result.primary_category == "fake_confirmation"


def test_failure_without_success_text_is_allowed() -> None:
    """Control case: a failed write whose text honestly reports the failure
    must still pass FakeConfirmationRule (other rules may still apply)."""
    response = AgentResponse(
        type="error",
        text="Le service est momentanement indisponible.",
        intent="authorization.create",
        confidence=0.9,
        toolCalls=[ToolCallRecord(name="authorization.create_request", arguments={}, status="failed")],
        actionResult={
            "kind": "write_result",
            "success": False,
            "error": "Backend timeout",
        },
    )

    result = ResponseGuard().validate(response, _context())

    # FakeConfirmationRule does not fire (no success-y text).
    assert result.primary_category != "fake_confirmation"


def test_success_text_with_successful_action_result_is_allowed() -> None:
    """Control case: a real success must still pass."""
    response = AgentResponse(
        type="execute_action",
        text="Votre demande a ete creee.",
        intent="authorization.create",
        confidence=0.9,
        toolCalls=[ToolCallRecord(name="authorization.create_request", arguments={}, status="success")],
        actionResult={
            "kind": "write_result",
            "success": True,
            "data": {"id": 42},
        },
    )

    result = ResponseGuard().validate(response, _context())

    assert result.allowed is True
