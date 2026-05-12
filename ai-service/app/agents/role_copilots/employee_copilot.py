from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse, ToolCallRecord

from .base_role_copilot import BaseRoleCopilot


class EmployeeCopilot(BaseRoleCopilot):
    name = "EmployeeCopilot"
    allowed_roles = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}

    def detect_intent(self, message: str, context: CurrentUserContext) -> tuple[str, float]:
        text = (message or "").lower()
        personal = any(term in text for term in ("ma journee", "mon statut", "mes priorites", "my hr", "my status", "my day"))
        if any(term in text for term in ("que puis-je", "quoi faire", "what can i do", "aide moi", "help me")):
            return "employee.what_can_i_do", 0.86
        if any(term in text for term in ("mes demandes", "pending items", "en attente", "a traiter")) and not any(term in text for term in ("equipe", "team", "rh")):
            return "employee.my_pending_items", 0.84
        if any(term in text for term in ("statut rh", "my hr summary", "mon statut rh")):
            return "employee.my_status", 0.88
        if personal or any(term in text for term in ("resume de ma journee", "resume ma journee", "daily briefing", "what should i do today")):
            return "employee.daily_briefing", 0.92
        if _has_arabic(text):
            return "employee.daily_briefing", 0.78
        return "employee.unknown", 0.0

    def summarize_capabilities(self, context: CurrentUserContext) -> list[str]:
        return [
            "resume personnel du jour",
            "statut de pointage",
            "heures de la semaine",
            "solde de conges",
            "demandes personnelles",
        ]

    async def build_daily_briefing(
        self,
        context: CurrentUserContext,
        *,
        intent: str,
        confidence: float,
    ) -> AgentResponse:
        sections: list[dict] = []
        calls: list[ToolCallRecord] = []
        warnings: list[str] = []
        for title, tool_name in (
            ("Pointage", "get_pointage_status"),
            ("Heures semaine", "get_week_hours"),
            ("Solde conges", "leave.get_balance"),
            ("Conges", "leave.list_my_requests"),
            ("Documents", "document.list_my_requests"),
            ("Teletravail", "telework.list_my_requests"),
            ("Autorisations", "authorization.list_my_requests"),
        ):
            section, call, section_warnings = await self._read_section(title=title, tool_name=tool_name, context=context)
            sections.append(section)
            calls.append(call)
            warnings.extend(section_warnings)
        return self._role_response(
            intent=intent,
            confidence=confidence,
            headline="Resume de votre espace personnel.",
            sections=sections,
            warnings=warnings,
            tool_calls=calls,
        )


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)
