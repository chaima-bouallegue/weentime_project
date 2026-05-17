from __future__ import annotations

from app.context.anonymous_context import build_chatbot_context_from_metadata
from app.guards.response_guard import ResponseGuard
from app.models.agent_models import AgentResponse, ToolCallRecord


def _ctx(role: str = "EMPLOYEE"):
    return build_chatbot_context_from_metadata({"chatbotPublicContext": True, "role": role, "userId": 1, "entrepriseId": 1})


def test_digest_contract_passes_for_employee_daily_summary() -> None:
    response = AgentResponse(
        type="answer",
        text="Resume du jour: aucune priorite urgente detectee.",
        intent="role_intelligence.employee_digest",
        confidence=0.9,
        actionResult={"kind": "digest", "role": "EMPLOYEE", "sections": [], "priorities": []},
    )

    guarded = ResponseGuard().guard_response(response, _ctx("EMPLOYEE"))

    assert guarded.intent == "role_intelligence.employee_digest"


def test_role_summary_contract_passes_for_manager_summary() -> None:
    response = AgentResponse(
        type="answer",
        text="Resume manager: aucune demande en attente.",
        intent="manager.summary",
        confidence=0.9,
        toolCalls=[ToolCallRecord(name="leave.list_manager_requests", status="success")],
        actionResult={"kind": "role_summary", "role": "MANAGER", "sections": []},
    )

    guarded = ResponseGuard().guard_response(response, _ctx("MANAGER"))

    assert guarded.intent == "manager.summary"


def test_role_intelligence_digest_still_passes_for_rh_backlog() -> None:
    response = AgentResponse(
        type="answer",
        text="Digest RH: backlog partiel, certaines donnees indisponibles.",
        intent="role_intelligence.rh_digest",
        confidence=0.9,
        actionResult={
            "kind": "role_intelligence_digest",
            "role": "RH",
            "sections": [{"title": "Backlog RH", "summary": "Aucune demande en attente"}],
            "warnings": [],
        },
    )

    guarded = ResponseGuard().guard_response(response, _ctx("RH"))

    assert guarded.intent == "role_intelligence.rh_digest"


def test_admin_role_summary_system_status_passes_with_tool_evidence() -> None:
    response = AgentResponse(
        type="answer",
        text="Resume systeme: provider configured, Redis disabled.",
        intent="admin.summary",
        confidence=0.9,
        actionResult={
            "kind": "role_summary",
            "sections": [
                {"title": "Provider", "status": "CONFIGURED"},
                {"title": "Redis", "status": "DISABLED"},
            ],
        },
    )

    guarded = ResponseGuard().guard_response(response, _ctx("ADMIN"))

    assert guarded.intent == "admin.summary"
