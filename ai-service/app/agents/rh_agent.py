from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


class RHAgent(ConfirmationMixin, DomainAgent):
    name = "rh"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        if context.role.upper() != "RH":
            return AgentResponse(type="error", text="Votre role ne permet pas cette action RH.", intent="rh.forbidden", confidence=0.95)
        intent, confidence = self.detect_intent(message, context)
        if intent == "rh.stats":
            return await self.read_response(
                tool_name="legacy.get_rh_stats",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Les statistiques RH sont disponibles.",
                confidence=confidence,
            )
        if intent == "rh.all_requests":
            return await self.read_response(
                tool_name="legacy.get_all_requests",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici les demandes RH.",
                confidence=confidence,
            )
        if intent == "rh.process":
            payload = extract_payload(message, "PROCESS_REQUEST", context)
            if not payload.get("request_id") or not payload.get("decision"):
                return AgentResponse(type="ask", text="Merci de preciser la demande et la decision RH.", intent=intent, confidence=confidence)
            if not payload.get("type_demande"):
                payload["type_demande"] = "CONGE"
            return self.confirmation_response(
                context=context,
                tool_name="legacy.process_request",
                tool_input={"payload": payload},
                intent=intent,
                text="Confirmez-vous cette decision RH ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous faire cote RH ?", intent="rh.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if not has_any(text, ("rh", "stats", "statistiques", "kpi", "toutes les demandes", "process", "traiter")):
            return None, 0.0
        if has_any(text, ("stats", "statistiques", "kpi")):
            return "rh.stats", 0.9
        if has_any(text, ("toutes les demandes", "all requests", "demandes rh", "backlog")):
            return "rh.all_requests", 0.84
        if has_any(text, ("process", "traiter", "approuve", "approve", "refuse", "reject")):
            return "rh.process", 0.86
        return None, 0.0
