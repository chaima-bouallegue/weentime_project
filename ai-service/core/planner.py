from __future__ import annotations

from typing import Any

from core.action_map import role_can_execute, workflow_steps_for_intent
from core.intent_engine import (
    CHAT,
    GREETING,
    GET_LEAVE_BALANCE,
    GET_MY_REQUESTS,
    GET_NOTIFICATIONS,
    GET_PENDING_VALIDATIONS,
    GET_RH_STATS,
    GET_TEAM_REQUESTS,
    detect_intent,
    normalize_text,
)

PLAN_LABELS = {
    "check_permission": "Verifier les permissions",
    "extract_dates": "Extraire les dates",
    "extract_schedule": "Extraire le creneau",
    "validate_dates": "Valider les dates",
    "check_leave_balance": "Verifier le solde de conges",
    "validate_schedule": "Valider le creneau",
    "validate_eligibility": "Verifier l'eligibilite",
    "validate_telework_eligibility": "Verifier l'eligibilite teletravail",
    "identify_document_type": "Identifier le document",
    "fetch_request": "Recuperer la demande",
    "validate_status": "Verifier le statut",
    "create_leave": "Creer la demande de conge",
    "create_authorization": "Creer la demande d'autorisation",
    "create_telework": "Creer la demande de teletravail",
    "generate_document": "Generer le document",
    "request_document": "Creer la demande de document",
    "store_document": "Verifier le stockage",
    "return_download_link": "Recuperer le lien du document",
    "open_document": "Ouvrir le document",
    "approve_request": "Approuver la demande",
    "reject_request": "Refuser la demande",
    "process_request": "Traiter la demande",
    "notify_manager": "Notifier le manager",
    "notify_employee": "Notifier l'employe",
    "notify_rh": "Notifier les RH",
    "return_confirmation": "Retourner la confirmation",
    "return_success": "Retourner le resultat",
    "get_leave_balance": "Consulter le solde de conges",
    "get_notifications": "Recuperer les notifications",
    "get_my_requests": "Recuperer mes demandes",
    "get_team_requests": "Recuperer les demandes equipe",
    "get_pending_validations": "Recuperer les validations en attente",
    "get_rh_stats": "Recuperer les statistiques RH",
    "get_all_requests": "Recuperer toutes les demandes",
}

QUERY_PLAN_STEPS: dict[str, tuple[str, ...]] = {
    "GET_LEAVE_BALANCE": ("get_leave_balance",),
    "GET_NOTIFICATIONS": ("get_notifications",),
    "GET_MY_REQUESTS": ("get_my_requests",),
    "GET_TEAM_REQUESTS": ("check_permission", "get_team_requests"),
    "GET_PENDING_VALIDATIONS": ("check_permission", "get_pending_validations"),
    "GET_RH_STATS": ("check_permission", "get_rh_stats"),
    "GET_ALL_REQUESTS": ("check_permission", "get_all_requests"),
    "OPEN_DOCUMENT": ("open_document",),
}


def _split_chunks(raw_text: str) -> list[str]:
    text = normalize_text(raw_text)
    if not text:
        return []

    chunks = [text]
    for separator in (" et ", " puis ", " ensuite ", " and ", ",", ";"):
        refined: list[str] = []
        for chunk in chunks:
            refined.extend(part.strip() for part in chunk.split(separator) if part.strip())
        chunks = refined or chunks
    return chunks


def _detect_companion_intents(primary_intent: str, entities: dict[str, Any], role: str) -> list[str]:
    raw_text = str(entities.get("raw_text") or entities.get("normalized_text") or "")
    normalized = normalize_text(raw_text)
    companions: list[str] = []

    for chunk in _split_chunks(raw_text):
        chunk_intent = detect_intent(chunk, role=role)
        if chunk_intent in {CHAT, GREETING, primary_intent}:
            continue
        companions.append(chunk_intent)

    if "solde" in normalized and primary_intent != GET_LEAVE_BALANCE:
        companions.append(GET_LEAVE_BALANCE)
    if any(token in normalized for token in ("notifications", "notification", "notif")) and primary_intent != GET_NOTIFICATIONS:
        companions.append(GET_NOTIFICATIONS)
    if any(token in normalized for token in ("mes demandes", "historique", "suivi")) and primary_intent != GET_MY_REQUESTS:
        companions.append(GET_MY_REQUESTS)
    if role == "MANAGER" and any(token in normalized for token in ("en attente", "validations", "pending")) and primary_intent != GET_PENDING_VALIDATIONS:
        companions.append(GET_PENDING_VALIDATIONS)
    if role == "MANAGER" and any(token in normalized for token in ("equipe", "team", "workspace")) and primary_intent != GET_TEAM_REQUESTS:
        companions.append(GET_TEAM_REQUESTS)
    if role == "RH" and any(token in normalized for token in ("stats", "statistiques", "kpi", "indicateur")) and primary_intent != GET_RH_STATS:
        companions.append(GET_RH_STATS)

    deduped: list[str] = []
    for intent in companions:
        if intent in {CHAT, GREETING} or intent in deduped:
            continue
        deduped.append(intent)
    return deduped


def _steps_for_intent(intent: str, role: str) -> list[str]:
    workflow_steps = workflow_steps_for_intent(intent)
    if workflow_steps:
        steps = list(workflow_steps)
        if role in {"MANAGER", "RH", "ADMIN"} and steps and steps[0] != "check_permission":
            steps.insert(0, "check_permission")
        return steps
    return list(QUERY_PLAN_STEPS.get(intent, ("check_permission",)))


def _build_step(step_key: str, *, intent: str, role: str) -> dict[str, Any]:
    return {
        "step": step_key,
        "label": PLAN_LABELS.get(step_key, step_key.replace("_", " ").title()),
        "intent": intent,
        "role": role,
        "critical": step_key not in {"notify_manager", "notify_employee", "notify_rh"},
    }


def _append_steps(plan: list[dict[str, Any]], intent: str, role: str) -> None:
    for step_key in _steps_for_intent(intent, role):
        step_payload = _build_step(step_key, intent=intent, role=role)
        if any(
            existing["step"] == step_payload["step"] and existing["intent"] == step_payload["intent"]
            for existing in plan
        ):
            continue
        plan.append(step_payload)


def plan_task(intent: str, entities: dict[str, Any] | None, role: str) -> list[dict[str, Any]]:
    resolved_intent = str(intent or CHAT).upper()
    payload = dict(entities or {})
    resolved_role = (role or payload.get("role") or "EMPLOYEE").upper()

    if resolved_intent in {CHAT, GREETING}:
        return []

    plan: list[dict[str, Any]] = []
    _append_steps(plan, resolved_intent, resolved_role)

    for companion_intent in _detect_companion_intents(resolved_intent, payload, resolved_role):
        if not role_can_execute(companion_intent, resolved_role):
            continue
        _append_steps(plan, companion_intent, resolved_role)

    if not role_can_execute(resolved_intent, resolved_role) and plan:
        if plan[0]["step"] != "check_permission":
            plan.insert(0, _build_step("check_permission", intent=resolved_intent, role=resolved_role))

    return plan
