from __future__ import annotations

from abc import ABC, abstractmethod

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse


class DomainAgent(ABC):
    name = "domain"

    @abstractmethod
    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        raise NotImplementedError

    @abstractmethod
    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        raise NotImplementedError
