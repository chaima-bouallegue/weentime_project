from __future__ import annotations
from app.context.current_user import CurrentUserContext
from app.intelligence.manager_digest_builder import ManagerDigestBuilder
from app.models.agent_models import AgentResponse

from .base_role_copilot import BaseRoleCopilot


class ManagerCopilot(BaseRoleCopilot):
    name = "ManagerCopilot"
    allowed_roles = {"MANAGER"}

    def __init__(self, executor) -> None:
        super().__init__(executor)
        self.digest_builder = ManagerDigestBuilder(executor)

    def detect_intent(self, message: str, context: CurrentUserContext) -> tuple[str, float]:
        text = (message or "").lower()
        if any(term in text for term in ("what can i do", "quoi faire", "aide manager")):
            return "manager.what_can_i_do", 0.84
        # Team summary — accept "today's team summary" + EN/FR/TN variants
        # without requiring the words "equipe"/"team" to co-occur with the
        # summary noun (the role itself is MANAGER so the team scope is implied).
        team_summary_phrases = (
            "today's team summary", "todays team summary", "team summary",
            "resume equipe", "résumé équipe", "résumé de l'équipe",
            "manager briefing", "my team briefing", "my team summary",
        )
        if any(phrase in text for phrase in team_summary_phrases):
            return "manager.team_summary", 0.94
        if any(term in text for term in ("resume", "summary", "briefing", "dashboard", "priorites")) and any(term in text for term in ("equipe", "team", "manager")):
            return "manager.team_summary", 0.94
        # "pending approvals" / "approvals pending" are slice-2
        # ManagerAgent.pending_approvals territory — don't steal them with the
        # broader copilot summary path. The French long-form phrases below
        # remain copilot's responsibility (workload digest, not a focused
        # list of pending validations).
        if any(term in text for term in ("demandes a valider", "demandes à valider", "validations en attente")):
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
        digest = await self.digest_builder.build_digest(context)
        sections = [section.to_dict() for section in digest.sections]
        text_lines = ["Resume manager de votre equipe."]
        for section in sections:
            text_lines.append(f"- {section['title']}: {section['summary']}")
        if digest.reminders:
            text_lines.append("Points d'attention:")
            text_lines.extend(f"- {item.get('title')}: {item.get('summary')}" for item in digest.reminders[:5])
        if digest.warnings:
            text_lines.append("Certaines donnees sont indisponibles; le resume reste partiel.")
        return AgentResponse(
            type="answer",
            text="\n".join(text_lines),
            intent=intent,
            confidence=confidence,
            requiresConfirmation=False,
            toolCalls=digest.tool_calls,
            actionResult={
                "kind": "role_summary",
                "agent": self.name,
                "sections": sections,
                "priorities": [item.to_dict() for item in digest.priorities],
                "reminders": digest.reminders,
                "warnings": digest.warnings,
                "requiresConfirmation": False,
            },
        )


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)
