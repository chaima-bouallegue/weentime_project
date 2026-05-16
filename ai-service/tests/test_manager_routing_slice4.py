"""Slice 4 — manager agent fixes.

Pins down current behavior for three manager-side failure modes:

  A. "Did I check in?" must route to attendance.status (a STATUS check),
     not attendance.check_in (a confirmation dialog asking to CREATE a
     check-in). The substring "check in" inside the question currently
     hijacks the router to CHECK_IN.
  B. "nheb nchouf les horaire de l equipes" must route SOMEWHERE — today
     "horaire" is not in the planning vocabulary, so nothing claims it.
     For a manager, it should land at manager.team_schedule capability_
     unavailable; for an employee, planning.unavailable.
  D. "valide la demande de autorisation de amin dupont pour pause longue"
     should search pending team requests by employee name + type instead
     of asking "Quel identifiant de demande ?"

Approval-by-name resolution must not regress the existing ID-based path.
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.agents.manager_agent import ManagerAgent
from app.agents.reunion_agent import ReunionAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.nlp.intent_patterns import CHECK_IN, GET_STATUS, match_intent
from app.tools.result import ToolResult, build_read_result


def _ctx(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role=role, entreprise_id=9, token="token")


# ---------- A. Did I check in? -----------------------------------------------


@pytest.mark.parametrize(
    "phrase",
    [
        "Did I check in?",
        "did i check in",
        "did i check in today",
        "have i checked in",
        "am i checked in",
        "did i clock in",
    ],
)
def test_A_question_form_routes_to_get_status_not_check_in(phrase: str) -> None:
    match = match_intent(phrase.lower())
    assert match is not None, f"no intent match for {phrase!r}"
    assert match.intent == GET_STATUS, f"{phrase!r} matched {match.intent} instead of GET_STATUS"


def test_A_imperative_check_in_still_matches_check_in() -> None:
    """Regression: 'pointer mon entree' must still hit CHECK_IN."""
    match = match_intent("pointer mon entree")
    assert match is not None
    assert match.intent == CHECK_IN


# ---------- B. Team horaire --------------------------------------------------


class _FakeReunionExecutor:
    async def execute(self, tool_name: str, payload: dict[str, Any], context: CurrentUserContext, **kwargs: Any) -> ToolResult:
        return ToolResult.ok(
            {"read_result": {"kind": "read_result", "summary": "ok", "items": [], "count": 0}},
            status_code=200,
        )


def test_B_horaire_alone_is_planning_term() -> None:
    """The bare word 'horaire' / 'horaires' must register as planning so the
    reunion agent claims the prompt at all."""
    agent = ReunionAgent(_FakeReunionExecutor())  # type: ignore[arg-type]
    intent, confidence = agent.detect_intent("mes horaires aujourd hui", _ctx())
    assert intent in {"planning.unavailable", "reunion.list_mine"}
    assert confidence >= 0.5


def test_B_team_horaire_for_manager_returns_team_schedule() -> None:
    agent = ReunionAgent(_FakeReunionExecutor())  # type: ignore[arg-type]
    response = asyncio.run(agent.handle("nheb nchouf les horaire de l equipes", _ctx("MANAGER")))
    assert response.intent == "manager.team_schedule"
    assert response.type == "answer"
    assert response.actionResult is not None
    assert response.actionResult.get("kind") == "capability_unavailable"


def test_B_personal_horaire_for_employee_stays_planning_unavailable() -> None:
    """Regression guard: a personal 'mes horaires' from an employee must
    still route to planning.unavailable, NOT manager.team_schedule."""
    agent = ReunionAgent(_FakeReunionExecutor())  # type: ignore[arg-type]
    response = asyncio.run(agent.handle("c quoi mes horaires aujourd hui", _ctx("EMPLOYEE")))
    assert response.intent == "planning.unavailable"


# ---------- D. Approval-by-name ----------------------------------------------


class _ApprovalExecutor:
    """Fake executor for the manager approve-by-name flow.

    Returns a configurable set of pending requests across the 3 list tools
    (leave / telework / authorization) and a single-item detail on the
    matching get_status tool.
    """

    def __init__(self, items_by_type: dict[str, list[dict[str, Any]]]) -> None:
        self.items_by_type = items_by_type
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, tool_name: str, payload: dict[str, Any], context: CurrentUserContext, **kwargs: Any) -> ToolResult:
        self.calls.append((tool_name, payload or {}))
        if tool_name == "leave.list_manager_requests":
            return self._list_result(tool_name, self.items_by_type.get("CONGE", []))
        if tool_name == "telework.list_manager_requests":
            return self._list_result(tool_name, self.items_by_type.get("TELETRAVAIL", []))
        if tool_name == "authorization.list_manager_requests":
            return self._list_result(tool_name, self.items_by_type.get("AUTORISATION", []))
        if tool_name in {"leave.get_request_status", "telework.get_status", "authorization.get_status"}:
            rid = int((payload or {}).get("request_id", 0))
            all_items = [
                item
                for items in self.items_by_type.values()
                for item in items
            ]
            match = next((i for i in all_items if int(i.get("id", 0)) == rid), None)
            if match is None:
                return ToolResult.fail("not_found", "Not found", status_code=404)
            return ToolResult.ok(
                {"read_result": build_read_result(tool_name=tool_name, summary="detail", items=[match], count=1)},
                status_code=200,
            )
        return ToolResult.fail("unknown_tool", "", status_code=404)

    def _list_result(self, tool_name: str, items: list[dict[str, Any]]) -> ToolResult:
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=f"{len(items)} pending",
                    items=items,
                    count=len(items),
                )
            },
            status_code=200,
        )


def test_D_approval_by_name_with_one_match_proceeds_to_confirmation() -> None:
    items = {
        "AUTORISATION": [
            {"id": 77, "employee": "Amin Dupont", "type": "ABSENCE_TEMPORAIRE", "motif": "pause longue", "statut": "EN_ATTENTE"}
        ]
    }
    executor = _ApprovalExecutor(items)
    agent = ManagerAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle(
        "je veut valide la demande de autorisation de amin dupont pour pause longue",
        _ctx("MANAGER"),
    ))

    assert response.type == "confirm_action", f"expected confirm_action, got {response.type} text={response.text!r}"
    assert response.intent == "manager.approve"
    assert response.actionResult is not None
    assert response.actionResult.get("kind") == "approval_confirmation"
    assert "Amin Dupont" in response.text


def test_D_approval_by_name_with_no_match_says_not_found() -> None:
    executor = _ApprovalExecutor({"AUTORISATION": []})
    agent = ManagerAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle(
        "valide la demande de autorisation de inconnu",
        _ctx("MANAGER"),
    ))

    assert response.type == "ask"
    assert response.intent == "manager.approve"
    text = (response.text or "").lower()
    assert any(token in text for token in ("aucune", "no match", "trouve aucune", "trouvée aucune", "trouve pas"))


def test_D_approval_by_name_with_multiple_matches_is_ambiguous() -> None:
    items = {
        "AUTORISATION": [
            {"id": 77, "employee": "Amin Dupont", "type": "ABSENCE_TEMPORAIRE", "motif": "pause longue", "statut": "EN_ATTENTE"},
            {"id": 78, "employee": "Amin Dupont", "type": "SORTIE_ANTICIPEE", "motif": "rdv medical", "statut": "EN_ATTENTE"},
        ]
    }
    executor = _ApprovalExecutor(items)
    agent = ManagerAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle(
        "valide la demande de autorisation de amin dupont",
        _ctx("MANAGER"),
    ))

    assert response.type == "ask"
    assert response.actionResult is not None
    assert response.actionResult.get("kind") == "approval_lookup"
    assert response.actionResult.get("status") == "ambiguous"


def test_D_approval_with_explicit_id_still_works() -> None:
    """Regression guard for slice 2's approval test path."""
    items = {
        "CONGE": [
            {"id": 42, "employee": "Amin Dupont", "type": "CONGE", "dateDebut": "2026-05-20", "statut": "EN_ATTENTE", "motif": "repos"}
        ]
    }
    executor = _ApprovalExecutor(items)
    agent = ManagerAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve le conge 42", _ctx("MANAGER")))

    assert response.type == "confirm_action"
    assert response.intent == "manager.approve"
