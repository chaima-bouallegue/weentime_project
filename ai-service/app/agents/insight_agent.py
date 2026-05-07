from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import get_read_result

from .base_domain_agent import DomainAgent


class InsightAgent(DomainAgent):
    name = "insight"

    def __init__(self, executor: ToolExecutor) -> None:
        self.executor = executor

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        tool_name = self._tool_for_role(context)
        if tool_name is None:
            return AgentResponse(
                type="error",
                text="Cette analyse intelligente n'est pas disponible pour votre role.",
                intent=intent or "insights.forbidden",
                confidence=confidence,
            )
        result = await self.executor.execute(tool_name, {"period": "today"}, context)
        read_result = get_read_result(result.data)
        summary = str(read_result.get("summary") if read_result else (result.error_message or "Analyse indisponible."))
        data = read_result.get("data") if isinstance(read_result, dict) else {}
        return AgentResponse(
            type="answer" if result.success else "error",
            text=summary,
            intent=intent or self._intent_for_role(context),
            confidence=confidence,
            toolCalls=[ToolCallRecord(name=tool_name, arguments={"period": "today"}, status="success" if result.success else "failed")],
            actionResult=data if isinstance(data, dict) else {"kind": "insight_report", "insights": [], "warnings": [summary]},
        )

    def detect_intent(self, message: str, context: CurrentUserContext) -> tuple[str | None, float]:
        text = (message or "").lower()
        if _has_arabic(text) and any(term in text for term in ("ملخص", "تحليل", "مشاكل", "فريقي")):
            return self._intent_for_role(context), 0.9
        broad = any(
            term in text
            for term in (
                "intelligent",
                "anomalie",
                "anomalies",
                "oubli",
                "oublie",
                "quelque chose",
                "analyse",
                "risk",
                "risque",
                "spike",
                "late",
                "retard",
                "absence",
                "probleme",
                "problème",
            )
        )
        summary = any(term in text for term in ("resume", "summary", "briefing", "rapport"))
        if broad:
            return self._intent_for_role(context), 0.94
        if summary and any(term in text for term in ("intelligent", "anomal", "risque")):
            return self._intent_for_role(context), 0.92
        return None, 0.0

    @staticmethod
    def _tool_for_role(context: CurrentUserContext) -> str | None:
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        if role == "EMPLOYEE":
            return "insights.employee_daily"
        if role == "MANAGER":
            return "insights.manager_team"
        if role == "RH":
            return "insights.rh_daily"
        if role == "ADMIN":
            return "insights.admin_system"
        return None

    @staticmethod
    def _intent_for_role(context: CurrentUserContext) -> str:
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        return {
            "EMPLOYEE": "insights.employee_daily",
            "MANAGER": "insights.manager_team",
            "RH": "insights.rh_daily",
            "ADMIN": "insights.admin_system",
        }.get(role, "insights.anomalies")


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)
