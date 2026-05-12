from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse, ToolCallRecord

from .base_role_copilot import BaseRoleCopilot


class ManagerCopilot(BaseRoleCopilot):
    name = "ManagerCopilot"
    allowed_roles = {"MANAGER"}

    def detect_intent(self, message: str, context: CurrentUserContext) -> tuple[str, float]:
        text = (message or "").lower()
        if any(term in text for term in ("what can i do", "quoi faire", "aide manager")):
            return "manager.what_can_i_do", 0.84
        if any(term in text for term in ("resume", "summary", "briefing", "dashboard", "priorites")) and any(term in text for term in ("equipe", "team", "manager")):
            return "manager.team_summary", 0.94
        if any(term in text for term in ("demandes a valider", "demandes à valider", "approvals pending", "pending approvals", "validations en attente")):
            return "manager.pending_work", 0.88
        if any(term in text for term in ("absent", "retard", "late", "risk", "risque")) and any(term in text for term in ("equipe", "team")):
            return "manager.risk_summary", 0.87
        if _has_arabic(text):
            return "manager.team_summary", 0.78
        return "manager.unknown", 0.0

    def summarize_capabilities(self, context: CurrentUserContext) -> list[str]:
        return [
            "resume equipe",
            "presence equipe",
            "validations manager en attente",
            "demandes de l'equipe",
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
            ("Presence equipe", "get_team_presence"),
            ("Validations en attente", "legacy.get_pending_validations"),
            ("Demandes equipe", "legacy.get_team_requests"),
        ):
            section, call, section_warnings = await self._read_section(title=title, tool_name=tool_name, context=context)
            sections.append(section)
            calls.append(call)
            warnings.extend(section_warnings)
        return self._role_response(
            intent=intent,
            confidence=confidence,
            headline="Resume manager de votre equipe.",
            sections=sections,
            warnings=warnings,
            tool_calls=calls,
        )


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)
