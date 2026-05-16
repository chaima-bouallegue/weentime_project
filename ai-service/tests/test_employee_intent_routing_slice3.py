"""Slice 3 — employee intent routing.

Pins down current behavior for four user-visible failure modes from the
2026-05-16 screenshots, so we only fix what is actually broken:

  A. "nheb naamela autorisation de 2h" must reach authorization.create slot
     filling (asks for date or start time), not fallback.*
  B. "aandi reunion?" must reach the reunion agent (list_mine on success, or
     meeting.unavailable when backend is down), not fallback.guard_rejected
  C. "c quoi mon planning" must reach planning.unavailable, not fallback.*
  D. "je suis malade aujourd'hui" must reach leave.create with maladie
     inferred, not fall through to no-agent fallback

Tests construct agents directly (no full router) to isolate each gap.
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.agents.authorization_agent import AuthorizationAgent
from app.agents.leave_agent import LeaveAgent
from app.agents.reunion_agent import ReunionAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.result import ToolResult


class _FakeExecutor:
    """Generic fake executor for read tools."""

    def __init__(self, *, fail: bool = False) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.fail = fail

    async def execute(self, tool_name: str, payload: dict[str, Any], context: CurrentUserContext, **kwargs: Any) -> ToolResult:
        self.calls.append((tool_name, payload or {}))
        if self.fail:
            return ToolResult.fail("backend_unavailable", "Backend down", status_code=503)
        return ToolResult.ok(
            {"read_result": {"kind": "read_result", "summary": f"ok:{tool_name}", "items": [], "count": 0}},
            status_code=200,
        )


class _FakeReunionExecutor:
    """Reunion executor returns either a successful empty list or a 404."""

    def __init__(self, *, fail: bool = False) -> None:
        self.calls: list[str] = []
        self.fail = fail

    async def execute(self, tool_name: str, payload: dict[str, Any], context: CurrentUserContext, **kwargs: Any) -> ToolResult:
        self.calls.append(tool_name)
        if self.fail:
            return ToolResult.fail("not_found", "Not found", status_code=404)
        return ToolResult.ok(
            {"read_result": {"kind": "read_result", "summary": "Aucune reunion", "items": [], "count": 0}},
            status_code=200,
        )


def _ctx(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role=role, entreprise_id=9, token="token")


# ---------- A. authorization 2h ---------------------------------------------


def test_A_authorization_2h_reaches_authorization_create() -> None:
    agent = AuthorizationAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    intent, confidence = agent.detect_intent("nheb naamela autorisation de 2h", _ctx())

    assert intent == "authorization.create"
    assert confidence >= 0.7


def test_A_authorization_2h_asks_slot_filling_not_fallback() -> None:
    agent = AuthorizationAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("nheb naamela autorisation de 2h", _ctx()))

    # Must be a slot-filling ask (date, time, or type), NEVER a generic fallback.
    assert response.type == "ask"
    assert response.intent == "authorization.create"
    assert not response.intent.startswith("fallback.")
    # Text should be asking for SOMETHING — date, time, type, or reason.
    lowered = (response.text or "").lower()
    assert any(token in lowered for token in ("date", "heure", "heures", "type", "motif"))


def test_A_authorization_french_2h_does_the_same() -> None:
    agent = AuthorizationAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux prendre une autorisation pour 2 heures", _ctx()))

    assert response.type == "ask"
    assert response.intent == "authorization.create"


# ---------- B. aandi reunion -------------------------------------------------


def test_B_aandi_reunion_detects_meeting_list() -> None:
    agent = ReunionAgent(_FakeReunionExecutor())  # type: ignore[arg-type]

    intent, confidence = agent.detect_intent("aandi reunion?", _ctx())

    # Expect the routing layer to identify a meeting query; the precise intent
    # (list_mine vs next) depends on cue detection but MUST be a meeting one,
    # never reunion.unknown.
    assert intent in {"reunion.list_mine", "reunion.next"}
    assert confidence >= 0.5


def test_B_aandi_reunion_backend_ok_returns_meeting_list() -> None:
    executor = _FakeReunionExecutor()
    agent = ReunionAgent(executor)  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("aandi reunion?", _ctx()))

    assert response.intent in {"reunion.list_mine", "reunion.next"}
    assert response.type == "answer"
    assert not response.intent.startswith("fallback.")


def test_B_aandi_reunion_backend_404_falls_back_to_capability_unavailable() -> None:
    executor = _FakeReunionExecutor(fail=True)
    agent = ReunionAgent(executor)  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("aandi reunion?", _ctx()))

    # Either the agent surfaces a safe meeting.unavailable card OR returns the
    # zero-result success answer — both are allowlisted. Must NOT be a guard
    # rejection or generic fallback.
    assert response.intent in {"meeting.unavailable", "reunion.list_mine", "reunion.next"}
    assert not response.intent.startswith("fallback.")


# ---------- C. planning ------------------------------------------------------


def test_C_planning_only_routes_to_planning_unavailable() -> None:
    agent = ReunionAgent(_FakeReunionExecutor())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("c quoi mon planning", _ctx()))

    assert response.intent == "planning.unavailable"
    assert response.type == "answer"


# ---------- D. sick leave ----------------------------------------------------


def test_D_sick_message_reaches_leave_agent() -> None:
    agent = LeaveAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    confidence = agent.can_handle("je suis malade aujourd'hui", _ctx())

    assert confidence >= 0.5, "LeaveAgent should claim 'je suis malade' messages"


def test_D_sick_message_routes_to_leave_create() -> None:
    agent = LeaveAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    intent, confidence = agent.detect_intent("je suis malade aujourd'hui", _ctx())

    assert intent == "leave.create"
    assert confidence >= 0.5


def test_D_nheb_conge_maladie_ghodwa_infers_sick_leave_type() -> None:
    """When the user says "maladie" or "malade" upfront, the slot-filling
    must not ask "quel type de conge ?" — the type and reason are already
    inferable."""
    agent = LeaveAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("nheb conge maladie ghodwa", _ctx()))

    # The response must either be a confirmation (slot-filling complete) or
    # an ask for date — but never an ask for type, because "maladie" was
    # explicit in the original message.
    text = (response.text or "").lower()
    assert "type" not in text, f"agent should not re-ask type, got: {response.text}"


def test_D_je_suis_malade_does_not_ask_for_type() -> None:
    agent = LeaveAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je suis malade aujourd'hui", _ctx()))

    text = (response.text or "").lower()
    # If we reach an ask, it must NOT be the "quel type de conge" prompt.
    assert "type de conge" not in text, f"sick leave must infer type, got: {response.text}"
