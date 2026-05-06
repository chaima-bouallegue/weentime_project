from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Awaitable, Callable

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.observability.tracing import start_span

from .base_domain_agent import DomainAgent

LegacyHandler = Callable[[Any], Awaitable[Any]]


class LegacyAgent(DomainAgent):
    name = "legacy"

    def __init__(self, legacy_handler: LegacyHandler | None) -> None:
        self.legacy_handler = legacy_handler

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        return 0.01 if self.legacy_handler is not None else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> Any:
        if self.legacy_handler is None:
            return AgentResponse(
                type="ask",
                text="Aucun agent disponible pour cette demande.",
                intent="fallback.unknown",
                confidence=0.0,
            )
        request = SimpleNamespace(
            user_id=context.user_id,
            message=message,
            role=context.role,
            access_token=context.token,
            metadata={
                "channel": "legacy_fallback",
                "language": context.language,
                **dict(getattr(context, "metadata", {}) or {}),
            },
        )
        with start_span("agent.legacy", {"role": context.role, "language": context.language}):
            return await self.legacy_handler(request)
