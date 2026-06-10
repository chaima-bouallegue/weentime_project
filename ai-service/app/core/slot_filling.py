from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from app.agents.authorization_agent import _infer_authorization_type, _infer_reason
from app.agents.document_request_flow import (
    document_label,
    infer_document_type,
    is_payslip_type,
    localized_confirmation_text,
    localized_document_type_question,
    localized_month_question,
    normalize_document_type,
    parse_month_reference,
)
from app.agents.leave_planner import LeaveRiskAnalyzer
from app.agents.organisation_agent import (
    _DEPT_TERMS,
    _TEAM_TERMS,
    _extract_code_interne,
    _extract_int_after,
    _extract_named_target,
)
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from core.entity_extractor import extract_entities

from .conversation_state import ConversationStateStore, PendingConversationFlow


# Sentinel for flows that do NOT use the shared `core.entity_extractor` schema.
# Org-create flows do their own field extraction via organisation_agent helpers,
# because dates/times/leave-types are irrelevant for "create team / department".
_NO_ENTITY_INTENT = "_NO_ENTITY"

FLOW_CONFIG: dict[str, dict[str, str]] = {
    "leave.create": {"agent": "leave", "entity_intent": "CREATE_LEAVE", "tool": "leave.create_request"},
    "authorization.create": {
        "agent": "authorization",
        "entity_intent": "CREATE_AUTORISATION",
        "tool": "authorization.create_request",
    },
    # Without this entry, telework follow-ups like "pour demain" after
    # "je veux un teletravail" lose the pending intent and hit the unsafe
    # fallback. The telework agent itself replies with type=ask
    # intent=telework.create, so capture_pending_flow can persist the flow.
    "telework.create": {
        "agent": "telework",
        "entity_intent": "CREATE_TELEWORK",
        "tool": "telework.create_request",
    },
    "document.create": {
        "agent": "document",
        "entity_intent": "REQUEST_DOCUMENT",
        "tool": "document.create_request",
    },
    "rh.document_generate": {
        "agent": "rh",
        "entity_intent": _NO_ENTITY_INTENT,
        "tool": "rh.document.generate",
    },
    "organisation.create_team": {
        "agent": "organisation",
        "entity_intent": _NO_ENTITY_INTENT,
        "tool": "organisation.create_team",
    },
    "rh.structure.team.create": {
        "agent": "organisation",
        "entity_intent": _NO_ENTITY_INTENT,
        "tool": "rh.structure.team.create",
    },
    "organisation.create_department": {
        "agent": "organisation",
        "entity_intent": _NO_ENTITY_INTENT,
        "tool": "organisation.create_department",
    },
    "rh.structure.department.create": {
        "agent": "organisation",
        "entity_intent": _NO_ENTITY_INTENT,
        "tool": "rh.structure.department.create",
    },
}

FIELD_LABELS = {
    "date": "date",
    "time": "horaire",
    "start_time": "heure de debut",
    "type": "type",
    "reason": "motif",
    "name": "nom",
    "departement_id": "departement",
    "code_interne": "code interne",
}


async def continue_pending_flow(
    *,
    message: str,
    context: CurrentUserContext,
    store: ConversationStateStore,
    executor: ToolExecutor,
    confirmation_store: ConfirmationStore,
    session_id: str | None,
) -> AgentResponse | None:
    flow = store.get(context, session_id)
    if not flow:
        return None
    if _is_cancel_message(message):
        store.clear(context, session_id)
        return AgentResponse(
            type="answer",
            text="Demande en cours annulee.",
            intent=f"{flow.intent}.cancelled",
            confidence=1.0,
            actionResult=_slot_result(flow, status="cancelled"),
        )
    if _message_escapes_flow(message, flow.intent):
        store.clear(context, session_id)
        return None

    _merge_flow_fields(flow, message, context)
    missing = _missing_fields(flow)
    if missing:
        flow.missing_fields = missing
        flow.last_question = _question_for_missing(flow.intent, missing[0], flow)
        store.save(context, flow, session_id)
        return AgentResponse(
            type="ask",
            text=flow.last_question,
            intent=flow.intent,
            confidence=0.92,
            actionResult=_slot_result(flow),
        )

    if flow.intent == "rh.document_generate":
        response = await _continue_rh_document_generation(flow, context, executor, confirmation_store)
        if response.type == "ask":
            flow.missing_fields = ["employee"]
            flow.last_question = response.text
            store.save(context, flow, session_id)
        else:
            store.clear(context, session_id)
        return response

    tool_name = FLOW_CONFIG[flow.intent]["tool"]
    tool_input = _tool_input(flow)
    analysis: dict[str, Any] | None = None
    if flow.intent == "leave.create":
        analysis = await LeaveRiskAnalyzer(executor).analyze(tool_input, context)
    record = confirmation_store.create(context, tool_name, tool_input)
    store.clear(context, session_id)
    text = _confirmation_text(flow.intent, tool_input, analysis, language=flow.language)
    return AgentResponse(
        type="confirm_action",
        text=text,
        intent=flow.intent,
        confidence=0.94,
        requiresConfirmation=True,
        confirmationId=record.confirmation_id,
        toolCalls=[ToolCallRecord(name=tool_name, arguments=tool_input, status="pending_confirmation")],
        actionResult=_confirmation_result(flow, tool_input, analysis),
    )


