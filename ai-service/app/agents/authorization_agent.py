from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


AUTHORIZATION_TERMS = (
    "autorisation",
    "permission",
    "sortie",
    "rdv",
    "rendez vous",
    "retard",
    "leave early",
    "authorization",
    "authorisation",
    "إذن",
    "اذن",
    "خروج",
    "nokhrej",
)


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
        source_text = _source_text(message, context)
        if intent == "authorization.info":
            return AgentResponse(
                type="answer",
                text=(
                    "Types d'autorisation disponibles : "
                    "SORTIE_ANTICIPEE (partir plus tot), "
                    "ARRIVEE_TARDIVE (arriver en retard), "
                    "ABSENCE_TEMPORAIRE (s'absenter le temps d'un rendez-vous), "
                    "et AUTRE (autre cas). "
                    "Dites par exemple : \"je veux une autorisation demain de 14h a 16h pour rendez-vous medical\"."
                ),
                intent="authorization.info",
                confidence=confidence,
                actionResult={
                    "kind": "capability_hint",
                    "capability": "authorization.types",
                    "types": [
                        {"code": "SORTIE_ANTICIPEE", "label": "Sortie anticipee"},
                        {"code": "ARRIVEE_TARDIVE", "label": "Arrivee tardive"},
                        {"code": "ABSENCE_TEMPORAIRE", "label": "Absence temporaire"},
                        {"code": "AUTRE", "label": "Autre"},
                    ],
                },
            )
        if intent == "authorization.list":
            return await self.read_response(
                tool_name="authorization.list_my_requests",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici vos demandes d'autorisation.",
                confidence=confidence,
            )
        if intent == "authorization.status":
            payload = extract_payload(source_text, "CREATE_AUTORISATION", context)
            request_id = payload.get("request_id")
            if request_id:
                return await self.read_response(
                    tool_name="authorization.get_status",
                    tool_input={"request_id": request_id},
                    context=context,
                    intent=intent,
                    success_text="Voici le statut de cette autorisation.",
                    confidence=confidence,
                )
            return await self.read_response(
                tool_name="authorization.list_my_requests",
                tool_input={},
                context=context,
                intent="authorization.list",
                success_text="Voici vos demandes d'autorisation.",
                confidence=confidence,
            )
        if intent == "authorization.create":
            payload = extract_payload(source_text, "CREATE_AUTORISATION", context)
            if not payload.get("request_date"):
                return AgentResponse(
                    type="ask",
                    text="Pour quelle date souhaitez-vous demander cette autorisation ?",
                    intent=intent,
                    confidence=confidence,
                )
            if not payload.get("time_start") or not payload.get("time_end"):
                return AgentResponse(
                    type="ask",
                    text="Merci de preciser les heures de debut et de fin de l'autorisation.",
                    intent=intent,
                    confidence=confidence,
                )
            authorization_type = payload.get("authorization_type") or _infer_authorization_type(source_text)
            if not authorization_type:
                return AgentResponse(
                    type="ask",
                    text="Quel type d'autorisation souhaitez-vous demander ? Par exemple: sortie anticipee, arrivee tardive ou absence temporaire.",
                    intent=intent,
                    confidence=confidence,
                )
            reason = _normalize_reason(payload.get("reason") or _infer_reason(source_text))
            if not reason:
                return AgentResponse(
                    type="ask",
                    text="Quel motif souhaitez-vous indiquer pour cette autorisation ?",
                    intent=intent,
                    confidence=confidence,
                )
            return self.confirmation_response(
                context=context,
                tool_name="authorization.create_request",
                tool_input={
                    "request_date": payload["request_date"],
                    "time_start": payload["time_start"],
                    "time_end": payload["time_end"],
                    "authorization_type": authorization_type,
                    "reason": reason,
                },
                intent=intent,
                text="Confirmez-vous cette demande d'autorisation ?",
                confidence=confidence,
                action_result={
                    "kind": "confirmation_summary",
                    "intent": intent,
                    "summary": {
                        "type": authorization_type,
                        "date": payload["request_date"],
                        "time": f"{payload['time_start']} - {payload['time_end']}",
                        "motif": reason,
                    },
                },
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous faire avec vos autorisations ?", intent="authorization.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = _source_text(message, context).lower()
        if not has_any(text, AUTHORIZATION_TERMS):
            return None, 0.0
        # Info / "what authorizations are available?" queries — must NOT
        # trigger a create flow. Catch FR/EN/TN phrasings that ask about the
        # set of supported authorization types.
        if has_any(text, (
            "c quoi les autorisation",
            "quelles autorisations",
            "quels types d'autorisation",
            "types d'autorisation",
            "types autorisation",
            "what authorizations",
            "what kind of authorizations",
            "dispo",
            "disponible",
            "available",
            "supportees",
            "supportés",
            "supported",
            "anwa3",
            "shnowa",
        )) and not has_any(text, ("je veux", "je souhaite", "je voudrais", "i want", "i need", "nheb", "demander")):
            return "authorization.info", 0.92
        if has_any(text, ("statut", "status", "suivi", "etat", "état")):
            return "authorization.status", 0.84
        if has_any(text, ("historique", "list", "liste", "mes demandes", "mes autorisations", "show", "montre")):
            return "authorization.list", 0.84
        return "authorization.create", 0.88


def _source_text(message: str, context: CurrentUserContext | None) -> str:
    original = ""
    if context is not None:
        original_value = context.metadata.get("original_text") if isinstance(context.metadata, dict) else None
        original = str(original_value or "")
    if original and original != message:
        return f"{message or ''} {original}".strip()
    return message or ""


def _infer_authorization_type(message: str) -> str | None:
    text = (message or "").lower()
    if has_any(text, ("sortie", "partir", "leave early", "خروج", "nokhrej")):
        return "SORTIE_ANTICIPEE"
    if has_any(text, ("retard", "arrivee tardive", "late arrival")):
        return "ARRIVEE_TARDIVE"
    if has_any(text, ("absence", "rdv", "rendez vous", "medical", "medecin", "إذن", "اذن")):
        return "ABSENCE_TEMPORAIRE"
    if has_any(text, ("autorisation", "permission")):
        return "AUTRE"
    return None


def _infer_reason(message: str) -> str | None:
    text = (message or "").lower()
    if has_any(text, ("rdv medical", "rendez vous medical", "rendez-vous medical", "medecin", "medical appointment")):
        return "rendez-vous medical"
    return None


def _normalize_reason(value: str | None) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    return text.replace("rendez vous", "rendez-vous")
