from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


TELEWORK_TERMS = (
    "teletravail",
    "télétravail",
    "telework",
    "remote",
    "remote work",
    "work from home",
    "wfh",
    "travail a distance",
    "travail à distance",
    "تليترافاي",
    "عن بعد",
)


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
        source_text = _source_text(message, context)
        if intent == "telework.list":
            return await self.read_response(
                tool_name="telework.list_my_requests",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici vos demandes de teletravail.",
                confidence=confidence,
            )
        if intent == "telework.status":
            payload = extract_payload(source_text, "CREATE_TELEWORK", context)
            request_id = payload.get("request_id")
            if request_id:
                return await self.read_response(
                    tool_name="telework.get_status",
                    tool_input={"request_id": request_id},
                    context=context,
                    intent=intent,
                    success_text="Voici le statut de cette demande de teletravail.",
                    confidence=confidence,
                )
            return await self.read_response(
                tool_name="telework.list_my_requests",
                tool_input={},
                context=context,
                intent="telework.list",
                success_text="Voici vos demandes de teletravail.",
                confidence=confidence,
            )
        if intent == "telework.approval_context":
            return AgentResponse(
                type="ask",
                text="Voulez-vous approuver ou refuser une demande de teletravail existante ? Donnez-moi le nom ou l'identifiant.",
                intent=intent,
                confidence=confidence,
                actionResult={
                    "kind": "capability_hint",
                    "capability": "telework.approval",
                    "status": "needs_request_reference",
                },
            )
        if intent == "telework.create":
            payload = extract_payload(source_text, "CREATE_TELEWORK", context)
            if not payload.get("start_date") or not payload.get("end_date"):
                return AgentResponse(
                    type="ask",
                    text="Pour quelle date souhaitez-vous demander le teletravail ?",
                    intent=intent,
                    confidence=confidence,
                )
            if payload.get("date_precision") == "month_inferred":
                return AgentResponse(
                    type="ask",
                    text="Pouvez-vous confirmer la date complete du teletravail ?",
                    intent=intent,
                    confidence=0.62,
                )
            telework_type = payload.get("telework_type") or _infer_telework_type(source_text)
            if not telework_type:
                return AgentResponse(
                    type="ask",
                    text="Souhaitez-vous une journee complete, une matinee, un apres-midi ou une semaine complete ?",
                    intent=intent,
                    confidence=confidence,
                )
            return self.confirmation_response(
                context=context,
                tool_name="telework.create_request",
                tool_input={
                    "start_date": payload["start_date"],
                    "end_date": payload["end_date"],
                    "telework_type": telework_type,
                    "period": payload.get("telework_period"),
                    "reason": payload.get("reason"),
                },
                intent=intent,
                text="Confirmez-vous la creation de cette demande de teletravail ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous faire pour le teletravail ?", intent="telework.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = _source_text(message, context).lower()
        if not has_any(text, TELEWORK_TERMS):
            return None, 0.0
        role = (context.role if context is not None else "EMPLOYEE").upper().replace("ROLE_", "")
        personal_create = has_any(text, ("je veux", "je souhaite", "je voudrais", "i want", "i need", "nheb", "pour moi", "my "))
        if has_any(text, ("statut", "status", "suivi", "etat", "état")):
            return "telework.status", 0.84
        if has_any(text, ("historique", "list", "liste", "mes demandes", "show", "montre")):
            return "telework.list", 0.84
        if role in {"RH", "MANAGER", "ADMIN"} and not personal_create:
            return "telework.approval_context", 0.86
        return "telework.create", 0.9


def _source_text(message: str, context: CurrentUserContext | None) -> str:
    original = ""
    if context is not None:
        original_value = context.metadata.get("original_text") if isinstance(context.metadata, dict) else None
        original = str(original_value or "")
    if original and original != message:
        return f"{message or ''} {original}".strip()
    return message or ""


def _infer_telework_type(message: str) -> str | None:
    text = (message or "").lower()
    if has_any(text, ("matin", "morning")):
        return "DEMI_JOURNEE_MATIN"
    if has_any(text, ("apres midi", "après midi", "afternoon")):
        return "DEMI_JOURNEE_APRES_MIDI"
    if has_any(text, ("semaine", "week")):
        return "SEMAINE_COMPLETE"
    if has_any(text, TELEWORK_TERMS):
        return "JOURNEE_COMPLETE"
    return None
