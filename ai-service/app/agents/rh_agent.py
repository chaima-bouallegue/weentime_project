from __future__ import annotations

import re
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
    ("DOCUMENT", "document.rh_workload", "Documents"),
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
        hybrid_response = await self._handle_hybrid_intent(intent, confidence, message, context)
        if hybrid_response is not None:
            return hybrid_response

        if intent == "rh.create_user_unavailable":
            return AgentResponse(
                type="answer",
                text=(
                    "La creation de comptes utilisateurs est reservee aux administrateurs. "
                    "En tant que RH, vous pouvez : affecter un employe a une equipe ou un departement, "
                    "designer un manager, generer un document RH, ou consulter le backlog RH."
                ),
                intent=intent,
                confidence=confidence,
                actionResult={
                    "kind": "rh_capability_unavailable",
                    "agent": "RHAgent",
                    "capability": "create_user",
                    "allowedRoles": ["ADMIN"],
                    "alternatives": [
                        "affecter un employe a une equipe",
                        "affecter un employe a un departement",
                        "designer un manager",
                        "generer un document RH",
                        "consulter le backlog RH",
                    ],
                },
            )
        if intent == "rh.organisation_assignment_unavailable":
            return AgentResponse(
                type="answer",
                text=(
                    "L'affectation d'un utilisateur a une equipe, un departement ou un manager "
                    "n'est pas encore connectee a un outil RH verifie. Je peux lister les equipes "
                    "ou departements, ou creer une structure si les informations sont completes."
                ),
                intent=intent,
                confidence=confidence,
                actionResult={
                    "kind": "capability_unavailable",
                    "agent": "RHAgent",
                    "capability": "rh.organisation_assignment",
                    "alternatives": [
                        "liste les equipes",
                        "liste les departements",
                        "creer equipe avec departement",
                    ],
                },
            )
        if intent == "rh.stats":
            return await self.read_response(
                tool_name="rh.get_stats",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Les statistiques RH sont disponibles.",
                confidence=confidence,
            )
        if intent == "rh.document_workload":
            return await self.read_response(
                tool_name="document.rh_workload",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici la charge documentaire RH.",
                confidence=confidence,
            )
        if intent == "rh.presence_today":
            return await self.read_response(
                tool_name="get_team_presence",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici la presence entreprise aujourd'hui.",
                confidence=confidence,
            )
        if intent == "rh.all_requests":
            return await self._read_rh_requests(context, intent=intent, confidence=confidence)

        if intent == "rh.document_generate":
            source_text = _source_text(message, context)
            payload = extract_payload(source_text, "REQUEST_DOCUMENT", context)
            document_type = payload.get("document_type") or _infer_document_type(source_text)
            if not document_type:
                return AgentResponse(
                    type="ask",
                    text="Quel type de document RH souhaitez-vous generer ?",
                    intent=intent,
                    confidence=confidence,
                )
            employee = _extract_employee_name(source_text)
            if not employee:
                return AgentResponse(
                    type="ask",
                    text=(
                        "Pour quel employe souhaitez-vous generer ce document RH ? "
                        "Indiquez au moins le prenom et le nom."
                    ),
                    intent=intent,
                    confidence=confidence,
                    actionResult={
                        "kind": "slot_filling",
                        "agent": "RHAgent",
                        "missing": ["employee"],
                        "toolName": "document.rh_generate",
                        "documentType": document_type,
                    },
                )
            first_name, last_name = employee
            label = _document_type_label(document_type)
            return self.confirmation_response(
                context=context,
                tool_name="document.rh_generate",
                tool_input={
                    "type": document_type,
                    "label": label,
                    "employe_prenom": first_name,
                    "employe_nom": last_name,
                },
                intent=intent,
                text=f"Confirmez-vous la generation du document RH '{label}' pour {first_name} {last_name} ?",
                confidence=confidence,
                action_result={
                    "kind": "approval_confirmation",
                    "agent": "RHAgent",
                    "toolName": "document.rh_generate",
                    "documentType": document_type,
                    "employee": {"prenom": first_name, "nom": last_name},
                },
            )

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
        hybrid_intent = _metadata_hybrid_intent(context)
        if hybrid_intent:
            confidence = _metadata_hybrid_confidence(context) or 0.9
            return _map_hybrid_intent(hybrid_intent), confidence

        text = (message or "").lower()
        # Capability question: "can RH create a platform user?" — answered locally
        # with a deterministic capability response. RH cannot create users; that's
        # an ADMIN-only operation. Without this branch, the message falls through
        # to the legacy/LLM path and the guard rejects it as unsafe_response.
        if _wants_user_creation(text):
            return "rh.create_user_unavailable", 0.92
        if _wants_organisation_assignment(text):
            return "rh.organisation_assignment_unavailable", 0.9
        # Presence aujourd'hui — RH-scoped company presence. We accept the
        # prompt with or without the "rh" keyword because the message comes
        # from the RH chatbot widget (role is already known).
        if has_any(text, ("presence aujourd", "présence aujourd", "presence today", "presence d'aujourd", "qui n a pas pointe", "qui n'a pas pointe", "qui na pas pointe", "retards aujourd", "retard aujourd", "late today")):
            return "rh.presence_today", 0.95
        # Document workload — explicit RH dashboard prompt.
        if (("document" in text or "documents" in text) and has_any(text, ("workload", "charge", "backlog", "en attente"))):
            return "rh.document_workload", 0.92
        if _wants_rh_document_generation(text):
            return "rh.document_generate", 0.88
        if not has_any(text, ("rh", "stats", "statistiques", "kpi", "toutes les demandes", "demandes en attente", "process", "traiter", "approuve", "approve", "valide", "refuse", "reject", "rejette", "validation", "pending", "backlog", "absenteisme", "absenteeism", "document", "attestation")):
            return None, 0.0
        if has_any(text, ("stats", "statistiques", "kpi", "absenteisme", "absenteeism", "taux absence", "taux de presence")):
            return "rh.stats", 0.9
        # "Pending validations", "RH backlog" — backlog aggregate. Listed
        # before the generic validation branch so it stays high-confidence.
        if has_any(text, ("backlog", "pending validations", "validations en attente", "toutes les demandes", "all requests", "demandes rh", "demandes en attente", "en attente")) and not has_any(text, ("approuve", "approve", "refuse", "reject", "rejette")):
            return "rh.all_requests", 0.93
        if has_any(text, ("validation",)) and not has_any(text, ("approuve", "approve", "refuse", "reject", "rejette")):
            return "rh.all_requests", 0.84
        if has_any(text, ("process", "traiter", "approuve", "approve", "valide", "refuse", "reject", "rejette")):
            return "rh.process", 0.91
        return None, 0.0

    async def _handle_hybrid_intent(
        self,
        intent: str | None,
        confidence: float,
        message: str,
        context: CurrentUserContext,
    ) -> AgentResponse | None:
        if not intent or not _metadata_hybrid_intent(context):
            return None
        raw_intent = _metadata_hybrid_intent(context) or intent
        missing = _metadata_hybrid_missing(context)
        if raw_intent in {
            "rh.structure.employee.assign_team",
            "rh.structure.manager.assign_team",
            "rh.validation.clarify_type",
            "rh.structure.clarify_add_target",
            "rh.validation.clarify_request",
        } and missing:
            return _clarification_response(raw_intent, confidence, missing)

        if raw_intent in {"rh.schedule.list", "rh.schedule.default"}:
            return await self.read_response(
                tool_name="schedule.list",
                tool_input={},
                context=context,
                intent="rh.schedule.list",
                success_text="Voici les horaires RH disponibles.",
                confidence=confidence,
            )
        if raw_intent == "rh.schedule.create":
            return AgentResponse(
                type="ask",
                text="Quel horaire souhaitez-vous creer ? Indiquez au minimum le nom, les heures de debut/fin et les jours concernes.",
                intent=raw_intent,
                confidence=confidence,
                actionResult={"kind": "slot_filling", "missing": ["schedule_details"], "toolName": "schedule.create"},
            )
        if raw_intent == "rh.schedule.assign":
            return AgentResponse(
                type="ask",
                text="Quel horaire faut-il affecter, et a quel employe ou equipe ?",
                intent=raw_intent,
                confidence=confidence,
                actionResult={"kind": "slot_filling", "missing": ["schedule_id", "target"], "toolName": "schedule.assign"},
            )

        if raw_intent in {"rh.attendance.today", "rh.attendance.missing", "rh.attendance.absent", "rh.attendance.late"}:
            return await self.read_response(
                tool_name="get_team_presence",
                tool_input={},
                context=context,
                intent="rh.presence_today",
                success_text="Voici la presence entreprise aujourd'hui.",
                confidence=confidence,
            )
        if raw_intent in {"rh.attendance.sync", "rh.attendance.manual_fix"}:
            return _capability_response(
                raw_intent,
                "Cette action pointage RH n'est pas encore connectee a un outil ToolRegistry verifie.",
                confidence,
            )

        if raw_intent in {"rh.dashboard.backlog", "rh.leave.list", "rh.leave.pending", "rh.telework.list", "rh.telework.pending", "rh.authorization.list", "rh.authorization.urgent"}:
            return await self._read_rh_requests(context, intent="rh.all_requests", confidence=confidence)
        if raw_intent in {"rh.leave.approve", "rh.leave.reject", "rh.telework.approve", "rh.telework.reject", "rh.authorization.approve", "rh.authorization.reject"}:
            return AgentResponse(
                type="ask",
                text="Quelle demande souhaitez-vous traiter ? Donnez-moi l'identifiant ou le type de demande.",
                intent=raw_intent,
                confidence=confidence,
                actionResult={"kind": "approval_lookup", "status": "missing_identifier"},
            )

        if raw_intent in {"rh.document.list", "rh.document.urgent"}:
            return await self.read_response(
                tool_name="document.rh_workload",
                tool_input={},
                context=context,
                intent="rh.document_workload",
                success_text="Voici la charge documentaire RH.",
                confidence=confidence,
            )
        if raw_intent == "rh.document.generate":
            return None
        if raw_intent == "rh.analytics.summary":
            return await self.read_response(
                tool_name="rh.get_stats",
                tool_input={},
                context=context,
                intent="rh.stats",
                success_text="Les statistiques RH sont disponibles.",
                confidence=confidence,
            )

        if raw_intent == "rh.structure.employee.create":
            return AgentResponse(
                type="answer",
                text=(
                    "La creation de comptes utilisateurs est reservee aux administrateurs. "
                    "En tant que RH, vous pouvez gerer les affectations et consulter les structures connectees."
                ),
                intent="rh.create_user_unavailable",
                confidence=confidence,
                actionResult={
                    "kind": "rh_capability_unavailable",
                    "agent": "RHAgent",
                    "capability": "create_user",
                    "allowedRoles": ["ADMIN"],
                },
            )

        if raw_intent in {
            "rh.structure.employee.assign_team",
            "rh.structure.manager.assign_team",
            "rh.structure.manager.show",
            "rh.structure.manager.create",
            "rh.structure.manager.list",
            "rh.structure.team.members",
        }:
            return _capability_response(
                "rh.organisation_assignment",
                (
                    "L'affectation ou la consultation organisationnelle RH demandee "
                    "n'est pas encore connectee a un outil ToolRegistry verifie."
                ),
                confidence,
            )

        if raw_intent.startswith("rh.structure."):
            return _capability_response(
                raw_intent,
                "Cette action de structure RH n'est pas encore connectee a un outil ToolRegistry verifie.",
                confidence,
            )
        return None

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


