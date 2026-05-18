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


def test_guard_rejects_unsafe_llm_enhanced_value_not_in_tool_evidence() -> None:
    response = AgentResponse(
        type="answer",
        text="Il vous reste 99 jours de conge.",
        intent="attendance.status",
        confidence=0.9,
        actionResult={
            "success": True,
            "data": {
                "read_result": {
                    "kind": "read_result",
                    "toolName": "get_pointage_status",
                    "summary": "Pointage ouvert.",
                    "data": {"status": "PRESENT", "state": "OPEN"},
                }
            },
            "enhancementApplied": True,
            "providerUsed": "ollama",
            "fallbackUsed": False,
        },
    )

    guarded = ResponseGuard().guard_response(response, _ctx())

    assert guarded.intent == "fallback.guard_rejected"
    assert guarded.actionResult["guard_status"] == "hallucinated_hr_value"


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


def test_guard_accepts_no_data_contract() -> None:
    response = AgentResponse(
        type="answer",
        text="Aucune reunion prevue aujourd'hui.",
        intent="meeting.no_data",
        confidence=0.9,
        actionResult={"kind": "no_data", "capability": "meetings", "count": 0},
    )
    guarded = ResponseGuard().guard_response(response, _ctx())
    assert guarded.intent == "meeting.no_data"


def test_guard_accepts_system_status_contract() -> None:
    response = AgentResponse(
        type="answer",
        text="System health: provider configured, Redis disabled.",
        intent="admin.system_health",
        confidence=0.9,
        actionResult={
            "kind": "system_status",
            "components": [
                {"name": "provider", "status": "CONFIGURED"},
                {"name": "redis", "status": "DISABLED"},
            ],
        },
    )
    guarded = ResponseGuard().guard_response(response, _ctx("ADMIN"))
    assert guarded.intent == "admin.system_health"


def test_guard_accepts_approval_confirmation_contract() -> None:
    response = AgentResponse(
        type="confirm_action",
        text="Demande 42 trouvee. Confirmez-vous cette decision manager ?",
        intent="manager.process",
        confidence=0.95,
        requiresConfirmation=True,
        toolCalls=[ToolCallRecord(name="leave.manager_decide", status="pending_confirmation")],
        actionResult={"kind": "approval_confirmation", "request": {"id": 42, "statut": "EN_ATTENTE_MANAGER"}},
    )
    guarded = ResponseGuard().guard_response(response, _ctx("MANAGER"))
    assert guarded.intent == "manager.process"


def test_guard_accepts_policy_citation_result() -> None:
    response = AgentResponse(
        type="answer",
        text="La politique conge exige une demande avec justification. Source: POL-1.",
        intent="policy.answer",
        confidence=0.9,
        actionResult={
            "kind": "citation_result",
            "policyAvailable": True,
            "citations": [{"source_id": "POL-1", "title": "Politique conges", "chunk_id": "c1"}],
        },
    )
    guarded = ResponseGuard().guard_response(response, _ctx())
    assert guarded.intent == "policy.answer"


def test_guard_accepts_tool_safe_summary_contract() -> None:
    response = AgentResponse(
        type="answer",
        text="Synthese outil: aucune demande en attente.",
        intent="manager.safe_summary",
        confidence=0.9,
        actionResult={"kind": "tool_safe_summary", "tool": "leave.list_manager_requests", "count": 0},
    )
    guarded = ResponseGuard().guard_response(response, _ctx("MANAGER"))
    assert guarded.intent == "manager.safe_summary"


def test_guard_rejects_fake_attendance_without_tool_evidence() -> None:
    response = AgentResponse(
        type="answer",
        text="Statut de pointage: PRESENT. Entree: 08:30.",
        intent="attendance.status",
        confidence=0.9,
    )
    guarded = ResponseGuard().guard_response(response, _ctx())
    assert guarded.intent == "fallback.guard_rejected"


def test_guard_rejects_fake_system_status_without_tool_evidence() -> None:
    response = AgentResponse(
        type="answer",
        text="System health: every service is online and healthy.",
        intent="admin.system_health",
        confidence=0.9,
    )
    guarded = ResponseGuard().guard_response(response, _ctx("ADMIN"))
    assert guarded.intent == "fallback.guard_rejected"


def test_guard_rejects_fake_user_creation_success_without_tool_evidence() -> None:
    response = AgentResponse(
        type="answer",
        text="Utilisateur cree avec succes.",
        intent="admin.create_user",
        confidence=0.9,
    )
    guarded = ResponseGuard().guard_response(response, _ctx("ADMIN"))
    assert guarded.intent == "fallback.guard_rejected"


def test_guard_rejects_secret_and_raw_sql() -> None:
    secret_response = AgentResponse(
        type="answer",
        text="Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
        intent="admin.audit",
        confidence=0.9,
    )
    sql_response = AgentResponse(
        type="answer",
        text="Run SELECT * FROM users to inspect employees.",
        intent="admin.database",
        confidence=0.9,
    )

    guard = ResponseGuard()
    assert guard.guard_response(secret_response, _ctx("ADMIN")).intent == "fallback.guard_rejected"
    assert guard.guard_response(sql_response, _ctx("ADMIN")).intent == "fallback.guard_rejected"
