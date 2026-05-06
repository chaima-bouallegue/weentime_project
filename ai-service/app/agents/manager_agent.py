from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


class ManagerAgent(ConfirmationMixin, DomainAgent):
    name = "manager"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        if context.role.upper() == "RH":
            return 0.0
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        if context.role.upper() != "MANAGER":
            return AgentResponse(type="error", text="Votre role ne permet pas cette action.", intent="manager.forbidden", confidence=0.95)
        intent, confidence = self.detect_intent(message, context)
        if intent == "manager.pending":
            return await self.read_response(
                tool_name="legacy.get_pending_validations",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici les validations en attente.",
                confidence=confidence,
            )
        if intent == "manager.team_requests":
            return await self.read_response(
                tool_name="legacy.get_team_requests",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici les demandes de votre equipe.",
                confidence=confidence,
            )
        if intent in {"manager.approve", "manager.reject"}:
            action_intent = "APPROVE_REQUEST" if intent == "manager.approve" else "REJECT_REQUEST"
            payload = extract_payload(message, action_intent, context)
            if not payload.get("request_id"):
                return AgentResponse(type="ask", text="Quel identifiant de demande souhaitez-vous traiter ?", intent=intent, confidence=confidence)
            if not payload.get("type_demande"):
                payload["type_demande"] = "CONGE"
            tool = "legacy.approve_request" if intent == "manager.approve" else "legacy.reject_request"
            return self.confirmation_response(
                context=context,
                tool_name=tool,
                tool_input={"payload": payload},
                intent=intent,
                text="Confirmez-vous cette decision manager ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous faire cote manager ?", intent="manager.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if not has_any(text, ("approuve", "approve", "valide", "refuse", "reject", "rejette", "validation", "equipe", "team", "pending")):
            return None, 0.0
        if has_any(text, ("approuve", "approve", "valide")):
            return "manager.approve", 0.91
        if has_any(text, ("refuse", "reject", "rejette")):
            return "manager.reject", 0.91
        if has_any(text, ("validation", "pending", "en attente")):
            return "manager.pending", 0.85
        if has_any(text, ("equipe", "team")):
            return "manager.team_requests", 0.82
        return None, 0.0
