from __future__ import annotations

from app.agents.base_domain_agent import DomainAgent
from app.context.current_user import CurrentUserContext
from app.intelligence.employee_digest_builder import EmployeeDigestBuilder
from app.models.agent_models import AgentResponse


class EmployeeAgent(DomainAgent):
    """Read-only employee intelligence agent for personal digest prompts."""

    name = "employee"

    def __init__(self, executor, digest_builder: EmployeeDigestBuilder | None = None) -> None:
        self.executor = executor
        self.digest_builder = digest_builder or EmployeeDigestBuilder(executor)

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        if role != "EMPLOYEE":
            return 0.0
        text = (message or "").lower()
        # Multilingual daily-summary markers. Without this the router falls
        # through to the legacy/LLM path and — when no provider is reachable —
        # answers with fallback.unsafe_response for "Show my daily summary".
        markers = (
            # FR
            "resume intelligent", "mes rappels", "mes priorites", "productivite",
            "quoi faire aujourd", "resume du jour", "resume de ma journee",
            "ma journee", "mon resume", "resume de la journee",
            "résumé du jour", "résumé de ma journée", "ma journée",
            # EN
            "daily summary", "my daily", "show my daily", "my day",
            "what should i do today", "today's summary", "my briefing",
            "daily briefing",
            # TN
            "chnowa najem naamel", "shnowa najem naamel", "achnowa naamel",
            "naamel tawa",
            # AR
            "ملخص يومي", "ماذا أفعل اليوم", "ملخص اليوم",
        )
        if any(marker in text for marker in markers):
            return 0.92
        return 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        if role != "EMPLOYEE" or not context.is_verified:
            return AgentResponse(
                type="error",
                text="Contexte employe non autorise pour ce digest.",
                intent="employee_intelligence.forbidden",
                confidence=0.95,
                requiresConfirmation=False,
                actionResult={
                    "kind": "role_intelligence_digest",
                    "role": role,
                    "sections": [],
                    "priorities": [],
                    "reminders": [],
                    "warnings": ["employee_context_not_allowed"],
                    "requiresConfirmation": False,
                },
            )

        digest = await self.digest_builder.build_digest(context)
        lines = [digest.summary]
        if digest.reminders:
            lines.append("Rappels:")
            lines.extend(f"- {item.get('title')}: {item.get('summary')}" for item in digest.reminders[:5])
        return AgentResponse(
            type="answer",
            text="\n".join(lines),
            intent="employee_intelligence.digest",
            confidence=0.9,
            requiresConfirmation=False,
            toolCalls=digest.tool_calls,
            actionResult=digest.to_dict(),
        )