def _wants_user_creation(text: str) -> bool:
    """Detect 'create / add / new user' intent across FR, EN, TN, AR.

    Conservative: requires both a create-verb AND a user-noun in the same
    message. Returns False on bare 'user' so 'liste users' / 'user details'
    fall through to other agents (admin).
    """
    if not text:
        return False
    create_verbs = (
        # FR / TN
        "creer", "cree", "ajouter", "ajoute", "nouveau", "nouvelle", "nzid", "jdid", "jdida",
        # EN
        "create", "add", "new",
    )
    user_nouns = (
        "user", "utilisateur", "compte", "account",
        "مستخدم",  # AR "user"
    )
    has_verb = any(verb in text for verb in create_verbs)
    has_user = any(noun in text for noun in user_nouns)
    return has_verb and has_user


def _choices_text(choices: list[dict[str, Any]]) -> str:
    lines = ["Plusieurs demandes correspondent. Choisissez l'identifiant exact :"]
    for index, choice in enumerate(choices, start=1):
        lines.append(f"{index}. {_request_label(choice.get('summary') or {})}")
    return "\n".join(lines)


def _source_text(message: str, context: CurrentUserContext | None) -> str:
    original = ""
    if context is not None and isinstance(context.metadata, dict):
        original = str(context.metadata.get("original_text") or "")
    if original and original != message:
        return f"{message or ''} {original}".strip()
    return message or ""


