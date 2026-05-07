from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse, ToolCallRecord

from .base_role_copilot import BaseRoleCopilot


class AdminCopilot(BaseRoleCopilot):
    name = "AdminCopilot"
    allowed_roles = {"ADMIN"}

    def detect_intent(self, message: str, context: CurrentUserContext) -> tuple[str, float]:
        text = (message or "").lower()
        if any(term in text for term in ("what can i do", "quoi faire", "aide admin")):
            return "admin.what_can_i_do", 0.84
        if any(term in text for term in ("resume systeme", "system summary", "systeme", "dashboard admin")):
            return "admin.system_summary", 0.94
        if any(term in text for term in ("mal configure", "misconfigured", "roles", "utilisateurs")):
            return "admin.user_config_summary", 0.88
        if any(term in text for term in ("attention", "verifier", "health", "sante systeme")):
            return "admin.what_needs_attention", 0.86
        if _has_arabic(text):
            return "admin.system_summary", 0.78
        return "admin.unknown", 0.0

    def summarize_capabilities(self, context: CurrentUserContext) -> list[str]:
        return [
            "resume systeme",
            "utilisateurs et roles si outils admin disponibles",
            "entreprises si outils admin disponibles",
            "sante service si outil disponible",
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
            ("Utilisateurs", "admin.list_users"),
            ("Entreprises", "admin.list_enterprises"),
            ("Sante systeme", "admin.system_health"),
        ):
            section, call, section_warnings = await self._read_section(title=title, tool_name=tool_name, context=context)
            sections.append(section)
            calls.append(call)
            warnings.extend(section_warnings)
        return self._role_response(
            intent=intent,
            confidence=confidence,
            headline="Resume systeme administrateur.",
            sections=sections,
            warnings=warnings,
            tool_calls=calls,
        )


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)
