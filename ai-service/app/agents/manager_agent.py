from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor
from app.tools.result import get_read_result

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
            details = await self._resolve_request_details(payload, context)
            if details.get("not_found"):
                return AgentResponse(
                    type="ask",
                    text="Je n'ai trouve aucune demande correspondante. Donnez-moi l'identifiant ou le type de demande.",
                    intent=intent,
                    confidence=confidence,
                    actionResult={"kind": "approval_lookup", "status": "not_found", "query": payload},
                )
            tool = "legacy.approve_request" if intent == "manager.approve" else "legacy.reject_request"
            return self.confirmation_response(
                context=context,
                tool_name=tool,
                tool_input={"payload": payload},
                intent=intent,
                text=f"{details['text']}\nConfirmez-vous cette decision manager ?",
                confidence=confidence,
                action_result={
                    "kind": "approval_confirmation",
                    "agent": "ManagerAgent",
                    "summary": details["summary"],
                    "request": details.get("request"),
                },
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

    async def _resolve_request_details(self, payload: dict, context: CurrentUserContext) -> dict:
        result = await self.executor.execute("legacy.get_pending_validations", {}, context)
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
