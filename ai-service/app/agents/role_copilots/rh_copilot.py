from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse, ToolCallRecord

from .base_role_copilot import BaseRoleCopilot


class RHCopilot(BaseRoleCopilot):
    name = "RHCopilot"
    allowed_roles = {"RH"}

    def detect_intent(self, message: str, context: CurrentUserContext) -> tuple[str, float]:
        text = (message or "").lower()
        if any(term in text for term in ("what can i do", "quoi faire", "aide rh")):
            return "rh.what_can_i_do", 0.84
        if any(term in text for term in ("resume rh", "rh daily", "daily rh", "briefing rh", "workload rh", "charge rh")):
            return "rh.daily_briefing", 0.94
        if any(term in text for term in ("statistiques rh", "stats rh", "hr stats", "hr analytics", "analytics rh")):
            return "rh.analytics_summary", 0.92
        if any(term in text for term in ("validations finales", "pending final", "demandes rh", "backlog rh")):
            return "rh.pending_final_validations", 0.88
        if any(term in text for term in ("documents rh", "document workload", "charge documents")):
            return "rh.document_workload", 0.84
        if _has_arabic(text):
            return "rh.daily_briefing", 0.78
        return "rh.unknown", 0.0

    def summarize_capabilities(self, context: CurrentUserContext) -> list[str]:
        return [
            "resume RH du jour",
            "statistiques RH",
            "validations finales",
            "charge de documents si outil disponible",
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
            ("Statistiques RH", "rh.get_stats"),
            ("Demandes RH", "legacy.get_all_requests"),
            ("Documents RH", "document.rh_workload"),
        ):
            section, call, section_warnings = await self._read_section(title=title, tool_name=tool_name, context=context)
            sections.append(section)
            calls.append(call)
            warnings.extend(section_warnings)
        return self._role_response(
            intent=intent,
            confidence=confidence,
            headline="Resume RH du jour.",
            sections=sections,
            warnings=warnings,
            tool_calls=calls,
        )


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)
