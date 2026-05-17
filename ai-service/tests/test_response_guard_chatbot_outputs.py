from __future__ import annotations

from app.context.anonymous_context import build_chatbot_context_from_metadata
from app.guards.response_guard import ResponseGuard
from app.models.agent_models import AgentResponse, ToolCallRecord


def _ctx(role: str = "EMPLOYEE"):
    return build_chatbot_context_from_metadata({"chatbotPublicContext": True, "role": role, "userId": 1, "entrepriseId": 1})


def test_guard_accepts_capability_unavailable_chatbot_card() -> None:
    response = AgentResponse(
        type="answer",
        text="Le module planning n'est pas encore connecte a l'agent IA.",
        intent="planning.unavailable",
        confidence=0.9,
        actionResult={"kind": "capability_unavailable", "capability": "planning"},
    )
    guarded = ResponseGuard().guard_response(response, _ctx())
    assert guarded.intent == "planning.unavailable"


def test_guard_accepts_tool_backed_pointage_status() -> None:
    response = AgentResponse(
        type="answer",
        text="Statut de pointage: PRESENT. Entree: 08:30.",
        intent="attendance.status",
        confidence=0.9,
        toolCalls=[ToolCallRecord(name="get_pointage_status", status="success")],
        actionResult={"success": True, "data": {"status": "PRESENT", "checkIn": "08:30"}},
    )
    guarded = ResponseGuard().guard_response(response, _ctx())
    assert guarded.intent == "attendance.status"


def test_guard_rejects_fake_leave_balance_without_tool_evidence() -> None:
    response = AgentResponse(type="answer", text="Il vous reste 42 jours de conge.", intent="leave.balance", confidence=0.9)
    guarded = ResponseGuard().guard_response(response, _ctx())
    assert guarded.intent == "fallback.guard_rejected"


def test_guard_accepts_role_digest() -> None:
    response = AgentResponse(
        type="answer",
        text="Resume du jour: aucune donnee disponible.",
        intent="employee_intelligence.digest",
        confidence=0.9,
        actionResult={"kind": "role_intelligence_digest", "sections": [], "warnings": []},
    )
    guarded = ResponseGuard().guard_response(response, _ctx())
    assert guarded.intent == "employee_intelligence.digest"