def _wants_organisation_assignment(text: str) -> bool:
    if not text:
        return False
    action = has_any(text, ("affecter", "affecte", "assign", "assigner", "changer manager", "change manager", "designer manager", "désigner manager"))
    target = has_any(text, ("user", "utilisateur", "employe", "employé", "salarie", "salarié", "manager", "equipe", "équipe", "team", "departement", "département"))
    create_structure = has_any(text, ("creer equipe", "créer equipe", "create team", "creer departement", "créer departement", "create department"))
    return action and target and not create_structure


def _metadata_hybrid_intent(context: CurrentUserContext | None) -> str | None:
    metadata = context.metadata if context is not None and isinstance(context.metadata, dict) else {}
    value = metadata.get("rh_hybrid_intent")
    return str(value).strip() if value else None


def _metadata_hybrid_confidence(context: CurrentUserContext | None) -> float | None:
    metadata = context.metadata if context is not None and isinstance(context.metadata, dict) else {}
    try:
        return float(metadata.get("rh_hybrid_confidence"))
    except (TypeError, ValueError):
        return None


def _metadata_hybrid_missing(context: CurrentUserContext | None) -> list[str]:
    metadata = context.metadata if context is not None and isinstance(context.metadata, dict) else {}
    missing = metadata.get("rh_hybrid_missing")
    if isinstance(missing, list):
        return [str(item) for item in missing]
    return []


