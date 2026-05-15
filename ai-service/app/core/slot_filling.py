from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from app.agents.authorization_agent import _infer_authorization_type, _infer_reason
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
    "organisation.create_team": {
        "agent": "organisation",
        "entity_intent": _NO_ENTITY_INTENT,
        "tool": "organisation.create_team",
    },
    "organisation.create_department": {
        "agent": "organisation",
        "entity_intent": _NO_ENTITY_INTENT,
        "tool": "organisation.create_department",
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

    tool_name = FLOW_CONFIG[flow.intent]["tool"]
    tool_input = _tool_input(flow)
    analysis: dict[str, Any] | None = None
    if flow.intent == "leave.create":
        analysis = await LeaveRiskAnalyzer(executor).analyze(tool_input, context)
    record = confirmation_store.create(context, tool_name, tool_input)
    store.clear(context, session_id)
    text = _confirmation_text(flow.intent, tool_input, analysis)
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
        if flow.intent == "organisation.create_team":
            _merge_team_fields(fields, original)
        elif flow.intent == "organisation.create_department":
            _merge_department_fields(fields, original)
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
    if flow.intent == "organisation.create_team":
        missing = []
        if not fields.get("name"):
            missing.append("name")
        if not fields.get("departement_id"):
            missing.append("departement_id")
        return missing
    if flow.intent == "organisation.create_department":
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
    if intent == "organisation.create_team":
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
    if intent == "organisation.create_department":
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
    if flow.intent == "organisation.create_team":
        return {
            "nom": fields["name"],
            "departement_id": int(fields["departement_id"]),
            "est_active": bool(fields.get("est_active", True)),
        }
    if flow.intent == "organisation.create_department":
        return {
            "nom": fields["name"],
            "code_interne": fields["code_interne"],
        }
    return dict(fields)


def _slot_result(flow: PendingConversationFlow, *, status: str = "pending") -> dict[str, Any]:
    return {
        "kind": "slot_filling",
        "pendingFlow": {
            "intent": flow.intent,
            "agent": flow.agent,
            "status": status,
            "collectedFields": dict(flow.collected_fields),
            "missingFields": list(flow.missing_fields),
            "lastQuestion": flow.last_question,
        },
    }


def _confirmation_result(flow: PendingConversationFlow, tool_input: dict[str, Any], analysis: dict[str, Any] | None) -> dict[str, Any]:
    if flow.intent.startswith("organisation."):
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


def _confirmation_text(intent: str, tool_input: dict[str, Any], analysis: dict[str, Any] | None) -> str:
    if intent == "leave.create":
        base = f"Confirmez-vous cette demande de conge {tool_input.get('leave_type_label') or ''} pour le {tool_input.get('start_date')} ?"
        return LeaveRiskAnalyzer.build_confirmation_text(base, analysis)
    if intent == "authorization.create":
        return f"Confirmez-vous cette demande d'autorisation pour le {tool_input.get('request_date')} {_time_label(tool_input)} ?"
    if intent == "organisation.create_team":
        return (
            f"Confirmez-vous la creation de l'equipe '{tool_input.get('nom')}' "
            f"dans le departement {tool_input.get('departement_id')} ?"
        )
    if intent == "organisation.create_department":
        return (
            f"Confirmez-vous la creation du departement '{tool_input.get('nom')}' "
            f"(code: {tool_input.get('code_interne')}) ?"
        )
    return "Confirmez-vous cette action ?"


def _time_label(tool_input: dict[str, Any]) -> str | None:
    start = tool_input.get("time_start")
    end = tool_input.get("time_end")
    if start and end:
        return f"{start} - {end}"
    return None


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
    text = (message or "").strip().lower()
    return text in {"annuler", "annule", "cancel", "stop", "la", "le", "no", "non merci", "لا"}


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
    # Org-create flows: keep the flow alive when the user is still talking
    # about teams/departments (e.g. "in departement 5", "code TECH").
    "organisation.create_team": ("equipe", "team", "departement", "department", "dept"),
    "organisation.create_department": ("departement", "department", "dept", "code"),
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
