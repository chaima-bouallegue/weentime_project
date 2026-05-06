from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


class AuthorizationAgent(ConfirmationMixin, DomainAgent):
    name = "authorization"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        if intent == "authorization.list":
            return await self.read_response(
                tool_name="legacy.get_my_requests",
                tool_input={"payload": {"filter": "authorization"}},
                context=context,
                intent=intent,
                success_text="Voici vos demandes d'autorisation.",
                confidence=confidence,
            )
        if intent == "authorization.create":
            payload = extract_payload(message, "CREATE_AUTORISATION", context)
            missing = []
            if not payload.get("request_date"):
                missing.append("date")
            if not payload.get("time_start") or not payload.get("time_end"):
                missing.append("plage horaire")
            if missing:
                return AgentResponse(
                    type="ask",
                    text="Merci de preciser la date et les heures de debut et de fin.",
                    intent=intent,
                    confidence=confidence,
                )
            return self.confirmation_response(
                context=context,
                tool_name="legacy.create_authorization",
                tool_input={"payload": payload},
                intent=intent,
                text="Confirmez-vous cette demande d'autorisation ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous faire avec vos autorisations ?", intent="authorization.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if not has_any(text, ("autorisation", "permission", "sortie", "rdv", "rendez vous", "retard")):
            return None, 0.0
        if has_any(text, ("statut", "status", "historique", "list", "liste", "mes demandes")):
            return "authorization.list", 0.82
        return "authorization.create", 0.86
