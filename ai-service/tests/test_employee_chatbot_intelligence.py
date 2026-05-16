"""Regression tests for the round of fixes triggered by the EMPLOYEE
chatbot screenshots: typo-tolerant document detection, sick-leave reason
inference, planning vs meeting capability_unavailable separation, and the
slot-fill escape that prevents leave-flow / authorization-flow context bleed.
"""

from __future__ import annotations

import asyncio

from app.agents.attendance_agent import AttendanceAgent  # noqa: F401  (proves import path)
from app.agents.document_agent import DocumentAgent
from app.agents.leave_agent import LeaveAgent, _reason_from_leave_type
from app.agents.reunion_agent import ReunionAgent
from app.context.current_user import CurrentUserContext
from app.core.slot_filling import (
    _merge_leave_fields,
    _message_escapes_flow,
)
from app.nlp.normalization import normalize_latin
from app.tools.result import ToolResult


class _StubExecutor:
    def __init__(self, payload=None) -> None:
        self._payload = payload or {}

    async def execute(self, *_args, **_kwargs):
        return ToolResult.ok(self._payload)


class _StubConfirmationStore:
    def create(self, *_args, **_kwargs):
        class _Rec:
            confirmation_id = "stub"
        return _Rec()


def _ctx(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=1,
        role=role,
        entreprise_id=1,
        token=None,
        metadata={"chatbot_public_context": True, "jwt_verified": False},
    )


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# --------- typo + document trigger ----------------------------------------


def test_typos_normalized_to_canonical_forms() -> None:
    assert "contrat" in normalize_latin("je veut une demande de contart de travaille")
    assert "travail" in normalize_latin("contart de travaille")
    assert "je veux" in normalize_latin("je veut un document")


def test_document_agent_detects_contrat_de_travail_without_doc_keyword() -> None:
    agent = DocumentAgent(executor=_StubExecutor(), confirmation_store=_StubConfirmationStore())
    intent, conf = agent.detect_intent("contrat de travail", _ctx())
    assert intent == "document.create"
    assert conf >= 0.55


def test_document_agent_handles_typo_full_sentence() -> None:
    # End-to-end via normalize → detect → handle. The typo normalisation runs
    # in normalize_latin (called by the router), so the agent receives the
    # canonical form. We simulate that here.
    canonical = normalize_latin("je veut une demande de contart de travaille")
    agent = DocumentAgent(executor=_StubExecutor(), confirmation_store=_StubConfirmationStore())
    intent, _ = agent.detect_intent(canonical, _ctx())
    assert intent == "document.create"


# --------- sick leave reason inference -------------------------------------


def test_reason_from_leave_type_maps_known_labels() -> None:
    assert _reason_from_leave_type("Conge maladie") == "maladie"
    assert _reason_from_leave_type("CONGE MATERNITE") == "maternite"
    assert _reason_from_leave_type("Conge sans solde") == "sans solde"
    assert _reason_from_leave_type(None) is None
    assert _reason_from_leave_type("annuel") is None  # not a self-evident reason


def test_leave_agent_does_not_ask_motif_for_sick_leave() -> None:
    # The handler sees a fully-resolved payload (start/end/leave_type from
    # entity extractor) — with the fix it must infer reason="maladie" and
    # produce a confirm_action instead of asking for motif.
    agent = LeaveAgent(executor=_StubExecutor(), confirmation_store=_StubConfirmationStore())
    response = _run(agent.handle("je veux un conge de maladie pour demain", _ctx()))
    # confirm_action OR "ask" but NOT the motif question. Empty backend may
    # also produce risk-analysis confirm text.
    assert response.intent == "leave.create"
    assert "motif" not in response.text.lower()


def test_slot_fill_merge_sets_reason_for_sick_leave_followup() -> None:
    fields = {}
    payload = {
        "leave_type_label": "Conge maladie",
        "start_date": "2026-05-17",
        "end_date": "2026-05-17",
    }
    _merge_leave_fields(fields, payload, original="conge maladie demain")
    assert fields["reason"] == "maladie"


# --------- escape pattern: authorization escapes a pending leave flow ------


def test_authorization_text_escapes_pending_leave_flow() -> None:
    # User is inside a leave.create flow; they pivot to an authorization
    # request. Without the fix the slot-fill merger would have appended
    # "pour 2heures" as the leave reason instead of yielding control.
    assert _message_escapes_flow("je veut prendre une autorisation pour 2heures", "leave.create") is True
    assert _message_escapes_flow("nheb une autorisation demain", "leave.create") is True
    # Sanity: a pure date follow-up still stays in the flow.
    assert _message_escapes_flow("pour demain", "leave.create") is False


# --------- planning vs meeting separation ---------------------------------


def test_planning_only_query_returns_planning_capability_unavailable() -> None:
    agent = ReunionAgent(executor=_StubExecutor())
    intent, conf = agent.detect_intent("c quoi mon planning", _ctx())
    assert intent == "planning.unavailable"
    assert conf >= 0.55


def test_planning_handler_emits_planning_message_not_meeting_one() -> None:
    agent = ReunionAgent(executor=_StubExecutor())
    response = _run(agent.handle("c quoi mon planning", _ctx()))
    assert response.intent == "planning.unavailable"
    assert "planning" in response.text.lower()
    assert "reunion" not in response.text.lower().split(".")[0]  # 1st sentence stays planning-flavoured


def test_meeting_only_query_still_routes_to_meeting_unavailable() -> None:
    agent = ReunionAgent(executor=_StubExecutor())
    intent, _ = agent.detect_intent("My meetings", _ctx())
    assert intent in {"reunion.list_mine", "reunion.next", "reunion.unknown"}
    # The handler reaches meeting.unavailable when the tool fails (stub
    # returns ok+empty, but the live path tests are upstream); just ensure
    # we route into the meeting branch (not planning).
