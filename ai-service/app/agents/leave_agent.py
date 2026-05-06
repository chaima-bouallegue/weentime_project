from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


class LeaveAgent(ConfirmationMixin, DomainAgent):
    name = "leave"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        if intent == "leave.balance":
            return await self.read_response(
                tool_name="legacy.get_leave_balance",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici votre solde de conges.",
                confidence=confidence,
            )
        if intent in {"leave.list", "leave.status"}:
            return await self.read_response(
                tool_name="legacy.get_my_requests",
                tool_input={"payload": {"filter": "leave"}},
                context=context,
                intent=intent,
                success_text="Voici vos demandes de conge.",
                confidence=confidence,
            )
        if intent == "leave.create":
            payload = extract_payload(message, "CREATE_LEAVE", context)
            if not payload.get("start_date") or not payload.get("end_date"):
                return AgentResponse(
                    type="ask",
                    text="Pour quelle date souhaitez-vous demander ce conge ?",
                    intent=intent,
                    confidence=confidence,
                )
            if payload.get("date_precision") == "month_inferred":
                return AgentResponse(
                    type="ask",
                    text="Pouvez-vous confirmer le mois ou donner la date complete du conge ?",
                    intent=intent,
                    confidence=0.62,
                )
            return self.confirmation_response(
                context=context,
                tool_name="legacy.create_leave_request",
                tool_input={"payload": payload},
                intent=intent,
                text="Confirmez-vous la creation de cette demande de conge ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous faire avec vos conges ?", intent="leave.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if not has_any(text, ("congé", "conge", "leave", "vacance", "absence", "reste")):
            return None, 0.0
        if has_any(text, ("combien", "solde", "jours restants", "how many", "balance", "reste")):
            return "leave.balance", 0.91
        if has_any(text, ("statut", "status", "suivi", "historique", "mes demandes", "list", "liste")):
            return "leave.status", 0.82
        if has_any(text, ("je veux", "demande", "demander", "prendre", "create", "request", "want", "need", "tomorrow", "demain")):
            return "leave.create", 0.9
        return "leave.list", 0.65
