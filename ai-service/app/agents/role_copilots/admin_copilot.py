from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.intelligence.admin_digest_builder import AdminDigestBuilder
from app.models.agent_models import AgentResponse

from .base_role_copilot import BaseRoleCopilot


class AdminCopilot(BaseRoleCopilot):
    name = "AdminCopilot"
    allowed_roles = {"ADMIN"}

    def detect_intent(self, message: str, context: CurrentUserContext) -> tuple[str, float]:
        text = (message or "").lower()
        if any(term in text for term in ("what can i do", "quoi faire", "aide admin")):
            return "admin.what_can_i_do", 0.84
        if any(term in text for term in (
            "resume systeme", "résumé système", "system summary", "systeme",
            "dashboard admin", "admin summary", "admin briefing",
        )):
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
        digest = await AdminDigestBuilder(self.executor).build_digest(context)
        action = digest.to_dict()
        action["kind"] = "role_summary"
        action["agent"] = self.name
        text_lines = ["Resume systeme administrateur."]
        for section in action.get("sections", [])[:6]:
            if isinstance(section, dict):
                text_lines.append(f"- {section.get('title')}: {section.get('summary')}")
        diagnostics = action.get("reminders") if isinstance(action.get("reminders"), list) else []
        if diagnostics:
            text_lines.append("Diagnostics:")
            text_lines.extend(
                f"- {item.get('title')}: {item.get('summary')}"
                for item in diagnostics[:5]
                if isinstance(item, dict)
            )
        if action.get("warnings"):
            text_lines.append("Certaines donnees sont indisponibles; le resume reste partiel.")
        return AgentResponse(
            type="answer",
            text="\n".join(text_lines),
            intent=intent,
            confidence=confidence,
            toolCalls=digest.tool_calls,
            actionResult=action,
        )


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)
