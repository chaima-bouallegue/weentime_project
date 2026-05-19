from __future__ import annotations

import re
import unicodedata
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
            return AgentResponse(
                type="error",
                text="Votre role ne permet pas cette action.",
                intent="manager.forbidden",
                confidence=0.95,
            )

        intent, confidence = self.detect_intent(message, context)
        if intent == "manager.team_schedule":
            return await self.read_response(
                 tool_name="manager.team_schedule",
                 tool_input={},
                 context=context,
                 intent=intent,
                 success_text="Voici les horaires de votre équipe.",
                 confidence=confidence,
            )

        if intent == "manager.team_presence":
            return await self.read_response(
                tool_name="get_team_presence",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici la présence de votre équipe.",
                confidence=confidence,
            )

        if intent == "manager.team_telework":
            return await self.read_response(
                tool_name="telework.list_manager_requests",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici les demandes télétravail de votre équipe.",
                confidence=confidence,
            )

        if intent in {"manager.pending_approvals", "manager.team_requests"}:
            return await self._read_pending_requests(
                context,
                intent=intent,
                confidence=confidence,
            )

        if intent in {"manager.approve", "manager.reject"}:
            payload = extract_payload(
                message,
                "APPROVE_REQUEST" if intent == "manager.approve" else "REJECT_REQUEST",
                context,
            )

            request_id = payload.get("request_id")
            request_type = _normalize_request_type(
                payload.get("type_demande") or _infer_request_type(message)
            )

            if not request_id:
                employee_name = _extract_employee_name(message)

                if employee_name:
                    name_match = await self._resolve_by_employee_name(
                        employee_name,
                        request_type,
                        context,
                    )

                    if name_match.get("ambiguous"):
                        return AgentResponse(
                            type="ask",
                            text=_choices_text(name_match["ambiguous"]),
                            intent=intent,
                            confidence=confidence,
                            actionResult={
                                "kind": "approval_lookup",
                                "status": "ambiguous",
                                "choices": name_match["ambiguous"],
                            },
                        )

                    if name_match.get("not_found"):
                        return AgentResponse(
                            type="ask",
                            text=(
                                f"Je n'ai trouvé aucune demande en attente pour {employee_name}. "
                                "Donnez-moi l'identifiant ou précisez le type de demande."
                            ),
                            intent=intent,
                            confidence=confidence,
                            actionResult={
                                "kind": "approval_lookup",
                                "status": "not_found",
                                "query": {
                                    "employee": employee_name,
                                    "type": request_type,
                                },
                            },
                        )

                    request_id = name_match["matched_id"]
                    request_type = name_match.get("type") or request_type

                if not request_id:
                    return AgentResponse(
                        type="ask",
                        text="Quel identifiant de demande souhaitez-vous traiter ?",
                        intent=intent,
                        confidence=confidence,
                    )

            details = await self._resolve_request_details(
                int(request_id),
                request_type,
                context,
            )

            if details.get("ambiguous"):
                return AgentResponse(
                    type="ask",
                    text=_choices_text(details["ambiguous"]),
                    intent=intent,
                    confidence=confidence,
                    actionResult={
                        "kind": "approval_lookup",
                        "status": "ambiguous",
                        "choices": details["ambiguous"],
                    },
                )

            if details.get("not_found"):
                return AgentResponse(
                    type="ask",
                    text="Je n'ai trouvé aucune demande correspondante. Donnez-moi l'identifiant ou le type de demande.",
                    intent=intent,
                    confidence=confidence,
                    actionResult={
                        "kind": "approval_lookup",
                        "status": "not_found",
                        "query": payload,
                    },
                )

            if details.get("unsupported"):
                return AgentResponse(
                    type="error",
                    text="Cette décision manager n'est pas disponible via les outils modernes pour ce type de demande.",
                    intent=intent,
                    confidence=confidence,
                    actionResult={
                        "kind": "capability_unavailable",
                        "type": request_type,
                    },
                )

            decision = "APPROVE" if intent == "manager.approve" else "REJECT"
            tool_name = details["decision_tool"]

            tool_input = {
                "request_id": int(request_id),
                "decision": decision,
            }

            comment = payload.get("comment") or payload.get("reason")
            if comment:
                tool_input["comment"] = comment

            return self.confirmation_response(
                context=context,
                tool_name=tool_name,
                tool_input=tool_input,
                intent=intent,
                text=f"{details['text']}\nConfirmez-vous cette décision manager ?",
                confidence=confidence,
                action_result={
                    "kind": "approval_confirmation",
                    "agent": "ManagerAgent",
                    "toolName": tool_name,
                    "summary": details["summary"],
                    "request": details.get("request"),
                },
            )

        return AgentResponse(
            type="ask",
            text="Que souhaitez-vous faire côté manager ?",
            intent="manager.unknown",
            confidence=0.35,
        )
    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()

        if has_any(text, (
            "horaire equipe", "horaires equipe", "horaire équipe", "horaires équipe",
            "team schedule", "planning equipe", "planning équipe",
            "planning team", "programme equipe", "programme équipe",
            "planning mon equipe", "planning mon équipe",
            "شكون يخدم",
        )):
            return "manager.team_schedule", 0.94

        if has_any(text, (
            "presence equipe", "présence équipe", "presence team",
            "team attendance", "qui est present", "qui est présent",
            "qui est absent", "chkoun absent", "chkoun present",
        )):
            return "manager.team_presence", 0.94

        if has_any(text, (
            "approbation", "approbations", "approval", "approvals",
            "validation", "validations", "pending", "en attente",
            "demandes en attente", "attend validation",
        )):
            return "manager.pending_approvals", 0.90

        if has_any(text, ("approuve", "approve", "valide", "accepte", "accept")):
            return "manager.approve", 0.91

        if has_any(text, ("refuse", "reject", "rejette")):
            return "manager.reject", 0.91

        if has_any(text, ("teletravail equipe", "télétravail équipe", "remote team", "telework team")):
            return "manager.team_telework", 0.88

        if has_any(text, ("equipe", "équipe", "team", "mon equipe", "mon équipe")):
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

    async def _resolve_by_employee_name(
        self,
        employee_name: str,
        request_type: str | None,
        context: CurrentUserContext,
    ) -> dict[str, Any]:
        # When a type is inferred (e.g. "autorisation"), only query that list
        # to avoid pulling all leave/telework rows. Otherwise query all 3.
        candidate_lists = [
            (request_type_key, tool_name)
            for request_type_key, tool_name, _label in MANAGER_LIST_TOOLS
            if request_type is None or request_type_key == request_type
        ]
        if not candidate_lists:
            # Unknown request_type — fall back to all lists.
            candidate_lists = [(t, n) for t, n, _ in MANAGER_LIST_TOOLS]

        matches: list[dict[str, Any]] = []
        normalized_name = _normalize_name(employee_name)
        for candidate_type, tool_name in candidate_lists:
            result = await self.executor.execute(tool_name, {}, context)
            if not result.success:
                continue
            read_result = get_read_result(result.data)
            items = read_result.get("items") if isinstance(read_result, dict) and isinstance(read_result.get("items"), list) else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                if _employee_name_matches(item, normalized_name):
                    matches.append({
                        "type": candidate_type,
                        "request": item,
                        "summary": _request_summary(item, candidate_type),
                    })

        if len(matches) > 1:
            return {"ambiguous": matches}
        if not matches:
            return {"not_found": True}
        only = matches[0]
        rid = only["request"].get("id") or only["request"].get("requestId") or only["request"].get("request_id") or only["request"].get("demandeId")
        try:
            matched_id = int(rid)
        except (TypeError, ValueError):
            return {"not_found": True}
        return {"matched_id": matched_id, "type": only["type"]}

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