def capture_pending_flow(
    *,
    message: str,
    response: AgentResponse,
    context: CurrentUserContext,
    store: ConversationStateStore,
    session_id: str | None,
) -> AgentResponse:
    if response.type != "ask" or response.intent not in FLOW_CONFIG:
        return response
    flow = PendingConversationFlow(
        intent=response.intent,
        agent=FLOW_CONFIG[response.intent]["agent"],
        last_question=response.text,
        language=context.language,
        role=context.role,
        current_page=str(context.metadata.get("current_page") or "global") if isinstance(context.metadata, dict) else "global",
        last_action=response.intent,
    )
    _merge_flow_fields(flow, message, context)
    flow.missing_fields = _missing_fields(flow)
    store.save(context, flow, session_id)
    existing = response.actionResult or {}
    response.actionResult = {
        **existing,
        **_slot_result(flow),
    }
    return response


def _merge_flow_fields(flow: PendingConversationFlow, message: str, context: CurrentUserContext) -> None:
    config = FLOW_CONFIG[flow.intent]
    fields = flow.collected_fields
    original = message.strip()
    # Org-create flows skip the shared entity extractor — they have their own
    # extractors for `nom`, `departement_id`, `code_interne` and would only get
    # noise (dates, leave types) from the shared one.
    if config["entity_intent"] == _NO_ENTITY_INTENT:
        if flow.intent in {"organisation.create_team", "rh.structure.team.create"}:
            _merge_team_fields(fields, original)
        elif flow.intent in {"organisation.create_department", "rh.structure.department.create"}:
            _merge_department_fields(fields, original)
        elif flow.intent == "rh.document_generate":
            _merge_rh_document_generation_fields(fields, original)
        return
    payload = {
        key: value
        for key, value in extract_entities(message, intent=config["entity_intent"], role=context.role, pending_intent=config["entity_intent"]).items()
        if value not in (None, "", [], {})
    }
    if flow.intent == "leave.create":
        _merge_leave_fields(fields, payload, original)
    elif flow.intent == "authorization.create":
        _merge_authorization_fields(fields, payload, original)
    elif flow.intent == "telework.create":
        _merge_telework_fields(fields, payload, original)
    elif flow.intent == "document.create":
        _merge_document_fields(fields, payload, original, context)
    elif flow.intent == "rh.document_generate":
        _merge_rh_document_generation_fields(fields, original)


def _merge_team_fields(fields: dict[str, Any], original: str) -> None:
    fields["raw_last_message"] = original
    if not fields.get("name"):
        name = _extract_named_target(original, _TEAM_TERMS)
        if name:
            fields["name"] = name
    if not fields.get("departement_id"):
        dept = _extract_int_after(original, ("departement", "department", "dept", "قسم"))
        if dept:
            fields["departement_id"] = int(dept)
    fields.setdefault("est_active", True)


def _merge_department_fields(fields: dict[str, Any], original: str) -> None:
    fields["raw_last_message"] = original
    if not fields.get("name"):
        name = _extract_named_target(original, _DEPT_TERMS)
        if name:
            fields["name"] = name
    if not fields.get("code_interne"):
        code = _extract_code_interne(original)
        if code:
            fields["code_interne"] = code


def _merge_leave_fields(fields: dict[str, Any], payload: dict[str, Any], original: str) -> None:
    fields["raw_last_message"] = original
    had_leave_type = bool(fields.get("leave_type_label") or fields.get("type_conge_id"))
    for key in ("start_date", "end_date", "date_precision", "type_conge_id", "leave_type_label"):
        if payload.get(key):
            fields[key] = payload[key]
    if payload.get("reason"):
        fields["reason"] = payload["reason"]
    elif "reason" not in fields and had_leave_type and not _is_no_reason(original) and not _has_date_or_time(payload):
        fields["reason"] = original
    elif "reason" not in fields and _looks_like_reason_followup(original, payload):
        fields["reason"] = original
    # Sick / medical / specific leave types ARE their own reason — a user who
    # asks for "conge maladie pour demain" should not be re-prompted for a
    # motif. Map the known leave-type labels to their canonical reason.
    if "reason" not in fields:
        inferred_reason = _reason_from_leave_type(fields.get("leave_type_label"))
        if inferred_reason:
            fields["reason"] = inferred_reason


def _reason_from_leave_type(leave_type_label: Any) -> str | None:
    label = str(leave_type_label or "").strip().lower()
    if not label:
        return None
    # Order matters: more specific labels first.
    if "maladie" in label or "medical" in label:
        return "maladie"
    if "maternite" in label or "maternité" in label:
        return "maternite"
    if "paternite" in label or "paternité" in label:
        return "paternite"
    if "exceptionnel" in label:
        return "exceptionnel"
    if "sans solde" in label:
        return "sans solde"
    return None


