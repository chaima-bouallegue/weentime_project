from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from .base_domain_agent import DomainAgent


class HRPolicyAgent(DomainAgent):
    name = "hr_policy"

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        return 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        return AgentResponse(type="ask", text="HRPolicyAgent sera connecte a une base de connaissances RH plus tard.", intent="policy.pending", confidence=0.0)
