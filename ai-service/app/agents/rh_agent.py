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
            employee_query = _extract_employee_query(source_text)
            if not employee_query:
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
            label = _document_type_label(document_type)
            return await self._resolve_document_generation(
                document_type=document_type,
                label=label,
                employee_query=employee_query,
                context=context,
                intent=intent,
                confidence=confidence,
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
            source_text = _source_text(message, context)
            schedule_payload = _extract_schedule_create_payload(source_text)
            if schedule_payload is not None:
                label = schedule_payload.get("nom") or "Horaire WeenTime"
                return self.confirmation_response(
                    context=context,
                    tool_name="rh.schedule.create",
                    tool_input=schedule_payload,
                    intent=raw_intent,
                    text=f"Confirmez-vous la creation de l'horaire '{label}' ?",
                    confidence=confidence,
                    action_result={
                        "kind": "approval_confirmation",
                        "agent": "RHAgent",
                        "toolName": "rh.schedule.create",
                    },
                )
            return AgentResponse(
                type="ask",
                text="Quel horaire souhaitez-vous creer ? Indiquez au minimum le nom, les heures de debut/fin et les jours concernes.",
                intent=raw_intent,
                confidence=confidence,
                actionResult={"kind": "slot_filling", "missing": ["schedule_details"], "toolName": "schedule.create"},
            )
        if raw_intent == "rh.schedule.assign":
            source_text = _source_text(message, context)
            assign_payload = _extract_schedule_assign_payload(source_text)
            if assign_payload is not None:
                return self.confirmation_response(
                    context=context,
                    tool_name="rh.schedule.assign",
                    tool_input=assign_payload,
                    intent=raw_intent,
                    text=(
                        f"Confirmez-vous l'affectation de l'horaire {assign_payload['horaire_id']} "
                        f"a {assign_payload['cible_type']} {assign_payload['cible_id']} ?"
                    ),
                    confidence=confidence,
                    action_result={
                        "kind": "approval_confirmation",
                        "agent": "RHAgent",
                        "toolName": "rh.schedule.assign",
                    },
                )
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
            return await self._resolve_named_decision(raw_intent, message, context, confidence)

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
            "rh.structure.manager.show",
            "rh.structure.manager.create",
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

    async def _resolve_document_generation(
        self,
        *,
        document_type: str,
        label: str,
        employee_query: str,
        context: CurrentUserContext,
        intent: str,
        confidence: float,
    ) -> AgentResponse:
        matches = await self._search_employees(employee_query, context)
        if not matches:
            return AgentResponse(
                type="answer",
                text=f"Je n'ai trouve aucun employe correspondant a '{employee_query}'.",
                intent=intent,
                confidence=confidence,
                toolCalls=[ToolCallRecord(name="organisation.search_employee", arguments={"query": employee_query}, status="success")],
                actionResult={"kind": "no_data", "entity": "employee", "query": employee_query},
            )
        exact_matches = [item for item in matches if _name_matches(item, employee_query)]
        selected = exact_matches[0] if len(exact_matches) == 1 else (matches[0] if len(matches) == 1 else None)
        if selected is None:
            return AgentResponse(
                type="ask",
                text=_employee_choices_text(matches, "Plusieurs employes correspondent. Lequel faut-il utiliser ?"),
                intent=intent,
                confidence=confidence,
                toolCalls=[ToolCallRecord(name="organisation.search_employee", arguments={"query": employee_query}, status="success")],
                actionResult={
                    "kind": "slot_filling",
                    "missing": ["employee"],
                    "toolName": "rh.document.generate",
                    "documentType": document_type,
                    "employeeQuery": employee_query,
                    "choices": [_employee_summary(item) for item in matches],
                },
            )
        tool_input = _document_tool_input(document_type, label, selected)
        display_name = _employee_display_name(selected)
        return self.confirmation_response(
            context=context,
            tool_name="rh.document.generate",
            tool_input=tool_input,
            intent=intent,
            text=f"Je vais generer {label} pour {display_name}. Confirmez-vous ?",
            confidence=confidence,
            action_result={
                "kind": "approval_confirmation",
                "agent": "RHAgent",
                "toolName": "rh.document.generate",
                "documentType": document_type,
                "employee": _employee_summary(selected),
            },
        )

    async def _resolve_named_decision(
        self,
        raw_intent: str,
        message: str,
        context: CurrentUserContext,
        confidence: float,
    ) -> AgentResponse:
        request_type, pending_tool, approve_tool, reject_tool, label = _decision_tooling(raw_intent)
        decision = "APPROVE" if raw_intent.endswith(".approve") else "REJECT"
        tool_name = approve_tool if decision == "APPROVE" else reject_tool
        source_text = _source_text(message, context)
        request_id = _extract_id_after(source_text, ("demande", "request", "id"))
        if request_id is not None:
            return self.confirmation_response(
                context=context,
                tool_name=tool_name,
                tool_input=_decision_tool_input(tool_name, request_id, decision, source_text),
                intent=raw_intent,
                text=f"Je vais {'valider' if decision == 'APPROVE' else 'refuser'} la demande {request_id}. Confirmez-vous ?",
                confidence=confidence,
                action_result={"kind": "approval_confirmation", "agent": "RHAgent", "toolName": tool_name, "requestId": request_id},
            )

        employee_query = _extract_employee_query(source_text) or _metadata_employee(context)
        if not employee_query:
            return AgentResponse(
                type="ask",
                text=f"Quel employe est concerne par cette demande de {label} ?",
                intent=raw_intent,
                confidence=confidence,
                actionResult={"kind": "approval_lookup", "status": "missing_employee", "requestType": request_type},
            )
        date_filter = _extract_requested_date(source_text)
        result = await self.executor.execute(pending_tool, {}, context)
        read_result = get_read_result(result.data)
        items = read_result.get("items") if result.success and isinstance(read_result, dict) and isinstance(read_result.get("items"), list) else []
        matches = [
            item for item in items
            if isinstance(item, dict)
            and _request_employee_matches(item, employee_query)
            and (date_filter is None or _request_date_matches(item, date_filter))
            and _request_is_pending(item)
        ]
        call = ToolCallRecord(name=pending_tool, arguments={}, status="success" if result.success else "failed")
        if not result.success:
            return AgentResponse(
                type="error",
                text=result.error_message or f"Je n'ai pas pu consulter les demandes de {label}.",
                intent=raw_intent,
                confidence=confidence,
                toolCalls=[call],
                actionResult={"kind": "approval_lookup", "status": "failed", "requestType": request_type},
            )
        if not matches:
            suffix = f" pour le {date_filter}" if date_filter else ""
            return AgentResponse(
                type="answer",
                text=f"Aucune demande de {label} en attente trouvee pour {employee_query}{suffix}.",
                intent=raw_intent,
                confidence=confidence,
                toolCalls=[call],
                actionResult={
                    "kind": "no_data",
                    "entity": request_type.lower(),
                    "employee": employee_query,
                    "date": date_filter,
                    "toolName": pending_tool,
                },
            )
        if len(matches) > 1:
            return AgentResponse(
                type="ask",
                text=_request_choices_text(matches),
                intent=raw_intent,
                confidence=confidence,
                toolCalls=[call],
                actionResult={
                    "kind": "approval_lookup",
                    "status": "ambiguous",
                    "requestType": request_type,
                    "employee": employee_query,
                    "choices": [_request_summary(item, request_type) for item in matches],
                },
            )
        request = matches[0]
        resolved_id = _request_id(request)
        if resolved_id is None:
            return AgentResponse(
                type="error",
                text="Je n'ai pas pu identifier la demande backend a traiter.",
                intent=raw_intent,
                confidence=confidence,
                toolCalls=[call],
                actionResult={"kind": "approval_lookup", "status": "missing_identifier", "request": request},
            )
        summary = _request_summary(request, request_type)
        action = "valider" if decision == "APPROVE" else "refuser"
        return self.confirmation_response(
            context=context,
            tool_name=tool_name,
            tool_input=_decision_tool_input(tool_name, resolved_id, decision, source_text),
            intent=raw_intent,
            text=f"Je vais {action} la demande de {label} de {_request_label(summary)}. Confirmez-vous ?",
            confidence=confidence,
            action_result={
                "kind": "approval_confirmation",
                "agent": "RHAgent",
                "toolName": tool_name,
                "summary": summary,
                "request": request,
            },
        )

    async def _search_employees(self, query: str, context: CurrentUserContext) -> list[dict[str, Any]]:
        result = await self.executor.execute("organisation.search_employee", {"query": query}, context)
        read_result = get_read_result(result.data)
        items = read_result.get("items") if result.success and isinstance(read_result, dict) and isinstance(read_result.get("items"), list) else []
        return [item for item in items if isinstance(item, dict)]

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


def _request_id(item: dict[str, Any]) -> int | None:
    for key in ("id", "requestId", "request_id", "demandeId"):
        try:
            value = item.get(key)
            if value is not None:
                return int(value)
        except (TypeError, ValueError):
            continue
    return None


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


def _decision_tooling(intent: str) -> tuple[str, str, str, str, str]:
    if intent.startswith("rh.leave."):
        return "CONGE", "rh.leave.pending", "rh.leave.approve", "rh.leave.reject", "conge"
    if intent.startswith("rh.telework."):
        return "TELETRAVAIL", "rh.telework.pending", "rh.telework.approve", "rh.telework.reject", "teletravail"
    return "AUTORISATION", "rh.authorization.pending", "rh.authorization.approve", "rh.authorization.reject", "autorisation"


def _decision_tool_input(tool_name: str, request_id: int, decision: str, source_text: str) -> dict[str, Any]:
    payload: dict[str, Any] = {"request_id": int(request_id)}
    comment = _extract_reason_comment(source_text)
    if tool_name in {"leave.rh_decide", "telework.rh_decide", "authorization.rh_decide"}:
        payload["decision"] = decision
    if comment:
        if tool_name.endswith(".reject") or decision == "REJECT":
            payload["comment"] = comment
        else:
            payload["comment"] = comment
    return payload


def _extract_reason_comment(message: str) -> str | None:
    text = message or ""
    match = re.search(r"\b(?:motif|raison|reason|avec motif)\s+(.{2,160})$", text, re.IGNORECASE)
    if match:
        return match.group(1).strip(" .")
    return None


def _metadata_employee(context: CurrentUserContext | None) -> str | None:
    metadata = context.metadata if context is not None and isinstance(context.metadata, dict) else {}
    entities = metadata.get("rh_hybrid_entities")
    if isinstance(entities, dict):
        value = entities.get("employee")
        if value:
            return str(value).strip()
    return None


def _request_employee_matches(item: dict[str, Any], query: str) -> bool:
    needle = _lookup(query)
    if not needle:
        return False
    haystack_values: list[Any] = [
        item.get("employee"),
        item.get("employe"),
        item.get("fullName"),
        item.get("nomComplet"),
        item.get("utilisateurNom"),
        item.get("userFullName"),
        item.get("nom"),
    ]
    for nested_key in ("user", "utilisateur", "employeDto", "employeeDto", "demandeur"):
        nested = item.get(nested_key)
        if isinstance(nested, dict):
            haystack_values.extend([nested.get("fullName"), nested.get("prenom"), nested.get("nom"), nested.get("email")])
    haystack = _lookup(" ".join(str(value or "") for value in haystack_values))
    return needle in haystack or any(part and part in haystack for part in needle.split())


def _request_date_matches(item: dict[str, Any], date_filter: str) -> bool:
    wanted = str(date_filter or "").strip()
    if not wanted:
        return True
    for key in ("date", "dateDebut", "startDate", "dateAutorisation", "date_demande", "dateDemande"):
        value = str(item.get(key) or "")
        if value.startswith(wanted):
            return True
    return False


def _request_is_pending(item: dict[str, Any]) -> bool:
    status = str(item.get("statut") or item.get("status") or "").upper()
    return not status or "ATTENTE" in status or "PENDING" in status


def _extract_requested_date(message: str) -> str | None:
    text = (message or "").lower()
    iso = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
    if iso:
        return iso.group(1)
    day_month = re.search(r"\b(\d{1,2})\s+(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\b", text)
    if day_month:
        month_map = {
            "janvier": 1, "fevrier": 2, "février": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
            "juillet": 7, "aout": 8, "août": 8, "septembre": 9, "octobre": 10, "novembre": 11,
            "decembre": 12, "décembre": 12,
        }
        day = int(day_month.group(1))
        month = month_map[day_month.group(2)]
        year = 2026
        return f"{year:04d}-{month:02d}-{day:02d}"
    if "demain" in text or "tomorrow" in text:
        return "2026-05-20"
    if "aujourd" in text or "today" in text or "lyoum" in text:
        return "2026-05-19"
    return None


def _request_choices_text(items: list[dict[str, Any]]) -> str:
    lines = ["Plusieurs demandes correspondent. Choisissez l'identifiant exact :"]
    for item in items[:8]:
        lines.append(f"- {_request_label(_request_summary(item))}")
    return "\n".join(lines)


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
    return original or message or ""


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


def _extract_employee_query(message: str) -> str | None:
    text = (message or "").strip()
    if not text:
        return None
    patterns = (
        r"\b(?:pour|for|du|de|d'|لـ|ل)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ'-]+(?:\s+[A-Za-zÀ-ÿ][\wÀ-ÿ'-]+){0,3})",
        r"\b(?:conge|congé|teletravail|autorisation|attestation|document|leave|telework)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ'-]+(?:\s+[A-Za-zÀ-ÿ][\wÀ-ÿ'-]+){0,3})",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            candidate = _clean_employee_candidate(match.group(1))
            if candidate:
                return candidate
    tokens = [token.strip(" ,.;:") for token in text.split() if token.strip(" ,.;:")]
    kept: list[str] = []
    for token in reversed(tokens):
        lowered = token.lower()
        if lowered in {
            "attestation", "document", "genere", "generi", "génère", "générer", "generer",
            "valide", "approuve", "approve", "refuse", "reject", "teletravail", "teletravaille",
            "conge", "congé", "autorisation", "du", "de", "pour", "for",
        }:
            break
        if re.match(r"^[A-Za-zÀ-ÿ][\wÀ-ÿ'-]*$", token):
            kept.insert(0, token)
        if len(kept) >= 3:
            break
    candidate = _clean_employee_candidate(" ".join(kept))
    return candidate or None


def _clean_employee_candidate(value: str) -> str:
    words = []
    for token in (value or "").strip().split():
        lowered = token.lower().strip(" ,.;:")
        if lowered in {"demain", "today", "aujourd", "hui", "lyoum", "avec", "motif", "du", "de", "genere", "generi", "génère", "générer", "generer", "travail", "work"}:
            break
        words.append(token.strip(" ,.;:"))
    return " ".join(words).strip()


def _employee_display_name(item: dict[str, Any]) -> str:
    full = str(item.get("fullName") or item.get("nomComplet") or "").strip()
    if full:
        return full
    first = str(item.get("prenom") or item.get("firstName") or "").strip()
    last = str(item.get("nom") or item.get("lastName") or "").strip()
    email = str(item.get("email") or "").strip()
    return " ".join(part for part in (first, last) if part).strip() or email or str(item.get("id") or "employe")


def _employee_summary(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("id"),
        "name": _employee_display_name(item),
        "email": item.get("email"),
        "poste": item.get("poste") or item.get("position"),
        "departement": item.get("departement") or item.get("department") or item.get("departementNom"),
    }


def _employee_choices_text(items: list[dict[str, Any]], heading: str) -> str:
    lines = [heading]
    for item in items[:8]:
        summary = _employee_summary(item)
        suffix = f" ({summary['email']})" if summary.get("email") else ""
        lines.append(f"- {summary['name']}{suffix}")
    return "\n".join(lines)


def _document_tool_input(document_type: str, label: str, employee: dict[str, Any]) -> dict[str, Any]:
    first = str(employee.get("prenom") or employee.get("firstName") or "").strip()
    last = str(employee.get("nom") or employee.get("lastName") or "").strip()
    if not first or not last:
        parts = _employee_display_name(employee).split()
        first = first or (parts[0] if parts else "")
        last = last or (" ".join(parts[1:]) if len(parts) > 1 else parts[0] if parts else "")
    return {
        "type": document_type,
        "label": label,
        "employe_prenom": first,
        "employe_nom": last,
        "employe_poste": employee.get("poste") or employee.get("position"),
        "employe_departement": employee.get("departement") or employee.get("department") or employee.get("departementNom"),
        "date_entree": employee.get("dateEntree") or employee.get("hireDate"),
    }


def _name_matches(item: dict[str, Any], query: str) -> bool:
    return _lookup(_employee_display_name(item)) == _lookup(query)


def _lookup(value: Any) -> str:
    text = str(value or "").strip().lower()
    replacements = {"é": "e", "è": "e", "ê": "e", "à": "a", "ù": "u", "ç": "c", "î": "i", "ï": "i"}
    for source, target in replacements.items():
        text = text.replace(source, target)
    return " ".join(text.replace("-", " ").replace("_", " ").split())


def _extract_schedule_create_payload(message: str) -> dict[str, Any] | None:
    text = message or ""
    normalized = text.lower()
    hours = _extract_hours(normalized)
    name = _extract_schedule_name(text, hours)
    if not name and hours is None:
        return None
    payload: dict[str, Any] = {
        "nom": name or f"Horaire {hours:g}h",
        "type": "FIXE",
        "statut": "ACTIF",
        "is_defaut": False,
    }
    if hours is not None:
        payload["heures_hebdo"] = hours
    return payload


def _extract_schedule_assign_payload(message: str) -> dict[str, Any] | None:
    text = message or ""
    horaire_id = _extract_id_after(text, ("horaire", "schedule", "planning"))
    cible_type = "UTILISATEUR"
    cible_id = _extract_id_after(text, ("employe", "employé", "employee", "user", "utilisateur"))
    team_id = _extract_id_after(text, ("equipe", "équipe", "team"))
    if team_id is not None:
        cible_type = "EQUIPE"
        cible_id = team_id
    enterprise_id = _extract_id_after(text, ("entreprise", "company", "tenant"))
    if enterprise_id is not None:
        cible_type = "ENTREPRISE"
        cible_id = enterprise_id
    if horaire_id is None or cible_id is None:
        return None
    payload: dict[str, Any] = {
        "horaire_id": horaire_id,
        "cible_type": cible_type,
        "cible_id": cible_id,
    }
    date_value = _extract_iso_date(text)
    if date_value:
        payload["date_debut"] = date_value
    return payload


def _extract_hours(text: str) -> float | None:
    match = re.search(r"(?<!\d)(\d{1,3})(?:[,.](\d{1,2}))?\s*h\b", text)
    if not match:
        return None
    value = f"{match.group(1)}.{match.group(2) or '0'}"
    try:
        number = float(value)
    except ValueError:
        return None
    return number if 1 <= number <= 168 else None


def _extract_schedule_name(text: str, hours: float | None) -> str | None:
    quoted = re.search(r"""["'“”«»]([^"'“”«»]{1,80})["'“”«»]""", text)
    if quoted:
        return quoted.group(1).strip()
    normalized = text.lower()
    match = re.search(r"\b(?:horaire|schedule|planning)\s+([A-Za-zÀ-ÿ0-9][\wÀ-ÿ0-9'-]{1,80})", text, re.IGNORECASE)
    if match:
        candidate = match.group(1).strip()
        if not re.fullmatch(r"\d+\s*h?", candidate.lower()):
            return candidate
    if hours is not None:
        return f"Horaire {hours:g}h"
    if "default" in normalized or "defaut" in normalized or "défaut" in normalized:
        return "Horaire par defaut"
    return None


def _extract_id_after(message: str, anchors: tuple[str, ...]) -> int | None:
    text = (message or "").lower()
    for anchor in anchors:
        match = re.search(rf"{re.escape(anchor.lower())}\s*(?:#|id\s*)?(\d{{1,7}})", text)
        if match:
            try:
                return int(match.group(1))
            except ValueError:
                continue
    return None


def _extract_iso_date(message: str) -> str | None:
    match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", message or "")
    return match.group(1) if match else None