def _merge_telework_fields(fields: dict[str, Any], payload: dict[str, Any], original: str) -> None:
    fields["raw_last_message"] = original
    for key in ("start_date", "end_date", "date_precision", "telework_type", "telework_period"):
        if payload.get(key):
            fields[key] = payload[key]
    if not fields.get("telework_type"):
        inferred = _infer_telework_type_from_text(original)
        if inferred:
            fields["telework_type"] = inferred
    if payload.get("reason"):
        fields["reason"] = payload["reason"]


def _infer_telework_type_from_text(text: str) -> str | None:
    lower = (text or "").lower()
    if any(term in lower for term in ("matin", "morning")):
        return "DEMI_JOURNEE_MATIN"
    if any(term in lower for term in ("apres midi", "après midi", "afternoon")):
        return "DEMI_JOURNEE_APRES_MIDI"
    if any(term in lower for term in ("semaine", "week")):
        return "SEMAINE_COMPLETE"
    return None


def _merge_authorization_fields(fields: dict[str, Any], payload: dict[str, Any], original: str) -> None:
    fields["raw_last_message"] = original
    for key in ("request_date", "time_start", "time_end", "duration_hours", "authorization_type"):
        if payload.get(key):
            fields[key] = payload[key]
    if not fields.get("authorization_type"):
        inferred = _infer_authorization_type(original)
        if inferred:
            fields["authorization_type"] = inferred
    if fields.get("time_start") and not fields.get("time_end") and fields.get("duration_hours"):
        fields["time_end"] = _add_hours(str(fields["time_start"]), float(fields["duration_hours"]))
    if payload.get("reason"):
        fields["reason"] = _normalize_reason_text(payload["reason"])
    elif "reason" not in fields and _infer_reason(original):
        fields["reason"] = _infer_reason(original)
    elif "reason" not in fields and _looks_like_reason_followup(original, payload):
        fields["reason"] = original


def _merge_document_fields(fields: dict[str, Any], payload: dict[str, Any], original: str, context: CurrentUserContext) -> None:
    fields["raw_last_message"] = original
    fields.setdefault("user_id", context.user_id)
    fields.setdefault("entreprise_id", context.entreprise_id or context.tenant_id)
    metadata = context.metadata if isinstance(context.metadata, dict) else {}
    fields.setdefault("source", metadata.get("channel") or "chat")

    waiting_for_payslip_month = is_payslip_type(fields.get("document_type")) and not fields.get("month")
    document_type = normalize_document_type(payload.get("document_type")) or infer_document_type(original)
    if document_type:
        fields["document_type"] = document_type

    month = parse_month_reference(payload.get("month")) or parse_month_reference(original)
    if month:
        fields["month"] = month
        fields.pop("month_parse_failed", None)
    elif waiting_for_payslip_month and original.strip() and not infer_document_type(original):
        fields["month_parse_failed"] = True

    if payload.get("reason"):
        fields["reason"] = payload["reason"]


def _merge_rh_document_generation_fields(fields: dict[str, Any], original: str) -> None:
    fields["raw_last_message"] = original
    document_type = _infer_rh_document_type(original)
    if document_type:
        fields["document_type"] = document_type
    employee_query = _extract_rh_employee_query(original)
    if employee_query:
        fields["employee_query"] = employee_query


def _missing_fields(flow: PendingConversationFlow) -> list[str]:
    fields = flow.collected_fields
    if flow.intent == "leave.create":
        missing: list[str] = []
        if not fields.get("start_date") or not fields.get("end_date") or fields.get("date_precision") == "month_inferred":
            missing.append("date")
        if not fields.get("leave_type_label") and not fields.get("type_conge_id"):
            missing.append("type")
        if not fields.get("reason"):
            missing.append("reason")
        return missing
    if flow.intent == "authorization.create":
        missing = []
        if not fields.get("request_date"):
            missing.append("date")
        if not fields.get("time_start") or not fields.get("time_end"):
            missing.append("time")
        if not fields.get("authorization_type"):
            missing.append("type")
        if not fields.get("reason"):
            missing.append("reason")
        return missing
    if flow.intent == "telework.create":
        missing = []
        if not fields.get("start_date") or not fields.get("end_date") or fields.get("date_precision") == "month_inferred":
            missing.append("date")
        if not fields.get("telework_type"):
            missing.append("type")
        return missing
    if flow.intent == "document.create":
        missing = []
        if not fields.get("document_type"):
            missing.append("type")
        elif is_payslip_type(fields.get("document_type")) and not fields.get("month"):
            missing.append("month")
        return missing
    if flow.intent == "rh.document_generate":
        missing = []
        if not fields.get("document_type"):
            missing.append("type")
        if not fields.get("employee_query"):
            missing.append("employee")
        return missing
    if flow.intent in {"organisation.create_team", "rh.structure.team.create"}:
        missing = []
        if not fields.get("name"):
            missing.append("name")
        if not fields.get("departement_id"):
            missing.append("departement_id")
        return missing
    if flow.intent in {"organisation.create_department", "rh.structure.department.create"}:
        missing = []
        if not fields.get("name"):
            missing.append("name")
        if not fields.get("code_interne"):
            missing.append("code_interne")
        return missing
    return []


