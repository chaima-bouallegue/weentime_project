from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.intelligence.employee_digest_builder import EmployeeDigestBuilder
from app.models.agent_models import AgentResponse

from .base_role_copilot import BaseRoleCopilot


class EmployeeCopilot(BaseRoleCopilot):
    name = "EmployeeCopilot"
    allowed_roles = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}

    def __init__(self, executor) -> None:
        super().__init__(executor)
        self.digest_builder = EmployeeDigestBuilder(executor)

    def detect_intent(self, message: str, context: CurrentUserContext) -> tuple[str, float]:
        text = (message or "").lower()
        personal = any(term in text for term in (
            # FR / TN
            "ma journee", "ma journée", "mon statut", "mes priorites", "mes priorités",
            # EN
            "my hr", "my status", "my day", "my daily", "my briefing",
        ))
        if any(term in text for term in ("que puis-je", "quoi faire", "what can i do", "aide moi", "help me")):
            return "employee.what_can_i_do", 0.86
        if any(term in text for term in ("mes demandes", "pending items", "en attente", "a traiter")) and not any(term in text for term in ("equipe", "team", "rh")):
            return "employee.my_pending_items", 0.84
        if any(term in text for term in ("statut rh", "my hr summary", "mon statut rh")):
            return "employee.my_status", 0.88
        # Daily briefing — broad EN/FR/TN coverage so "Show my daily summary"
        # (and equivalents) reach the digest builder instead of hitting the
        # legacy/LLM path that fallbacks to unsafe_response when no provider
        # is reachable.
        briefing_markers = (
            # FR
            "resume de ma journee", "resume ma journee", "resume du jour",
            "résumé du jour", "résumé de ma journée", "résumé de la journée",
            "mon resume", "mon résumé",
            # EN
            "daily briefing", "daily summary", "show my daily", "my daily",
            "what should i do today", "today's summary", "today summary",
            # TN
            "chnowa najem naamel", "shnowa najem naamel", "achnowa naamel",
            "chnowa resume lyoum", "chnowa résumé lyoum", "resume lyoum",
            "quoi r sum aujourd hui", "r sum aujourd hui",
        )
        if personal or any(term in text for term in briefing_markers):
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
        digest = await self.digest_builder.build_digest(context)
        sections = [section.to_dict() for section in digest.sections]
        text_lines = ["Resume de votre espace personnel."]
        for section in sections:
            text_lines.append(f"- {section['title']}: {section['summary']}")
        if digest.reminders:
            text_lines.append("Rappels:")
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
