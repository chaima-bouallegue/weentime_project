"""Follow-up tests for the 3 issues surfaced by the 2026-05-16 live
per-prompt validation against the running ai-service.

  1. "Je viens d arriver" must reach AttendanceAgent.check_in (or at least
     not return fallback.unsafe_response). Today no agent claims it.
  2. "pending approvals" must route to slice-2's manager.pending_approvals,
     NOT ManagerCopilot's manager.pending_work (current behavior — the
     copilot's 0.88 confidence beats the agent's 0.85).
  3. ManagerAgent.approve-by-name in backend-down mode currently produces
     actionResult={kind:approval_lookup, status:"not_found"} which trips
     UnsupportedStatusRule ("not_found" not in SUPPORTED_STATUSES). The
     guard should pass the response; downstream renders the
     informational "no match" card.
"""
from __future__ import annotations

import asyncio

import pytest

from app.agents.attendance_agent import AttendanceAgent
from app.agents.manager_agent import ManagerAgent
from app.agents.role_copilots.manager_copilot import ManagerCopilot
from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.nlp.intent_patterns import CHECK_IN, match_intent
from app.tools.result import ToolResult


def _ctx(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=1, token="t")


# ---------- Issue 1: "Je viens d arriver" -----------------------------------


class _FakeExec:
    async def execute(self, *a, **k):
        return ToolResult.ok({})


@pytest.mark.parametrize(
    "phrase",
    [
        "Je viens d arriver",
        "je viens darriver",
        "viens d arriver",
        "I just arrived",
        "i just arrived",
        "I arrived",
    ],
)
def test_issue1_attendance_check_in_phrases(phrase: str) -> None:
    """AttendanceAgent must detect 'I just arrived' style phrases as
    check-in intent (not as 'attendance.unknown' fallback)."""
    agent = AttendanceAgent(_FakeExec(), ConfirmationStore())  # type: ignore[arg-type]
    intent, confidence = agent.detect_intent(phrase, _ctx())
    assert intent == "attendance.check_in", f"got {intent!r} for {phrase!r}"
    assert confidence >= 0.7


def test_issue1_check_in_intent_pattern_matches() -> None:
    """The router's match_intent must also catch the question-free arrival
    phrase as CHECK_IN so the cross-agent rewrite path works."""
    for phrase in ("je viens d arriver", "viens d arriver", "i just arrived"):
        match = match_intent(phrase)
        assert match is not None, f"no intent match for {phrase!r}"
        assert match.intent == CHECK_IN, f"{phrase!r} matched {match.intent}"


# ---------- Issue 2: "pending approvals" routing ----------------------------


def test_issue2_pending_approvals_does_not_match_copilot_pending_work() -> None:
    """ManagerCopilot must NOT claim 'pending approvals' / 'approvals
    pending' — those belong to slice-2's ManagerAgent.pending_approvals.

    The copilot's broader summary phrases ('demandes a valider',
    'validations en attente') remain its responsibility."""
    copilot = ManagerCopilot(_FakeExec())  # type: ignore[arg-type]
    intent, _ = copilot.detect_intent("pending approvals", _ctx("MANAGER"))
    assert intent != "manager.pending_work", "ManagerCopilot stole pending approvals from ManagerAgent"

    intent2, _ = copilot.detect_intent("approvals pending", _ctx("MANAGER"))
    assert intent2 != "manager.pending_work"


def test_issue2_manager_agent_still_claims_pending_approvals() -> None:
    """Slice-2 routing must still send 'pending approvals' to ManagerAgent."""
    agent = ManagerAgent(_FakeExec(), ConfirmationStore())  # type: ignore[arg-type]
    intent, _ = agent.detect_intent("pending approvals", _ctx("MANAGER"))
    assert intent == "manager.pending_approvals"


def test_issue2_team_summary_phrases_still_route_to_copilot() -> None:
    """Regression: keep ManagerCopilot for the broader team-summary phrases."""
    copilot = ManagerCopilot(_FakeExec())  # type: ignore[arg-type]
    intent, _ = copilot.detect_intent("today's team summary", _ctx("MANAGER"))
    assert intent == "manager.team_summary"


# ---------- Issue 3: approve-by-name when backend is down -------------------


class _FailExec:
    """Simulates Spring backend down — every list tool returns failure."""

    async def execute(self, *a, **k):
        return ToolResult.fail("backend_unavailable", "down", status_code=503)


def test_issue3_approve_by_name_backend_down_is_not_guard_rejected() -> None:
    """When the *_list_manager_requests tools all fail (backend down), the
    approve-by-name response must be a clean 'no match' ask that passes
    ResponseGuard, not a fallback.guard_rejected card."""
    agent = ManagerAgent(_FailExec(), ConfirmationStore())  # type: ignore[arg-type]
    msg = "je veut valide la demande de autorisation de amin dupont pour pause longue"

    response = asyncio.run(agent.handle(msg, _ctx("MANAGER")))

    # Pre-condition: the response is the not-found ask, not a fallback.
    assert response.type == "ask"
    assert response.intent == "manager.approve"
    assert isinstance(response.actionResult, dict)
    assert response.actionResult.get("kind") == "approval_lookup"
    assert response.actionResult.get("status") == "not_found"

    # Guard must NOT reject this response.
    result = ResponseGuard().validate(response, _ctx("MANAGER"))
    assert result.allowed is True, (
        f"guard rejected: {[(r.category, r.message) for r in result.rejections]}"
    )


def test_issue3_approval_lookup_ambiguous_status_passes_guard() -> None:
    """A 2-or-more matches result with status='ambiguous' must also pass."""
    response = AgentResponse(
        type="ask",
        text="Plusieurs demandes correspondent. Choisissez l'identifiant exact.",
        intent="manager.approve",
        confidence=0.91,
        actionResult={
            "kind": "approval_lookup",
            "status": "ambiguous",
            "choices": [
                {"type": "AUTORISATION", "request": {"id": 1}},
                {"type": "AUTORISATION", "request": {"id": 2}},
            ],
        },
    )

    result = ResponseGuard().validate(response, _ctx("MANAGER"))

    assert result.allowed is True, (
        f"guard rejected ambiguous: {[(r.category, r.message) for r in result.rejections]}"
    )
