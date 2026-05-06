from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


class DocumentAgent(ConfirmationMixin, DomainAgent):
    name = "document"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        if intent == "document.status":
            return await self.read_response(
                tool_name="legacy.get_my_requests",
                tool_input={"payload": {"filter": "document"}},
                context=context,
                intent=intent,
                success_text="Voici vos demandes de documents.",
                confidence=confidence,
            )
        if intent == "document.open":
            payload = extract_payload(message, "OPEN_DOCUMENT", context)
            if not payload.get("request_id"):
                return AgentResponse(type="ask", text="Quel document souhaitez-vous ouvrir ?", intent=intent, confidence=confidence)
            return await self.read_response(
                tool_name="legacy.open_document",
                tool_input={"payload": payload},
                context=context,
                intent=intent,
                success_text="Le document est pret.",
                confidence=confidence,
            )
        if intent == "document.request":
            payload = extract_payload(message, "REQUEST_DOCUMENT", context)
            if not payload.get("document_type"):
                lowered = (message or "").lower()
                if "salaire" in lowered or "salary" in lowered:
                    payload["document_type"] = "ATTESTATION_SALAIRE"
                elif "travail" in lowered or "work" in lowered or "عمل" in lowered:
                    payload["document_type"] = "ATTESTATION_TRAVAIL"
                elif "bulletin" in lowered or "payslip" in lowered or "paie" in lowered:
                    payload["document_type"] = "BULLETIN_PAIE"
            if not payload.get("document_type"):
                return AgentResponse(
                    type="ask",
                    text="Quel type de document souhaitez-vous demander ?",
                    intent=intent,
                    confidence=confidence,
                )
            return self.confirmation_response(
                context=context,
                tool_name="legacy.request_document",
                tool_input={"payload": payload},
                intent=intent,
                text="Confirmez-vous cette demande de document ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Quel document souhaitez-vous gerer ?", intent="document.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if not has_any(text, ("document", "attestation", "certificat", "bulletin", "fiche", "payslip", "certificate")):
            return None, 0.0
        if has_any(text, ("ouvrir", "open", "telecharger", "download")):
            return "document.open", 0.9
        if has_any(text, ("statut", "status", "suivi", "historique", "mes demandes", "list", "liste")):
            return "document.status", 0.82
        return "document.request", 0.88
