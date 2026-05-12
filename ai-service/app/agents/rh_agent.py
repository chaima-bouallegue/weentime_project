from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor
from app.tools.result import get_read_result

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
                return AgentResponse(
                    type="ask",
                    text="Voulez-vous approuver ou refuser une demande existante ? Donnez-moi l'identifiant, le type ou le nom de l'employe.",
                    intent=intent,
                    confidence=confidence,
                )
            if not payload.get("type_demande"):
                payload["type_demande"] = _infer_request_type(message) or "CONGE"
            details = await self._resolve_request_details(payload, context)
            if details.get("not_found"):
                return AgentResponse(
                    type="ask",
                    text="Je n'ai trouve aucune demande correspondante. Donnez-moi l'identifiant ou le type de demande.",
                    intent=intent,
                    confidence=confidence,
                    actionResult={"kind": "approval_lookup", "status": "not_found", "query": payload},
                )
            return self.confirmation_response(
                context=context,
                tool_name="legacy.process_request",
                tool_input={"payload": payload},
                intent=intent,
                text=f"{details['text']}\nConfirmez-vous cette decision RH ?",
                confidence=confidence,
                action_result={
                    "kind": "approval_confirmation",
                    "agent": "RHAgent",
                    "summary": details["summary"],
                    "request": details.get("request"),
                },
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous faire cote RH ?", intent="rh.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if not has_any(text, ("rh", "stats", "statistiques", "kpi", "toutes les demandes", "process", "traiter", "approuve", "approve", "valide", "refuse", "reject", "rejette")):
            return None, 0.0
        if has_any(text, ("stats", "statistiques", "kpi")):
            return "rh.stats", 0.9
        if has_any(text, ("toutes les demandes", "all requests", "demandes rh", "backlog")):
            return "rh.all_requests", 0.84
        if has_any(text, ("process", "traiter", "approuve", "approve", "refuse", "reject")):
            return "rh.process", 0.91
        return None, 0.0

    async def _resolve_request_details(self, payload: dict, context: CurrentUserContext) -> dict:
        result = await self.executor.execute("legacy.get_all_requests", {}, context)
        read_result = get_read_result(result.data)
        items = read_result.get("items") if isinstance(read_result, dict) and isinstance(read_result.get("items"), list) else None
        request_id = payload.get("request_id")
        if items is None:
            return {
                "text": f"Demande {request_id} selectionnee. Les details complets ne sont pas disponibles depuis l'outil de lecture.",
                "summary": {"requestId": request_id, "type": payload.get("type_demande"), "status": "details_unavailable"},
                "request": None,
            }
        match = _find_request(items, request_id)
        if match is None:
            return {"not_found": True}
        return {
            "text": "Details de la demande : " + _request_label(match),
            "summary": _request_summary(match),
            "request": match,
        }


def _infer_request_type(message: str) -> str | None:
    text = (message or "").lower()
    if has_any(text, ("teletravail", "telework", "remote")):
        return "TELETRAVAIL"
    if has_any(text, ("autorisation", "permission")):
        return "AUTORISATION"
    if has_any(text, ("document", "attestation", "bulletin")):
        return "DOCUMENT"
    if has_any(text, ("conge", "leave")):
        return "CONGE"
    return None


def _find_request(items: list, request_id: object) -> dict | None:
    for item in items:
        if not isinstance(item, dict):
            continue
        for key in ("id", "requestId", "request_id", "demandeId"):
            try:
                if int(item.get(key)) == int(request_id):
                    return item
            except (TypeError, ValueError):
                continue
    return None


def _request_summary(item: dict) -> dict:
    return {
        "requestId": item.get("id") or item.get("requestId") or item.get("request_id") or item.get("demandeId"),
        "employee": item.get("employee") or item.get("employe") or item.get("user") or item.get("fullName") or item.get("nom"),
        "type": item.get("type") or item.get("typeDemande") or item.get("type_demande"),
        "date": item.get("date") or item.get("dateDebut") or item.get("startDate"),
        "endDate": item.get("dateFin") or item.get("endDate"),
        "status": item.get("statut") or item.get("status"),
        "motif": item.get("motif") or item.get("reason"),
    }


def _request_label(item: dict) -> str:
    summary = _request_summary(item)
    parts = [
        summary.get("employee") or "employe inconnu",
        summary.get("type") or "demande",
        summary.get("date") or "date non renseignee",
        summary.get("status") or "statut inconnu",
    ]
    motif = summary.get("motif")
    if motif:
        parts.append(f"motif: {motif}")
    return " - ".join(str(part) for part in parts if part)