def _question_for_missing(intent: str, field: str, flow: PendingConversationFlow) -> str:
    if intent == "leave.create":
        if field == "date":
            return "Pour quelle date souhaitez-vous demander ce conge ?"
        if field == "type":
            return "Quel type de conge souhaitez-vous demander ? Par exemple: conge annuel, maladie, RTT."
        if field == "reason" and _is_no_reason(flow.collected_fields.get("raw_last_message")):
            return "Le motif est requis pour cette demande. Quel motif souhaitez-vous indiquer ?"
        return "Quel motif souhaitez-vous indiquer pour cette demande de conge ?"
    if intent == "authorization.create":
        if field == "date":
            return "Pour quelle date souhaitez-vous demander cette autorisation ?"
        if field == "time":
            if flow.collected_fields.get("duration_hours"):
                return "A quelle heure commence cette autorisation ?"
            return "Merci de preciser les heures de debut et de fin de l'autorisation."
        if field == "type":
            return "Quel type d'autorisation souhaitez-vous demander ? Par exemple: sortie anticipee, arrivee tardive ou absence temporaire."
        return "Quel motif souhaitez-vous indiquer pour cette autorisation ?"
    if intent == "telework.create":
        if field == "date":
            return "Pour quelle date souhaitez-vous demander le teletravail ?"
        if field == "type":
            return "Souhaitez-vous une journee complete, une matinee, un apres-midi ou une semaine complete ?"
        return "Pouvez-vous preciser cette information ?"
    if intent == "document.create":
        if field == "type":
            return localized_document_type_question(flow.language)
        if field == "month":
            return localized_month_question(flow.language, invalid=flow.collected_fields.get("month_parse_failed") is True)
        return "Pouvez-vous preciser cette information ?"
    if intent == "rh.document_generate":
        if field == "type":
            return "Quel type de document RH souhaitez-vous generer ?"
        if field == "employee":
            return "Pour quel employe souhaitez-vous generer ce document RH ?"
        return "Pouvez-vous preciser cette information ?"
    if intent in {"organisation.create_team", "rh.structure.team.create"}:
        if field == "name":
            return "Comment souhaitez-vous nommer cette equipe ?"
        if field == "departement_id":
            existing_name = flow.collected_fields.get("name")
            suffix = f" '{existing_name}'" if existing_name else ""
            return (
                f"Pour quel departement (ID numerique) souhaitez-vous creer l'equipe{suffix} ? "
                "Exemple: 'departement 3'."
            )
        return "Pouvez-vous preciser cette information ?"
    if intent in {"organisation.create_department", "rh.structure.department.create"}:
        if field == "name":
            return "Comment souhaitez-vous nommer ce departement ?"
        if field == "code_interne":
            existing_name = flow.collected_fields.get("name")
            suffix = f" '{existing_name}'" if existing_name else ""
            return (
                f"Quel code interne pour le departement{suffix} ? "
                "Format: lettres majuscules, chiffres et tirets uniquement (ex: TECH, RND-2)."
            )
        return "Pouvez-vous preciser cette information ?"
    return "Pouvez-vous preciser cette information ?"


def _tool_input(flow: PendingConversationFlow) -> dict[str, Any]:
    fields = flow.collected_fields
    if flow.intent == "leave.create":
        return {
            "start_date": fields["start_date"],
            "end_date": fields["end_date"],
            "reason": fields["reason"],
            "type_conge_id": fields.get("type_conge_id"),
            "leave_type_label": fields.get("leave_type_label"),
        }
    if flow.intent == "authorization.create":
        return {
            "request_date": fields["request_date"],
            "time_start": fields["time_start"],
            "time_end": fields["time_end"],
            "authorization_type": fields.get("authorization_type"),
            "reason": fields.get("reason"),
        }
    if flow.intent == "telework.create":
        return {
            "start_date": fields["start_date"],
            "end_date": fields["end_date"],
            "telework_type": fields.get("telework_type"),
            "period": fields.get("telework_period"),
            "reason": fields.get("reason"),
        }
    if flow.intent == "document.create":
        return {
            "document_type": fields["document_type"],
            "reason": fields.get("reason"),
            "month": fields.get("month"),
        }
    if flow.intent == "rh.document_generate":
        first, last = _split_employee_name(fields["employee_query"])
        document_type = fields["document_type"]
        return {
            "type": document_type,
            "label": _rh_document_label(document_type),
            "employe_prenom": first,
            "employe_nom": last,
        }
    if flow.intent in {"organisation.create_team", "rh.structure.team.create"}:
        return {
            "nom": fields["name"],
            "departement_id": int(fields["departement_id"]),
            "est_active": bool(fields.get("est_active", True)),
        }
    if flow.intent in {"organisation.create_department", "rh.structure.department.create"}:
        return {
            "nom": fields["name"],
            "code_interne": fields["code_interne"],
        }
    return dict(fields)


