from __future__ import annotations

import asyncio
from typing import Any

from app.agents.insight_agent import InsightAgent
from app.agents.legacy_agent import LegacyAgent
from app.agents.leave_agent import LeaveAgent
from app.agents.router_agent import RouterAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult, build_read_result


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append((tool_name, payload or {}))
        if tool_name.startswith("insights."):
            return ToolResult.ok(
                {
                    "read_result": build_read_result(
                        tool_name=tool_name,
                        summary="Rapport intelligent: 1 alerte.",
                        items=[{"type": "missing_checkout", "confidence": 0.8, "evidence": {"hasCheckIn": True}}],
                        count=1,
                        data={
                            "kind": "insight_report",
                            "summary": "Rapport intelligent: 1 alerte.",
                            "insights": [{"type": "missing_checkout", "confidence": 0.8, "evidence": {"hasCheckIn": True}}],
                            "warnings": [],
                        },
                    )
                }
            )
        return ToolResult.ok({"read_result": build_read_result(tool_name=tool_name, summary="ok")})


class EmptyAttendance:
    name = "attendance"

    def can_handle(self, message, context):
        if "pointer" in (message or "").lower():
            return 0.96
        return 0.0

    async def handle(self, message, context):
        return AgentResponse(type="confirm_action", text="Confirmer pointage", intent="attendance.check_in", confidence=0.96, requiresConfirmation=True)


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=42, token="token")


def test_employee_intelligent_summary_routes_to_insight_agent() -> None:
    executor = FakeExecutor()
    router = RouterAgent(EmptyAttendance(), extra_agents=[InsightAgent(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Resume intelligent de ma journee", context()))

    assert response.intent == "insights.employee_daily"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "insight_report"
    assert executor.calls[0][0] == "insights.employee_daily"


def test_manager_anomaly_request_routes_to_manager_insights() -> None:
    executor = FakeExecutor()
    router = RouterAgent(EmptyAttendance(), extra_agents=[InsightAgent(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Quelles anomalies dans mon equipe ?", context("MANAGER")))

    assert response.intent == "insights.manager_team"
    assert executor.calls[0][0] == "insights.manager_team"


def test_rh_daily_analysis_routes_to_rh_insights() -> None:
    executor = FakeExecutor()
    router = RouterAgent(EmptyAttendance(), extra_agents=[InsightAgent(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Analyse RH du jour", context("RH")))

    assert response.intent == "insights.rh_daily"
    assert executor.calls[0][0] == "insights.rh_daily"


def test_admin_intelligent_system_summary_routes_to_admin_insights() -> None:
    executor = FakeExecutor()
    router = RouterAgent(EmptyAttendance(), extra_agents=[InsightAgent(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Resume systeme intelligent", context("ADMIN")))

    assert response.intent == "insights.admin_system"
    assert executor.calls[0][0] == "insights.admin_system"


def test_explicit_leave_create_still_routes_to_leave_agent_not_insights() -> None:
    executor = FakeExecutor()
    router = RouterAgent(
        EmptyAttendance(),
        extra_agents=[LeaveAgent(executor, ConfirmationStore()), InsightAgent(executor)],  # type: ignore[arg-type]
        legacy_agent=None,
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("je veux un conge demain", context()))

    assert response.intent.startswith("leave.")
    assert not executor.calls or executor.calls[0][0] != "insights.employee_daily"


def test_explicit_check_in_still_routes_to_attendance_agent() -> None:
    executor = FakeExecutor()
    router = RouterAgent(EmptyAttendance(), extra_agents=[InsightAgent(executor)], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("pointer mon entree", context()))

    assert response.intent == "attendance.check_in"
    assert response.requiresConfirmation is True


def test_employee_does_not_access_manager_insight_tool() -> None:
    executor = FakeExecutor()
    agent = InsightAgent(executor)

    response = asyncio.run(agent.handle("Quelles anomalies dans mon equipe ?", context("EMPLOYEE")))

    assert response.intent == "insights.employee_daily"
    assert executor.calls[0][0] == "insights.employee_daily"


def test_insight_response_never_creates_write_confirmation() -> None:
    executor = FakeExecutor()
    agent = InsightAgent(executor)

    response = asyncio.run(agent.handle("Est-ce que j'ai oublie quelque chose ?", context()))

    assert response.type == "answer"
    assert response.requiresConfirmation is False
    assert response.confirmationId is None


def test_legacy_fallback_still_handles_unrelated_prompt() -> None:
    async def legacy_handler(request):
        return AgentResponse(type="answer", text="legacy", intent="legacy.intent", confidence=0.5)

    router = RouterAgent(EmptyAttendance(), extra_agents=[InsightAgent(FakeExecutor())], legacy_agent=LegacyAgent(legacy_handler))  # type: ignore[arg-type]

    response = asyncio.run(router.handle("message hors domaine", context()))

    assert response.intent == "legacy.intent"