# Trailing words that signal the end of an employee-name window in a natural
# approval phrase: "valide la demande de amin dupont POUR pause longue" /
# "approve the conge of amin SUR ce mois" etc.
_NAME_STOPWORDS = (
    "pour", "sur", "le", "la", "les", "une", "un", "de", "du", "des", "et",
    "ou", "ce", "cette", "ces", "en", "with", "for", "of", "and", "or", "the",
    "a", "to", "on", "this", "that",
    # Domain-vocabulary stops — once we hit a leave-type or motif word, the
    # name window has ended.
    "conge", "conges", "congé", "congés", "autorisation", "autorisations",
    "permission", "teletravail", "telework", "remote", "document", "documents",
    "maladie", "annuel", "exceptionnel", "maternite", "paternite",
    "pause", "sortie", "absence", "rdv", "medical", "longue", "courte",
)


def _extract_employee_name(message: str) -> str | None:
    """Pull an employee-name window out of "valide la demande de <name> ..." /
    "approve the conge of <name>". Returns lowercased name or None.

    Looks for "de" / "of" / "for" / "pour" as the trigger, then collects up
    to 4 following alphabetic tokens, stopping at the first stopword.
    """
    text = _normalize_for_name(message)
    if not text:
        return None
    triggers = re.finditer(r"\b(?:de|d'|d|of|for|pour)\b", text)
    for trigger in triggers:
        tail = text[trigger.end():].strip()
        tokens = re.findall(r"[a-zà-ÿ'\-]+", tail)
        collected: list[str] = []
        for token in tokens[:4]:
            if token in _NAME_STOPWORDS:
                break
            if len(token) < 2:
                break
            collected.append(token)
        if collected:
            return " ".join(collected)
    return None


def _normalize_for_name(value: str) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("’", "'").replace("‘", "'").replace("´", "'")
    return text.lower()


def _normalize_name(value: str) -> str:
    return _normalize_for_name(value).strip()


def _employee_name_matches(item: dict[str, Any], normalized_query: str) -> bool:
    if not normalized_query:
        return False
    query_tokens = [tok for tok in normalized_query.split() if tok]
    if not query_tokens:
        return False
    candidate_fields = (
        item.get("employee"),
        item.get("employe"),
        item.get("user"),
        item.get("fullName"),
        item.get("nom"),
        item.get("nomComplet"),
        # Backend sometimes splits first/last name.
        " ".join(filter(None, (str(item.get("prenom") or ""), str(item.get("nom") or "")))).strip() or None,
    )
    for field in candidate_fields:
        if not field:
            continue
        haystack = _normalize_for_name(str(field))
        if all(token in haystack for token in query_tokens):
            return True
    return False


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
