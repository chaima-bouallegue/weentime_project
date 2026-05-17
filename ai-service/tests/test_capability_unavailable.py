from __future__ import annotations

from app.context.anonymous_context import build_chatbot_context_from_metadata
from app.guards.response_guard import ResponseGuard
from app.models.agent_models import AgentResponse


def _ctx(role: str = "EMPLOYEE"):
    return build_chatbot_context_from_metadata({"chatbotPublicContext": True, "role": role, "userId": 1, "entrepriseId": 1})


def test_capability_unavailable_contract_passes_for_meeting_create() -> None:
    response = AgentResponse(
        type="answer",
        text="Le module de creation de reunion n'est pas encore connecte a l'agent IA.",
        intent="meeting.create.unavailable",
        confidence=0.92,
        actionResult={"kind": "capability_unavailable", "capability": "meeting.create"},
    )

    guarded = ResponseGuard().guard_response(response, _ctx("MANAGER"))

    assert guarded.intent == "meeting.create.unavailable"


def test_planning_unavailable_contract_passes_without_red_fallback() -> None:
    response = AgentResponse(
        type="answer",
        text="Le module planning n'est pas encore connecte a l'agent IA.",
        intent="planning.unavailable",
        confidence=0.9,
        actionResult={"kind": "planning_unavailable", "capability": "planning"},
    )

    guarded = ResponseGuard().guard_response(response, _ctx())

    assert guarded.intent == "planning.unavailable"


def test_no_data_contract_passes_for_empty_pending_approvals() -> None:
    response = AgentResponse(
        type="answer",
        text="Aucune demande manager en attente.",
        intent="manager.pending_approvals",
        confidence=0.9,
        actionResult={"kind": "no_data", "capability": "manager.pending_approvals", "count": 0},
    )

    guarded = ResponseGuard().guard_response(response, _ctx("MANAGER"))

    assert guarded.intent == "manager.pending_approvals"
