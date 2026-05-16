"""Verify newly allowlisted intents pass ResponseGuard without substitution.

Each entry in SAFE_NO_EVIDENCE_INTENTS marks an intent whose agent produces
deterministic / template text (slot-filling ask, manager safe read, planning
or meetings list). Allowlisted responses must round-trip unchanged through
guard_response, even with empty toolCalls + no actionResult.
"""
from __future__ import annotations

import pytest

from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.guards.rules import SAFE_NO_EVIDENCE_INTENTS
from app.models.agent_models import AgentResponse


def _context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role=role,
        entreprise_id=9,
        token="token",
        metadata={"jwt_verified": True},
    )


# Intents added by the 2026-05-16 guard fix slice. Each must be in the
# allowlist after the change.
NEWLY_ALLOWLISTED = (
    "authorization.create.ask",
    "leave.create.ask",
    "telework.create.ask",
    "document.create.ask",
    "manager.pending_approvals",
    "manager.team_requests",
    "manager.team_schedule",
    "manager.team_presence",
    "manager.team_attendance",
    "planning.list",
    "meetings.list",
)


@pytest.mark.parametrize("intent", NEWLY_ALLOWLISTED)
def test_newly_allowlisted_intent_is_in_safe_set(intent: str) -> None:
    assert intent in SAFE_NO_EVIDENCE_INTENTS


@pytest.mark.parametrize("intent", NEWLY_ALLOWLISTED)
def test_allowlisted_intent_passes_guard_with_template_text(intent: str) -> None:
    response = AgentResponse(
        type="ask",
        text="Pouvez-vous me preciser la date et l'heure ?",
        intent=intent,
        confidence=0.8,
    )

    out = ResponseGuard().guard_response(response, _context("MANAGER"))

    # No substitution: same intent, same text. The fallback substitution would
    # rewrite both to fallback.guard_rejected.
    assert out.intent == intent
    assert out.text == response.text
    assert out.type == "ask"


def test_manager_pending_approvals_with_summary_passes_guard() -> None:
    """Real manager-pending response (with manager_pending_summary actionResult)
    must not be blocked by HallucinatedHrValueRule even though its text
    mentions "demande" + "en attente"."""
    response = AgentResponse(
        type="answer",
        text=(
            "Voici les demandes manager accessibles :\n"
            "- Conges: 2 demandes en attente\n"
            "- Teletravail: aucune synthese\n"
            "- Autorisations: 1 demande en attente"
        ),
        intent="manager.pending_approvals",
        confidence=0.85,
        actionResult={
            "kind": "manager_pending_summary",
            "sections": [
                {"type": "CONGE", "title": "Conges", "summary": "2 demandes en attente", "count": 2, "items": []},
                {"type": "TELETRAVAIL", "title": "Teletravail", "summary": None, "count": 0, "items": []},
                {"type": "AUTORISATION", "title": "Autorisations", "summary": "1 demande en attente", "count": 1, "items": []},
            ],
            "warnings": [],
        },
    )

    out = ResponseGuard().guard_response(response, _context("MANAGER"))

    assert out.intent == "manager.pending_approvals"
    assert "Conges" in out.text