def _slot_result(flow: PendingConversationFlow, *, status: str = "pending") -> dict[str, Any]:
    pending_flow = {
        "intent": flow.intent,
        "pendingIntent": flow.intent,
        "agent": flow.agent,
        "status": status,
        "collectedFields": dict(flow.collected_fields),
        "filledSlots": dict(flow.collected_fields),
        "missingFields": list(flow.missing_fields),
        "requiredSlots": list(flow.missing_fields),
        "lastQuestion": flow.last_question,
        "language": flow.language,
        "role": flow.role,
        "currentPage": flow.current_page,
        "lastAction": flow.last_action,
    }
    if flow.intent == "document.create":
        document_type = flow.collected_fields.get("document_type")
        pending_flow.update(
            {
                "documentType": document_type,
                "documentLabel": document_label(document_type),
                "month": flow.collected_fields.get("month"),
                "moisConcerne": flow.collected_fields.get("month"),
                "motif": flow.collected_fields.get("reason"),
                "userId": flow.collected_fields.get("user_id"),
                "entrepriseId": flow.collected_fields.get("entreprise_id"),
                "source": flow.collected_fields.get("source"),
            }
        )
    return {
        "kind": "slot_filling",
        "pendingFlow": pending_flow,
    }


def _confirmation_result(flow: PendingConversationFlow, tool_input: dict[str, Any], analysis: dict[str, Any] | None) -> dict[str, Any]:
    if flow.intent == "document.create":
        document_type = tool_input.get("document_type")
        summary: dict[str, Any] = {
            "type": document_type,
            "documentLabel": document_label(document_type),
            "month": tool_input.get("month"),
            "moisConcerne": tool_input.get("month"),
            "motif": tool_input.get("reason"),
        }
    elif flow.intent.startswith("organisation.") or flow.intent.startswith("rh.structure."):
        summary: dict[str, Any] = {
            "nom": tool_input.get("nom"),
            "departementId": tool_input.get("departement_id"),
            "codeInterne": tool_input.get("code_interne"),
        }
    else:
        summary = {
            "type": tool_input.get("leave_type_label") or tool_input.get("authorization_type"),
            "date": tool_input.get("start_date") or tool_input.get("request_date"),
            "endDate": tool_input.get("end_date"),
            "time": _time_label(tool_input),
            "motif": tool_input.get("reason"),
        }
    result: dict[str, Any] = {
        "kind": "confirmation_summary",
        "intent": flow.intent,
        "agent": flow.agent,
        "summary": summary,
        "pendingFlow": _slot_result(flow, status="complete")["pendingFlow"],
    }
    if analysis:
        result["riskAnalysis"] = analysis
    return result


def _confirmation_text(intent: str, tool_input: dict[str, Any], analysis: dict[str, Any] | None, *, language: Any = None) -> str:
    if intent == "leave.create":
        base = f"Confirmez-vous cette demande de conge {tool_input.get('leave_type_label') or ''} pour le {tool_input.get('start_date')} ?"
        return LeaveRiskAnalyzer.build_confirmation_text(base, analysis)
    if intent == "authorization.create":
        return f"Confirmez-vous cette demande d'autorisation pour le {tool_input.get('request_date')} {_time_label(tool_input)} ?"
    if intent == "telework.create":
        type_label = tool_input.get("telework_type") or "JOURNEE_COMPLETE"
        date_label = tool_input.get("start_date") or "la date demandee"
        return f"Confirmez-vous cette demande de teletravail ({type_label}) pour le {date_label} ?"
    if intent == "document.create":
        return localized_confirmation_text(tool_input.get("document_type"), tool_input.get("month"), language)
    if intent in {"organisation.create_team", "rh.structure.team.create"}:
        return (
            f"Confirmez-vous la creation de l'equipe '{tool_input.get('nom')}' "
            f"dans le departement {tool_input.get('departement_id')} ?"
        )
    if intent in {"organisation.create_department", "rh.structure.department.create"}:
        return (
            f"Confirmez-vous la creation du departement '{tool_input.get('nom')}' "
            f"(code: {tool_input.get('code_interne')}) ?"
        )
    return "Confirmez-vous cette action ?"


