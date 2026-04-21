from __future__ import annotations

from typing import Any


def generate_response(
    *,
    intent: str,
    context: dict[str, Any],
    validation: dict[str, Any],
) -> dict[str, Any]:
    status = str(validation.get("status") or "failed")
    actions = _suggest_actions(intent, context)

    if status != "success":
        fallback = _fallback_message(intent, context)
        return {
            "status": "failed",
            "text": fallback,
            "actions": actions,
        }

    return {
        "status": "success",
        "text": _success_message(intent, context),
        "actions": actions,
    }


def _success_message(intent: str, context: dict[str, Any]) -> str:
    if context.get("final_text"):
        return str(context["final_text"])

    if intent == "CREATE_LEAVE":
        return "Votre conge a ete cree et votre manager a ete notifie."
    if intent == "CREATE_AUTORISATION":
        return "Votre autorisation a ete creee et votre manager a ete notifie."
    if intent == "CREATE_TELEWORK":
        return "Votre demande de teletravail a ete creee et votre manager a ete notifie."
    if intent == "REQUEST_DOCUMENT":
        if context.get("download_url"):
            return "Votre document est pret et disponible au telechargement."
        return "Votre demande de document a ete creee."
    if intent == "APPROVE_REQUEST":
        return "La demande a ete approuvee et l'employe a ete notifie."
    if intent == "REJECT_REQUEST":
        return "La demande a ete refusee et l'employe a ete notifie."
    if intent == "PROCESS_REQUEST":
        return "La demande RH a ete traitee et l'employe a ete notifie."
    if intent == "GET_LEAVE_BALANCE":
        return str(context.get("leave_balance_text") or "Voici votre solde de conges.")
    if intent == "GET_NOTIFICATIONS":
        return str(context.get("notifications_text") or "Voici vos notifications.")
    if intent == "GET_MY_REQUESTS":
        return str(context.get("requests_text") or "Voici vos demandes.")
    if intent == "GET_TEAM_REQUESTS":
        return str(context.get("team_requests_text") or "Voici les demandes equipe.")
    if intent == "GET_PENDING_VALIDATIONS":
        return str(context.get("pending_validations_text") or "Voici les validations en attente.")
    if intent == "GET_RH_STATS":
        return "Les statistiques RH sont disponibles."
    if intent == "GET_ALL_REQUESTS":
        return "Les demandes RH ont ete chargees."
    if intent == "OPEN_DOCUMENT":
        return "Le document a ete ouvert."
    return "La demande a ete traitee avec succes."


def _fallback_message(intent: str, context: dict[str, Any]) -> str:
    if context.get("fallback_text"):
        return str(context["fallback_text"])
    if intent in {"CREATE_LEAVE", "CREATE_AUTORISATION", "CREATE_TELEWORK", "REQUEST_DOCUMENT"}:
        return "La demande n'a pas pu etre finalisee. Reessayez ou verifiez les informations fournies."
    if intent in {"APPROVE_REQUEST", "REJECT_REQUEST", "PROCESS_REQUEST"}:
        return "Le traitement de la demande a echoue. Reessayez ou verifiez son statut."
    return "La tache a echoue apres validation."


def _suggest_actions(intent: str, context: dict[str, Any]) -> list[str]:
    actions: list[str] = []
    if context.get("download_url"):
        actions.append("open_document")
    if intent in {"CREATE_LEAVE", "GET_LEAVE_BALANCE", "GET_MY_REQUESTS"}:
        actions.append("open_leave_workspace")
    if intent in {"CREATE_AUTORISATION"}:
        actions.append("open_authorization_workspace")
    if intent in {"CREATE_TELEWORK"}:
        actions.append("open_telework_workspace")
    if intent in {"REQUEST_DOCUMENT", "OPEN_DOCUMENT"}:
        actions.append("open_document_workspace")
    if intent in {"APPROVE_REQUEST", "REJECT_REQUEST", "GET_TEAM_REQUESTS", "GET_PENDING_VALIDATIONS"}:
        actions.append("open_manager_workspace")
    if intent in {"PROCESS_REQUEST", "GET_ALL_REQUESTS", "GET_RH_STATS"}:
        actions.append("open_rh_workspace")
    return actions
