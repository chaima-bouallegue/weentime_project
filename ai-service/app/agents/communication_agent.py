from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from .base_domain_agent import DomainAgent


class CommunicationAgent(DomainAgent):
    name = "communication"

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        return 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        return AgentResponse(type="ask", text="CommunicationAgent n'est pas encore active.", intent="communication.pending", confidence=0.0)