async def _continue_rh_document_generation(
    flow: PendingConversationFlow,
    context: CurrentUserContext,
    executor: ToolExecutor,
    confirmation_store: ConfirmationStore,
) -> AgentResponse:
    fields = flow.collected_fields
    query = str(fields.get("employee_query") or "").strip()
    document_type = str(fields.get("document_type") or "ATTESTATION_TRAVAIL").strip()
    label = _rh_document_label(document_type)
    result = await executor.execute("organisation.search_employee", {"query": query}, context)
    read = result.data.get("read_result") if result.success and isinstance(result.data, dict) else None
    items = read.get("items") if isinstance(read, dict) and isinstance(read.get("items"), list) else []
    employees = [item for item in items if isinstance(item, dict)]
    call = ToolCallRecord(name="organisation.search_employee", arguments={"query": query}, status="success" if result.success else "failed")
    if not result.success:
        return AgentResponse(
            type="error",
            text=result.error_message or "Je n'ai pas pu rechercher cet employe.",
            intent=flow.intent,
            confidence=0.9,
            toolCalls=[call],
            actionResult={"kind": "slot_filling", "status": "employee_lookup_failed", "query": query},
        )
    if not employees:
        return AgentResponse(
            type="answer",
            text=f"Je n'ai trouve aucun employe correspondant a '{query}'.",
            intent=flow.intent,
            confidence=0.9,
            toolCalls=[call],
            actionResult={"kind": "no_data", "entity": "employee", "query": query},
        )
    exact = [item for item in employees if _lookup(_employee_display_name(item)) == _lookup(query)]
    selected = exact[0] if len(exact) == 1 else (employees[0] if len(employees) == 1 else None)
    if selected is None:
        return AgentResponse(
            type="ask",
            text=_employee_choices_text(employees, "Plusieurs employes correspondent. Lequel faut-il utiliser ?"),
            intent=flow.intent,
            confidence=0.9,
            toolCalls=[call],
            actionResult={**_slot_result(flow), "choices": [_employee_display_name(item) for item in employees]},
        )
    tool_input = _rh_document_tool_input(document_type, label, selected)
    record = confirmation_store.create(context, "rh.document.generate", tool_input)
    display_name = _employee_display_name(selected)
    return AgentResponse(
        type="confirm_action",
        text=f"Je vais generer {label} pour {display_name}. Confirmez-vous ?",
        intent=flow.intent,
        confidence=0.94,
        requiresConfirmation=True,
        confirmationId=record.confirmation_id,
        toolCalls=[ToolCallRecord(name="rh.document.generate", arguments=tool_input, status="pending_confirmation")],
        actionResult={
            "kind": "approval_confirmation",
            "agent": "RHAgent",
            "toolName": "rh.document.generate",
            "documentType": document_type,
            "employee": {"id": selected.get("id"), "name": display_name, "email": selected.get("email")},
        },
    )


def _time_label(tool_input: dict[str, Any]) -> str | None:
    start = tool_input.get("time_start")
    end = tool_input.get("time_end")
    if start and end:
        return f"{start} - {end}"
    return None


def _document_label(document_type: Any) -> str:
    labels = {
        "ATTESTATION_TRAVAIL": "l'attestation de travail",
        "BULLETIN_PAIE": "bulletin de paie",
        "ATTESTATION_SALAIRE": "l'attestation de salaire",
        "CONTRAT_TRAVAIL": "contrat de travail",
        "CERTIFICAT_CONGE": "certificat de conge",
        "ATTESTATION_ANCIENNETE": "l'attestation d'anciennete",
        "FICHE_POSTE": "fiche de poste",
    }
    value = str(document_type or "document").upper()
    return labels.get(value, "ce document")


def _infer_rh_document_type(message: str) -> str | None:
    text = (message or "").lower()
    if any(term in text for term in ("bulletin", "paie", "payslip", "fiche de paie")):
        return "BULLETIN_PAIE"
    if any(term in text for term in ("salaire", "salary")):
        return "ATTESTATION_SALAIRE"
    if any(term in text for term in ("attestation", "certificat", "certificate", "travail")):
        return "ATTESTATION_TRAVAIL"
    return None


def _rh_document_label(document_type: Any) -> str:
    labels = {
        "ATTESTATION_TRAVAIL": "Attestation de travail",
        "BULLETIN_PAIE": "Bulletin de paie",
        "ATTESTATION_SALAIRE": "Attestation de salaire",
    }
    return labels.get(str(document_type or "").upper(), "Document RH")


