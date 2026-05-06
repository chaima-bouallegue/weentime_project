from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


class TeleworkAgent(ConfirmationMixin, DomainAgent):
    name = "telework"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        if intent == "telework.list":
            return await self.read_response(
                tool_name="legacy.get_my_requests",
                tool_input={"payload": {"filter": "telework"}},
                context=context,
                intent=intent,
                success_text="Voici vos demandes de teletravail.",
                confidence=confidence,
            )
        if intent == "telework.create":
            payload = extract_payload(message, "CREATE_TELEWORK", context)
            if not payload.get("start_date") or not payload.get("end_date"):
                return AgentResponse(type="ask", text="Pour quelle date souhaitez-vous demander le teletravail ?", intent=intent, confidence=confidence)
            return self.confirmation_response(
                context=context,
                tool_name="legacy.create_telework",
                tool_input={"payload": payload},
                intent=intent,
                text="Confirmez-vous la creation de cette demande de teletravail ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous faire pour le teletravail ?", intent="telework.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if not has_any(text, ("teletravail", "télétravail", "telework", "remote", "télétravail")):
            return None, 0.0
        if has_any(text, ("statut", "status", "historique", "list", "liste", "mes demandes")):
            return "telework.list", 0.82
        return "telework.create", 0.88
