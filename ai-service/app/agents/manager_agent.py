from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import get_read_result

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any


MANAGER_LIST_TOOLS: tuple[tuple[str, str, str], ...] = (
    ("CONGE", "leave.list_manager_requests", "Conges"),
    ("TELETRAVAIL", "telework.list_manager_requests", "Teletravail"),
    ("AUTORISATION", "authorization.list_manager_requests", "Autorisations"),
)

MANAGER_DECISION_TOOLS: dict[str, tuple[str, str]] = {
    "CONGE": ("leave.get_request_status", "leave.manager_decide"),
    "TELETRAVAIL": ("telework.get_status", "telework.manager_decide"),
    "AUTORISATION": ("authorization.get_status", "authorization.manager_decide"),
}


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
        if intent in {"manager.pending_approvals", "manager.team_requests"}:
            return await self._read_pending_requests(context, intent=intent, confidence=confidence)

        if intent in {"manager.approve", "manager.reject"}:
            payload = extract_payload(message, "APPROVE_REQUEST" if intent == "manager.approve" else "REJECT_REQUEST", context)
            request_id = payload.get("request_id")
            if not request_id:
                return AgentResponse(type="ask", text="Quel identifiant de demande souhaitez-vous traiter ?", intent=intent, confidence=confidence)

            request_type = _normalize_request_type(payload.get("type_demande") or _infer_request_type(message))
            details = await self._resolve_request_details(int(request_id), request_type, context)
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
                    text="Cette decision manager n'est pas disponible via les outils modernes pour ce type de demande.",
                    intent=intent,
                    confidence=confidence,
                    actionResult={"kind": "capability_unavailable", "type": request_type},
                )

            decision = "APPROVE" if intent == "manager.approve" else "REJECT"
            tool_name = details["decision_tool"]
            tool_input = {"request_id": int(request_id), "decision": decision}
            comment = payload.get("comment") or payload.get("reason")
            if comment:
                tool_input["comment"] = comment

            return self.confirmation_response(
                context=context,
                tool_name=tool_name,
                tool_input=tool_input,
                intent=intent,
                text=f"{details['text']}\nConfirmez-vous cette decision manager ?",
                confidence=confidence,
                action_result={
                    "kind": "approval_confirmation",
                    "agent": "ManagerAgent",
                    "toolName": tool_name,
                    "summary": details["summary"],
                    "request": details.get("request"),
                },
            )

        return AgentResponse(type="ask", text="Que souhaitez-vous faire cote manager ?", intent="manager.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if not has_any(text, ("approuve", "approve", "valide", "refuse", "reject", "rejette", "validation", "equipe", "team", "pending", "approbation", "approval", "approbations", "approvals")):
            return None, 0.0
        # "approbation(s)" / "approval(s)" must be checked BEFORE "approuve"/"approve"
        # because str.find("approve") matches inside "approvals". The verb forms
        # (approuver/approve) signal a per-request decision; the noun forms
        # (approbations/approvals) signal a list-pending request.
        if has_any(text, ("approbation", "approbations", "approval", "approvals", "validation", "pending", "en attente")):
            return "manager.pending_approvals", 0.85
        if has_any(text, ("approuve", "approve", "valide")):
            return "manager.approve", 0.91
        if has_any(text, ("refuse", "reject", "rejette")):
            return "manager.reject", 0.91
        if has_any(text, ("equipe", "team")):
            return "manager.team_requests", 0.82
        return None, 0.0

    async def _read_pending_requests(self, context: CurrentUserContext, *, intent: str, confidence: float) -> AgentResponse:
        sections: list[dict[str, Any]] = []
        tool_calls: list[ToolCallRecord] = []
        warnings: list[str] = []

        for request_type, tool_name, label in MANAGER_LIST_TOOLS:
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

        lines = ["Voici les demandes manager accessibles :"]
        if not sections:
            lines.append("Aucune donnee manager disponible pour le moment.")
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
            actionResult={"kind": "manager_pending_summary", "sections": sections, "warnings": warnings},
        )

    async def _resolve_request_details(self, request_id: int, request_type: str | None, context: CurrentUserContext) -> dict[str, Any]:
        if request_type:
            return await self._fetch_detail(request_id, request_type, context)

        matches: list[dict[str, Any]] = []
        for candidate_type, tool_name, _label in MANAGER_LIST_TOOLS:
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
        return await self._fetch_detail(request_id, matches[0]["type"], context)

    async def _fetch_detail(self, request_id: int, request_type: str, context: CurrentUserContext) -> dict[str, Any]:
        mapping = MANAGER_DECISION_TOOLS.get(request_type)
        if mapping is None:
            return {"unsupported": True}
        detail_tool, decision_tool = mapping
        result = await self.executor.execute(detail_tool, {"request_id": request_id}, context)
        if not result.success:
            return {"not_found": True, "error": result.error_message}
        read_result = get_read_result(result.data)
        item = _first_read_item(read_result) if read_result else None
        if item is None:
            return {"not_found": True}
        summary = _request_summary(item, request_type)
        return {
            "text": "Details de la demande : " + _request_label(summary),
            "summary": summary,
            "request": item,
            "decision_tool": decision_tool,
        }


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