def _extract_rh_employee_query(message: str) -> str | None:
    text = (message or "").strip()
    if not text:
        return None
    patterns = (
        r"\b(?:pour|for|du|de|d')\s+([A-Za-zÀ-ÿ][\wÀ-ÿ'-]+(?:\s+[A-Za-zÀ-ÿ][\wÀ-ÿ'-]+){0,3})",
        r"\b(?:attestation|document|bulletin|certificat|certificate)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ'-]+(?:\s+[A-Za-zÀ-ÿ][\wÀ-ÿ'-]+){0,3})",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            candidate = _clean_rh_employee_candidate(match.group(1))
            if candidate:
                return candidate
    tokens = [token.strip(" ,.;:") for token in text.split() if token.strip(" ,.;:")]
    kept: list[str] = []
    for token in reversed(tokens):
        lowered = token.lower()
        if lowered in {"attestation", "document", "genere", "generi", "génère", "générer", "generer", "pour", "du", "de"}:
            break
        if re.match(r"^[A-Za-zÀ-ÿ][\wÀ-ÿ'-]*$", token):
            kept.insert(0, token)
        if len(kept) >= 3:
            break
    candidate = _clean_rh_employee_candidate(" ".join(kept))
    return candidate or None


def _clean_rh_employee_candidate(value: str) -> str:
    words = []
    for token in (value or "").strip().split():
        lowered = token.lower().strip(" ,.;:")
        if lowered in {"demain", "today", "aujourd", "hui", "avec", "motif", "du", "de", "travail", "work", "genere", "generi", "generer", "générer"}:
            break
        words.append(token.strip(" ,.;:"))
    return " ".join(words).strip()


def _split_employee_name(value: Any) -> tuple[str, str]:
    parts = str(value or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], parts[0]
    return parts[0], " ".join(parts[1:])


def _employee_display_name(item: dict[str, Any]) -> str:
    full = str(item.get("fullName") or item.get("nomComplet") or "").strip()
    if full:
        return full
    first = str(item.get("prenom") or item.get("firstName") or "").strip()
    last = str(item.get("nom") or item.get("lastName") or "").strip()
    email = str(item.get("email") or "").strip()
    return " ".join(part for part in (first, last) if part).strip() or email or str(item.get("id") or "employe")


def _employee_choices_text(items: list[dict[str, Any]], heading: str) -> str:
    lines = [heading]
    for item in items[:8]:
        name = _employee_display_name(item)
        email = item.get("email")
        suffix = f" ({email})" if email else ""
        lines.append(f"- {name}{suffix}")
    return "\n".join(lines)


def _rh_document_tool_input(document_type: str, label: str, employee: dict[str, Any]) -> dict[str, Any]:
    first = str(employee.get("prenom") or employee.get("firstName") or "").strip()
    last = str(employee.get("nom") or employee.get("lastName") or "").strip()
    if not first or not last:
        first, last = _split_employee_name(_employee_display_name(employee))
    return {
        "type": document_type,
        "label": label,
        "employe_prenom": first,
        "employe_nom": last,
        "employe_poste": employee.get("poste") or employee.get("position"),
        "employe_departement": employee.get("departement") or employee.get("department") or employee.get("departementNom"),
        "date_entree": employee.get("dateEntree") or employee.get("hireDate"),
    }


def _lookup(value: Any) -> str:
    text = str(value or "").strip().lower()
    replacements = {"é": "e", "è": "e", "ê": "e", "à": "a", "ù": "u", "ç": "c", "î": "i", "ï": "i"}
    for source, target in replacements.items():
        text = text.replace(source, target)
    return " ".join(text.replace("-", " ").replace("_", " ").split())


def _looks_like_reason_followup(original: str, payload: dict[str, Any]) -> bool:
    if not original.strip() or _is_no_reason(original):
        return False
    text = original.strip().lower()
    generic_request_terms = ("je veux", "je souhaite", "demande", "demander", "autorisation", "conge", "congé", "teletravail", "document")
    reason_terms = ("motif", "raison", "repos", "medical", "médical", "rdv", "rendez", "familial", "personnel", "maladie")
    if any(term in text for term in generic_request_terms) and not any(term in text for term in reason_terms):
        return False
    structured_keys = {
        "start_date",
        "end_date",
        "request_date",
        "time_start",
        "time_end",
        "duration_hours",
        "leave_type_label",
        "type_conge_id",
        "authorization_type",
        "date_precision",
    }
    return not any(payload.get(key) for key in structured_keys)


def _has_date_or_time(payload: dict[str, Any]) -> bool:
    return any(payload.get(key) for key in ("start_date", "end_date", "request_date", "time_start", "time_end", "duration_hours", "date_precision"))


def _is_cancel_message(message: str) -> bool:
    text = " ".join((message or "").strip().lower().strip(" \t\r\n?!?.,;:").split())
    return text in {
        "annuler",
        "annule",
        "cancel",
        "stop",
        "la",
        "le",
        "no",
        "non merci",
        "batel",
        "sa7bi batel",
        "\u0625\u0644\u063a\u0627\u0621",
        "\u0627\u0644\u063a\u0627\u0621",
        "لا",
    }

def _is_no_reason(value: Any) -> bool:
    return str(value or "").strip().lower() in {"nn", "non", "no"}


def _normalize_reason_text(value: Any) -> str:
    return str(value or "").strip().replace("rendez vous", "rendez-vous")


def _add_hours(time_value: str, hours: float) -> str | None:
    try:
        parsed = datetime.strptime(time_value[:8], "%H:%M:%S")
        return (parsed + timedelta(hours=hours)).strftime("%H:%M:%S")
    except (TypeError, ValueError):
        return None


_FLOW_DOMAIN_TERMS = {
    "leave.create": ("conge", "congé", "congÃ©", "leave", "vacance", "absence"),
    "authorization.create": ("autorisation", "permission"),
    # Telework follow-ups are usually date-only ("pour demain", "ghodwa") with
    # no telework keyword. The escape patterns include telework terms, so we
    # don't need to repeat them — but listing core terms here means a user can
    # say "teletravail aussi" without escaping. Date-only follow-ups carry no
    # escape match and stay in the flow.
    "telework.create": ("teletravail", "télétravail", "telework", "remote", "wfh"),
    "document.create": (
        "document",
        "attestation",
        "bulletin",
        "fiche de paie",
        "payslip",
        "certificate",
        "certificat",
        "contrat",
        "war9a",
    ),
    "rh.document_generate": (
        "document",
        "attestation",
        "bulletin",
        "certificat",
        "certificate",
    ),
    # Org-create flows: keep the flow alive when the user is still talking
    # about teams/departments (e.g. "in departement 5", "code TECH").
    "organisation.create_team": ("equipe", "team", "departement", "department", "dept"),
    "rh.structure.team.create": ("equipe", "team", "departement", "department", "dept"),
    "organisation.create_department": ("departement", "department", "dept", "code"),
    "rh.structure.department.create": ("departement", "department", "dept", "code"),
}

_ESCAPE_PATTERNS: tuple[tuple[str, ...], ...] = (
    # pointage / attendance
    (
        "pointage",
        "pointe",
        "pointer",
        "pointé",
        "pointer mon entr",
        "pointer ma sortie",
        "check in",
        "check-in",
        "check out",
        "check-out",
        "checked in",
        "checked out",
        "did i forget",
        "ai-je point",
        "est ce que jai point",
        "est-ce que j'ai point",
        "est ce que j ai point",
        "suis-je point",
        "npointi",
        "dakhla",
        "khrouj",
        "بصمة",
        "بصم",
        "تسجيل الحضور",
        "تسجيل الخروج",
    ),
    # documents
    (
        "document",
        "attestation",
        "bulletin",
        "fiche de paie",
        "payslip",
        "certificate",
        "certificat",
        "contrat",
        "وثيقة",
        "شهادة",
    ),
    # télétravail
    (
        "teletravail",
        "télétravail",
        "telework",
        "remote work",
        "work from home",
        "tÃ©lÃ©travail",
        "travail a distance",
        "travail à distance",
    ),
    # daily summary / role intelligence
    (
        "daily summary",
        "résumé du jour",
        "resume du jour",
        "mon résumé",
        "mon resume",
        "show my daily",
        "quoi faire aujourd",
        "daily briefing",
        "résumé intelligent",
        "resume intelligent",
    ),
    # greetings / small talk
    (
        "bonjour",
        "salut",
        "hello",
        "hi ",
        "hey",
        "bonsoir",
        "good morning",
        "good evening",
        "صباح",
        "مرحبا",
    ),
    # reunions / planning (lets users pivot from an org-create flow to a meeting
    # query). Deliberately excludes "rdv" / "rendez-vous" — those are valid
    # authorization reasons ("rendez-vous medical"), and escaping on them would
    # break the slot-filling final step of an authorization request.
    (
        "reunion",
        "reunions",
        "meeting",
        "meetings",
        "planning",
        "agenda",
        "اجتماع",
        "اجتماعات",
        "جدول",
    ),
    # authorization queries — must escape leave/telework flows when a user
    # pivots to "je veut une autorisation pour 2heures" mid-leave-flow,
    # otherwise the trailing "pour 2heures" gets merged as the leave reason.
    # KEEP narrow: only the head-noun "autorisation" / "permission" escapes;
    # reason-shaped phrases like "rdv medical", "sortie anticipee" must NOT
    # escape because they're valid motifs INSIDE an authorization flow.
    (
        "autorisation",
        "permission",
    ),
    # admin / system / RH / manager queries
    (
        "system health",
        "santé système",
        "sante systeme",
        "ai provider",
        "tenant configuration",
        "redis status",
        "braintrust",
        "rh backlog",
        "backlog rh",
        "pending validations",
        "validations en attente",
        "document workload",
        "workload rh",
        "team summary",
        "résumé équipe",
        "resume equipe",
        "pending approvals",
        "approvals pending",
        "team attendance",
        "présence équipe",
        "presence equipe",
    ),
)


def _message_escapes_flow(message: str, flow_intent: str) -> bool:
    """Detect if the incoming message clearly belongs to a different domain
    than the pending slot-filling flow. When True, the orchestrator abandons
    the pending flow and re-routes the message normally.

    Critically, the message must NOT contain any term tied to the pending
    flow's own domain (so 'mon congé annuel' still continues the leave flow).
    """
    text = (message or "").lower().strip()
    if not text:
        return False

    domain_terms = _FLOW_DOMAIN_TERMS.get(flow_intent, ())
    if domain_terms and any(term in text for term in domain_terms):
        return False

    return any(term in text for group in _ESCAPE_PATTERNS for term in group)