def _map_hybrid_intent(intent: str) -> str:
    if intent == "rh.document.generate":
        return "rh.document_generate"
    if intent == "rh.analytics.summary":
        return "rh.stats"
    if intent == "rh.dashboard.backlog":
        return "rh.all_requests"
    return intent


def _clarification_response(intent: str, confidence: float, missing: list[str]) -> AgentResponse:
    if intent == "rh.validation.clarify_type":
        text = "Souhaitez-vous valider un conge, un teletravail ou une autorisation ?"
    elif intent == "rh.structure.clarify_add_target":
        text = "Voulez-vous ajouter cette personne comme employe, manager ou equipe ?"
    elif intent == "rh.validation.clarify_request":
        text = "Quelle demande souhaitez-vous refuser ? Donnez-moi l'identifiant ou le type de demande."
    elif "assign_team" in intent:
        text = "Quel employe souhaitez-vous affecter et dans quelle equipe ?"
    else:
        text = "Pouvez-vous preciser les informations manquantes ?"
    return AgentResponse(
        type="ask",
        text=text,
        intent=intent,
        confidence=confidence,
        actionResult={"kind": "slot_filling", "missing": missing, "intent": intent},
    )


def _capability_response(intent: str, text: str, confidence: float) -> AgentResponse:
    return AgentResponse(
        type="answer",
        text=text,
        intent=f"{intent}.unavailable" if not intent.endswith(".unavailable") else intent,
        confidence=confidence,
        actionResult={"kind": "capability_unavailable", "capability": intent},
    )


def _wants_rh_document_generation(text: str) -> bool:
    if not text:
        return False
    mentions_doc = has_any(text, ("document", "attestation", "certificat", "bulletin", "fiche", "certificate"))
    mentions_rh_create = has_any(text, ("creer", "créer", "cree", "genere", "génère", "generer", "générer", "produire", "create", "generate"))
    # "document attestation de travail" is a common RH prompt that means
    # generate/help prepare a RH document, not create an employee request.
    return mentions_doc and (mentions_rh_create or has_any(text, ("document attestation", "attestation travail", "attestation de travail")))


def _infer_document_type(message: str) -> str | None:
    text = (message or "").lower()
    if has_any(text, ("bulletin", "paie", "payslip", "pay slip", "fiche de paie")):
        return "BULLETIN_PAIE"
    if has_any(text, ("salaire", "salary certificate", "attestation salaire")):
        return "ATTESTATION_SALAIRE"
    if has_any(text, ("attestation", "certificat", "certificate", "travail", "work certificate")):
        return "ATTESTATION_TRAVAIL"
    return None


def _document_type_label(document_type: Any) -> str:
    labels = {
        "ATTESTATION_TRAVAIL": "Attestation de travail",
        "BULLETIN_PAIE": "Bulletin de paie",
        "ATTESTATION_SALAIRE": "Attestation de salaire",
    }
    return labels.get(str(document_type or "").upper(), str(document_type or "Document RH"))


def _extract_employee_name(message: str) -> tuple[str, str] | None:
    text = (message or "").strip()
    if not text:
        return None
    match = re.search(r"\b(?:pour|for)\s+([A-ZÀ-ÖØ-Þ][\wÀ-ÿ'-]+(?:\s+[A-ZÀ-ÖØ-Þ][\wÀ-ÿ'-]+){1,3})", text)
    if not match:
        return None
    tokens = [token.strip(" ,.;:") for token in match.group(1).split() if token.strip(" ,.;:")]
    if len(tokens) < 2:
        return None
    return tokens[0], " ".join(tokens[1:])
