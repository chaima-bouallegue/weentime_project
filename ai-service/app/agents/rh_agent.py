from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import get_read_result

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


RH_LIST_TOOLS: tuple[tuple[str, str, str], ...] = (
    ("CONGE", "leave.list_rh_pending", "Conges"),
    ("TELETRAVAIL", "telework.list_rh_pending", "Teletravail"),
    ("AUTORISATION", "authorization.list_rh_requests", "Autorisations"),
    ("DOCUMENT", "document.list_my_requests", "Documents"),
)

RH_DECISION_TOOLS: dict[str, tuple[str, str | None, str | None]] = {
    "CONGE": ("leave.get_request_status", "leave.rh_decide", None),
    "TELETRAVAIL": ("telework.get_status", "telework.rh_decide", None),
    "AUTORISATION": ("authorization.get_status", "authorization.rh_decide", None),
    "DOCUMENT": ("document.get_status", None, "document.rh_reject"),
}


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
            return await self._read_rh_requests(context, intent=intent, confidence=confidence)

        if intent == "rh.process":
            payload = extract_payload(message, "PROCESS_REQUEST", context)
            request_id = payload.get("request_id")
            decision = _normalize_decision(payload.get("decision") or _infer_decision(message))
            if not request_id or not decision:
                return AgentResponse(
                    type="ask",
                    text="Voulez-vous approuver ou refuser une demande existante ? Donnez-moi l'identifiant, le type ou le nom de l'employe.",
                    intent=intent,
                    confidence=confidence,
                )

            request_type = _normalize_request_type(payload.get("type_demande") or _infer_request_type(message))
            details = await self._resolve_request_details(int(request_id), request_type, decision, context)
            if details.get("ambiguous"):
                return AgentResponse(
                    type="ask",
                    text=_choices_text(details["ambiguous"]),
                    intent=intent,
                    confidence=confidence,
                    actionResult={"kind": "approval_lookup", "status": "ambiguous", "choices": details["ambiguous"]},
                )
            if details.get("not_found"):
                return AgentResponse(
                    type="ask",
                    text="Je n'ai trouve aucune demande correspondante. Donnez-moi l'identifiant ou le type de demande.",
                    intent=intent,
                    confidence=confidence,
                    actionResult={"kind": "approval_lookup", "status": "not_found", "query": payload},
                )
            if details.get("unsupported"):
                return AgentResponse(
                    type="error",
                    text=details.get("message") or "Cette action RH n'est pas encore disponible via le backend moderne.",
                    intent=intent,
                    confidence=confidence,
                    actionResult={"kind": "capability_unavailable", "type": request_type},
                )

            tool_name = details["decision_tool"]
            tool_input = {"request_id": int(request_id)}
            if tool_name != "document.rh_reject":
                tool_input["decision"] = decision
                comment = payload.get("comment") or payload.get("reason")
                if comment:
                    tool_input["comment"] = comment
            else:
                tool_input["reason"] = payload.get("comment") or payload.get("reason") or "Refus RH"

            return self.confirmation_response(
                context=context,
                tool_name=tool_name,
                tool_input=tool_input,
                intent=intent,
                text=f"{details['text']}\nConfirmez-vous cette decision RH ?",
                confidence=confidence,
                action_result={
                    "kind": "approval_confirmation",
                    "agent": "RHAgent",
                    "toolName": tool_name,
                    "summary": details["summary"],
                    "request": details.get("request"),
                },
            )

        return AgentResponse(type="ask", text="Que souhaitez-vous faire cote RH ?", intent="rh.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if not has_any(text, ("rh", "stats", "statistiques", "kpi", "toutes les demandes", "process", "traiter", "approuve", "approve", "valide", "refuse", "reject", "rejette", "validation")):
            return None, 0.0
        if has_any(text, ("stats", "statistiques", "kpi")):
            return "rh.stats", 0.9
        if has_any(text, ("toutes les demandes", "all requests", "demandes rh", "backlog", "validation", "en attente")) and not has_any(text, ("approuve", "approve", "refuse", "reject", "rejette")):
            return "rh.all_requests", 0.84
        if has_any(text, ("process", "traiter", "approuve", "approve", "valide", "refuse", "reject", "rejette")):
            return "rh.process", 0.91
        return None, 0.0

    async def _read_rh_requests(self, context: CurrentUserContext, *, intent: str, confidence: float) -> AgentResponse:
        sections: list[dict[str, Any]] = []
        tool_calls: list[ToolCallRecord] = []
        warnings: list[str] = []

        for request_type, tool_name, label in RH_LIST_TOOLS:
            result = await self.executor.execute(tool_name, {}, context)
            tool_calls.append(ToolCallRecord(name=tool_name, arguments={}, status="success" if result.success else "failed"))
            read_result = get_read_result(result.data)
            if result.success and read_result:
                sections.append(
                    {
                        "type": request_type,
                        "title": label,
                        "summary": read_result.get("summary"),
                        "count": read_result.get("count", 0),
                        "items": read_result.get("items", []),
                    }
                )
            else:
                warnings.append(result.error_message or f"{label}: donnees indisponibles")

        lines = ["Voici les demandes RH accessibles :"]
        if not sections:
            lines.append("Aucune donnee RH disponible pour le moment.")
        for section in sections:
            lines.append(f"- {section['title']}: {section.get('summary') or 'aucune synthese'}")
        if warnings:
            lines.append("Certaines donnees sont indisponibles.")

        return AgentResponse(
            type="answer",
            text="\n".join(lines),
            intent=intent,
            confidence=confidence,
            toolCalls=tool_calls,
            actionResult={"kind": "rh_request_summary", "sections": sections, "warnings": warnings},
        )

    async def _resolve_request_details(self, request_id: int, request_type: str | None, decision: str, context: CurrentUserContext) -> dict[str, Any]:
        if request_type:
            return await self._fetch_detail(request_id, request_type, decision, context)

        matches: list[dict[str, Any]] = []
        for candidate_type, tool_name, _label in RH_LIST_TOOLS:
            result = await self.executor.execute(tool_name, {}, context)
            read_result = get_read_result(result.data)
            items = read_result.get("items") if isinstance(read_result, dict) and isinstance(read_result.get("items"), list) else []
            match = _find_request(items, request_id)
            if match is not None:
                matches.append({"type": candidate_type, "request": match, "summary": _request_summary(match, candidate_type)})

        if len(matches) > 1:
            return {"ambiguous": matches}
        if not matches:
            return {"not_found": True}
        return await self._fetch_detail(request_id, matches[0]["type"], decision, context)

    async def _fetch_detail(self, request_id: int, request_type: str, decision: str, context: CurrentUserContext) -> dict[str, Any]:
        mapping = RH_DECISION_TOOLS.get(request_type)
        if mapping is None:
            return {"unsupported": True}
        detail_tool, approve_or_decide_tool, reject_tool = mapping
        result = await self.executor.execute(detail_tool, {"request_id": request_id}, context)
        if not result.success:
            return {"not_found": True, "error": result.error_message}
        read_result = get_read_result(result.data)
        item = _first_read_item(read_result) if read_result else None
        if item is None:
            return {"not_found": True}

        summary = _request_summary(item, request_type)
        decision_tool = reject_tool if request_type == "DOCUMENT" and decision == "REJECT" else approve_or_decide_tool
        if request_type == "DOCUMENT" and decision != "REJECT":
            return {
                "unsupported": True,
                "message": "La validation de document necessite un contenu ou un fichier document. Utilisez le flux RH document dedie.",
            }
        if decision_tool is None:
            return {"unsupported": True}
        return {
            "text": "Details de la demande : " + _request_label(summary),
            "summary": summary,
            "request": item,
            "decision_tool": decision_tool,
        }


def _normalize_decision(value: Any) -> str | None:
    text = str(value or "").strip().upper()
    if text in {"APPROVE", "APPROVED", "APPROUVE", "APPROUVEE", "VALIDER", "VALIDE", "ACCEPTER", "ACCEPTE"}:
        return "APPROVE"
    if text in {"REJECT", "REJECTED", "REFUSE", "REFUSER", "REJETER", "REJETTE"}:
        return "REJECT"
    return None


def _infer_decision(message: str) -> str | None:
    text = (message or "").lower()
    if has_any(text, ("approuve", "approve", "valide", "accepte")):
        return "APPROVE"
    if has_any(text, ("refuse", "reject", "rejette")):
        return "REJECT"
    return None


def _normalize_request_type(value: Any) -> str | None:
    text = str(value or "").strip().upper()
    if text in {"CONGE", "LEAVE"}:
        return "CONGE"
    if text in {"TELETRAVAIL", "TELEWORK", "REMOTE"}:
        return "TELETRAVAIL"
    if text in {"AUTORISATION", "AUTHORIZATION", "AUTHORISATION", "PERMISSION"}:
        return "AUTORISATION"
    if text in {"DOCUMENT", "DOC"}:
        return "DOCUMENT"
    return None


def _infer_request_type(message: str) -> str | None:
    text = (message or "").lower()
    if has_any(text, ("teletravail", "telework", "remote")):
        return "TELETRAVAIL"
    if has_any(text, ("autorisation", "permission")):
        return "AUTORISATION"
    if has_any(text, ("document", "attestation", "bulletin")):
        return "DOCUMENT"
    if has_any(text, ("conge", "conges", "congé", "leave")):
        return "CONGE"
    return None


def _find_request(items: list[Any], request_id: int) -> dict[str, Any] | None:
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


def _first_read_item(read_result: dict[str, Any] | None) -> dict[str, Any] | None:
    if not read_result:
        return None
    items = read_result.get("items")
    if isinstance(items, list) and items and isinstance(items[0], dict):
        return items[0]
    data = read_result.get("data")
    return data if isinstance(data, dict) else None


def _request_summary(item: dict[str, Any], request_type: str | None = None) -> dict[str, Any]:
    employee = item.get("employee") or item.get("employe") or item.get("user") or item.get("fullName") or item.get("nom")
    return {
        "requestId": item.get("id") or item.get("requestId") or item.get("request_id") or item.get("demandeId"),
        "employee": employee,
        "type": request_type or item.get("type") or item.get("typeDemande") or item.get("type_demande"),
        "date": item.get("date") or item.get("dateDebut") or item.get("startDate") or item.get("dateAutorisation"),
        "endDate": item.get("dateFin") or item.get("endDate"),
        "time": _time_label(item),
        "status": item.get("statut") or item.get("status"),
        "motif": item.get("motif") or item.get("reason"),
    }


def _time_label(item: dict[str, Any]) -> str | None:
    start = item.get("heureDebut") or item.get("timeStart") or item.get("startTime")
    end = item.get("heureFin") or item.get("timeEnd") or item.get("endTime")
    if start and end:
        return f"{start} - {end}"
    return None


def _request_label(summary: dict[str, Any]) -> str:
    parts = [
        summary.get("employee") or "employe inconnu",
        summary.get("type") or "demande",
        summary.get("date") or "date non renseignee",
        summary.get("time"),
        summary.get("status") or "statut inconnu",
    ]
    motif = summary.get("motif")
    if motif:
        parts.append(f"motif: {motif}")
    return " - ".join(str(part) for part in parts if part)


def _choices_text(choices: list[dict[str, Any]]) -> str:
    lines = ["Plusieurs demandes correspondent. Choisissez l'identifiant exact :"]
    for index, choice in enumerate(choices, start=1):
        lines.append(f"{index}. {_request_label(choice.get('summary') or {})}")
    return "\n".join(lines)
