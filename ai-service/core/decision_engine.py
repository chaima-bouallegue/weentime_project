from __future__ import annotations

from typing import Any

from config import Settings
from core.action_guard import (
    action_for_intent,
    is_mutating_intent,
    is_navigation_intent,
    is_query_intent,
    missing_fields,
    role_errors,
    validation_errors,
)
from core.action_map import is_workflow_intent, workflow_for_intent
from core.dedup import build_action_key
from core.entity_extractor import extract_entities
from core.intent_engine import (
    CHAT,
    CREATE_AUTORISATION,
    CREATE_LEAVE,
    CREATE_TELEWORK,
    GET_ALL_REQUESTS,
    GET_LEAVE_BALANCE,
    GET_MY_REQUESTS,
    GET_NOTIFICATIONS,
    GET_PENDING_VALIDATIONS,
    GET_RH_STATS,
    GET_TEAM_REQUESTS,
    GREETING,
    OPEN_DOCUMENT,
    PROCESS_REQUEST,
    REQUEST_DOCUMENT,
    detect_intent,
)
from memory.session import SessionStore


CONFIRMATION_TERMS = {
    "oui",
    "ok",
    "okay",
    "d accord",
    "dac",
    "confirme",
    "confirmer",
    "vas y",
    "continue",
    "go",
    "lance",
    "execute",
    "envoye",
}

CANCEL_TERMS = {
    "non",
    "annule",
    "annuler",
    "stop",
    "laisse",
    "abandonne",
    "ne pas faire",
}

RESUME_TERMS = {
    "continue",
    "continuer",
    "reprend",
    "reprendre",
    "reprends le workflow",
    "reessaye",
    "reessaie",
    "retry",
    "relance",
    "relancer",
}


def _merge_entities(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in extra.items():
        if value not in (None, "", [], {}):
            merged[key] = value
    return merged


def _looks_confirmed(text: str) -> bool:
    lowered = " ".join((text or "").strip().lower().split())
    return lowered in CONFIRMATION_TERMS or any(token in lowered for token in CONFIRMATION_TERMS)


def _looks_cancelled(text: str) -> bool:
    lowered = " ".join((text or "").strip().lower().split())
    return lowered in CANCEL_TERMS or any(token in lowered for token in CANCEL_TERMS)


def _looks_resumed(text: str) -> bool:
    lowered = " ".join((text or "").strip().lower().split())
    return lowered in RESUME_TERMS or any(token in lowered for token in RESUME_TERMS)


class DecisionEngine:
    def __init__(self, settings: Settings, session_store: SessionStore) -> None:
        self.settings = settings
        self.session_store = session_store

    def decide(self, user_id: int, role: str, text: str) -> dict[str, Any]:
        state = self.session_store.get_state(user_id)
        pending = state.pending_request
        pending_confirmation = state.pending_confirmation
        workflow_state = state.workflow_state
        resolved_role = (role or state.role or "EMPLOYEE").upper()

        if pending_confirmation:
            if _looks_cancelled(text):
                self.session_store.clear_pending_confirmation(user_id)
                self.session_store.clear_pending_request(user_id)
                return self._decision(
                    decision_type="chat",
                    status="success",
                    intent=CHAT,
                    message="Action annulee.",
                    entities={"user_id": user_id, "role": resolved_role},
                )
            if _looks_confirmed(text):
                self.session_store.clear_pending_confirmation(user_id)
                entities = dict(pending_confirmation.entities)
                entities["confirmed"] = True
                entities["user_id"] = user_id
                if is_mutating_intent(pending_confirmation.intent):
                    entities["action_key"] = build_action_key(
                        user_id,
                        pending_confirmation.intent,
                        resolved_role,
                        entities,
                    )
                return self._decision(
                    decision_type="workflow" if is_workflow_intent(pending_confirmation.intent) else "action",
                    status="success",
                    intent=pending_confirmation.intent,
                    action=pending_confirmation.action,
                    workflow=workflow_for_intent(pending_confirmation.intent),
                    message=self._action_message(pending_confirmation.intent),
                    entities=entities,
                    data=entities,
                )

        if workflow_state and workflow_state.status == "failed" and _looks_resumed(text):
            resumed_entities = dict(workflow_state.entities or {})
            resumed_entities["user_id"] = user_id
            return self._decision(
                decision_type="workflow",
                status="success",
                intent=workflow_state.intent,
                action=workflow_state.action,
                workflow=workflow_state.workflow_name,
                message="Je reprends le workflow interrompu.",
                entities=resumed_entities,
                data=resumed_entities,
                resume=True,
            )

        intent = detect_intent(text, role=resolved_role, pending_intent=pending.intent if pending else None)
        entities = extract_entities(
            text,
            intent=intent,
            role=resolved_role,
            pending_intent=pending.intent if pending else None,
        )
        entities["user_id"] = user_id

        if pending and intent == pending.intent:
            entities = _merge_entities(pending.entities, entities)
            entities["confidence"] = max(float(entities.get("confidence") or 0.0), 0.9)

        required = missing_fields(intent, entities)
        validation = validation_errors(intent, entities)
        permissions = role_errors(intent, resolved_role)
        entities["validation_errors"] = [*validation, *permissions]
        entities["incomplete"] = bool(required or validation)

        self.session_store.update_context(
            user_id,
            role=resolved_role,
            last_intent=intent,
            last_entities=entities,
        )

        if intent == GREETING:
            self.session_store.clear_pending_request(user_id)
            self.session_store.clear_pending_confirmation(user_id)
            return self._decision(
                decision_type="chat",
                status="success",
                intent=intent,
                message="Bonjour ! Comment puis-je vous aider ?",
                entities=entities,
            )

        if intent == CHAT:
            if pending_confirmation:
                return self._decision(
                    decision_type="ask",
                    status="confirm",
                    intent=pending_confirmation.intent,
                    action=pending_confirmation.action,
                    message=pending_confirmation.prompt or "Confirmez-vous cette action ?",
                    entities=pending_confirmation.entities,
                )
            if pending:
                return self._decision(
                    decision_type="ask",
                    status="ask",
                    intent=pending.intent,
                    action=pending.action,
                    message=pending.prompt or "Il manque encore des informations.",
                    entities=pending.entities,
                    missing_fields=pending.missing_fields,
                )
            return self._decision(
                decision_type="chat",
                status="success",
                intent=intent,
                message=self._chat_guidance(resolved_role),
                entities=entities,
            )

        if permissions:
            self.session_store.clear_pending_request(user_id)
            self.session_store.clear_pending_confirmation(user_id)
            return self._decision(
                decision_type="chat",
                status="error",
                intent=intent,
                message=self._forbidden_message(resolved_role, intent),
                entities=entities,
                data={"reason": permissions[0]},
            )

        if is_mutating_intent(intent) and entities.get("is_question"):
            self.session_store.clear_pending_confirmation(user_id)
            return self._decision(
                decision_type="chat",
                status="success",
                intent=intent,
                message=self._question_message(intent),
                entities=entities,
            )

        if required or validation:
            self.session_store.clear_pending_confirmation(user_id)
            return self._ask(user_id, intent, entities, required or self._fallback_missing(intent))

        action = action_for_intent(intent)
        if action is None:
            self.session_store.clear_pending_request(user_id)
            self.session_store.clear_pending_confirmation(user_id)
            return self._decision(
                decision_type="chat",
                status="success",
                intent=intent,
                message=self._chat_guidance(resolved_role),
                entities=entities,
            )

        if is_mutating_intent(intent):
            action_key = build_action_key(user_id, intent, resolved_role, entities)
            if self.session_store.is_duplicate_action(user_id, action_key, self.settings.dedup_window_seconds):
                self.session_store.clear_pending_request(user_id)
                self.session_store.clear_pending_confirmation(user_id)
                return self._decision(
                    decision_type="chat",
                    status="success",
                    intent=intent,
                    action=action,
                    message="Cette action est deja en cours ou a deja ete traitee.",
                    entities=entities,
                    data={"duplicate": True},
                )
            entities["action_key"] = action_key

            if self._should_confirm(intent, entities, from_pending=bool(pending)):
                prompt = self._confirmation_message(intent, entities)
                self.session_store.clear_pending_request(user_id)
                self.session_store.set_pending_confirmation(
                    user_id,
                    intent=intent,
                    action=action,
                    entities=entities,
                    prompt=prompt,
                )
                return self._decision(
                    decision_type="ask",
                    status="confirm",
                    intent=intent,
                    action=action,
                    workflow=workflow_for_intent(intent),
                    message=prompt,
                    entities=entities,
                )

        self.session_store.clear_pending_request(user_id)
        self.session_store.clear_pending_confirmation(user_id)
        return self._decision(
            decision_type="workflow" if is_workflow_intent(intent) else "action",
            status="success",
            intent=intent,
            action=action,
            workflow=workflow_for_intent(intent),
            message=self._action_message(intent),
            entities=entities,
            data=entities,
        )

    def mark_action_executed(
        self,
        user_id: int,
        *,
        action: str,
        action_key: str,
        intent: str,
        entities: dict[str, Any],
    ) -> None:
        self.session_store.mark_action(
            user_id,
            action=action,
            action_key=action_key,
            intent=intent,
            entities=entities,
        )

    def _ask(
        self,
        user_id: int,
        intent: str,
        entities: dict[str, Any],
        required: list[str],
    ) -> dict[str, Any]:
        action = action_for_intent(intent) or intent.lower()
        message = self._missing_prompt(intent, entities, required)
        self.session_store.set_pending_request(
            user_id,
            intent=intent,
            action=action,
            entities=entities,
            missing_fields=required,
            prompt=message,
        )
        return self._decision(
            decision_type="ask",
            status="ask",
            intent=intent,
            action=action,
            message=message,
            entities=entities,
            missing_fields=required,
        )

    def _should_confirm(self, intent: str, entities: dict[str, Any], *, from_pending: bool) -> bool:
        if not is_mutating_intent(intent) or from_pending:
            return False
        if entities.get("confirmed"):
            return False
        if entities.get("needs_confirmation"):
            return True
        try:
            confidence = float(entities.get("confidence") or 0.0)
        except (TypeError, ValueError):
            confidence = 0.0
        return confidence < self.settings.action_confirm_threshold

    def _confirmation_message(self, intent: str, entities: dict[str, Any]) -> str:
        if intent == CREATE_LEAVE:
            return (
                "Confirmez-vous la demande de conge"
                f" du {entities.get('start_date')}"
                f" au {entities.get('end_date')} ?"
            )
        if intent == CREATE_AUTORISATION:
            return (
                "Confirmez-vous la demande d'autorisation"
                f" le {entities.get('request_date')}"
                f" de {entities.get('time_start')} a {entities.get('time_end')} ?"
            )
        if intent == CREATE_TELEWORK:
            return (
                "Confirmez-vous la demande de teletravail"
                f" du {entities.get('start_date')}"
                f" au {entities.get('end_date')} ?"
            )
        if intent == REQUEST_DOCUMENT:
            return f"Confirmez-vous la demande du document {entities.get('document_type')} ?"
        if intent in {"APPROVE_REQUEST", "REJECT_REQUEST"}:
            verb = "l'approbation" if intent == "APPROVE_REQUEST" else "le refus"
            return (
                f"Confirmez-vous {verb} de la demande {entities.get('type_demande')}"
                f" {entities.get('request_id')} ?"
            )
        if intent == PROCESS_REQUEST:
            return (
                f"Confirmez-vous la decision {entities.get('decision')}"
                f" pour la demande {entities.get('type_demande')} {entities.get('request_id')} ?"
            )
        return "Confirmez-vous cette action ?"

    def _fallback_missing(self, intent: str) -> list[str]:
        fallbacks = {
            CREATE_LEAVE: ["start_date", "end_date"],
            CREATE_AUTORISATION: ["request_date", "time_start", "time_end", "authorization_type"],
            CREATE_TELEWORK: ["start_date", "end_date"],
            REQUEST_DOCUMENT: ["document_type"],
            OPEN_DOCUMENT: ["request_id"],
            PROCESS_REQUEST: ["type_demande", "request_id", "decision"],
            "APPROVE_REQUEST": ["type_demande", "request_id"],
            "REJECT_REQUEST": ["type_demande", "request_id"],
        }
        return list(fallbacks.get(intent, []))

    def _chat_guidance(self, role: str) -> str:
        if role == "MANAGER":
            return "Je peux recuperer les demandes equipe, les validations en attente et traiter une demande manager."
        if role == "RH":
            return "Je peux recuperer les stats RH, lister les demandes globales et traiter une demande RH."
        if role == "ADMIN":
            return "Je peux consulter les notifications et les informations systeme disponibles."
        return "Je peux creer un conge, une autorisation, un teletravail, demander un document, ouvrir un document ou lister vos demandes."

    def _forbidden_message(self, role: str, intent: str) -> str:
        if role == "EMPLOYEE":
            return "Cette action est reservee aux managers ou aux RH."
        if role == "MANAGER" and intent == GET_RH_STATS:
            return "Les statistiques RH sont reservees au role RH."
        return "Cette action n'est pas disponible pour votre role."

    def _question_message(self, intent: str) -> str:
        if intent == CREATE_LEAVE:
            return "Confirmez la creation du conge avec les dates souhaitees."
        if intent == CREATE_AUTORISATION:
            return "Confirmez la creation de l'autorisation avec la date, les heures et le type."
        if intent == CREATE_TELEWORK:
            return "Confirmez la creation du teletravail avec la periode souhaitee."
        if intent == REQUEST_DOCUMENT:
            return "Confirmez la demande du document a generer."
        if intent in {"APPROVE_REQUEST", "REJECT_REQUEST", PROCESS_REQUEST}:
            return "Confirmez explicitement l'action a executer sur la demande."
        return "Je peux executer cette action si vous me le demandez explicitement."

    def _missing_prompt(self, intent: str, entities: dict[str, Any], required: list[str]) -> str:
        errors = entities.get("validation_errors") or []
        if "invalid_date_range" in errors:
            return "La date de fin doit etre posterieure ou egale a la date de debut."
        if "invalid_time_range" in errors:
            return "L'heure de fin doit etre posterieure a l'heure de debut."
        if intent == CREATE_LEAVE:
            return "Precisez la date de debut et la date de fin du conge."
        if intent == CREATE_AUTORISATION:
            return "Precisez la date, l'heure de debut, l'heure de fin et le type d'autorisation."
        if intent == CREATE_TELEWORK:
            return "Precisez la date de debut et la date de fin du teletravail."
        if intent == REQUEST_DOCUMENT:
            return "Precisez le type de document souhaite."
        if intent == OPEN_DOCUMENT:
            return "Precisez l'identifiant du document a ouvrir."
        if intent in {"APPROVE_REQUEST", "REJECT_REQUEST"}:
            return "Precisez le type de demande et son identifiant."
        if intent == PROCESS_REQUEST:
            return "Precisez le type de demande, son identifiant et la decision a appliquer."
        return f"Informations manquantes: {', '.join(required)}."

    def _action_message(self, intent: str) -> str:
        if intent == GET_LEAVE_BALANCE:
            return "Je consulte votre solde de conges."
        if intent == GET_NOTIFICATIONS:
            return "Je recupere vos notifications."
        if intent == GET_MY_REQUESTS:
            return "Je recupere vos demandes."
        if intent == GET_TEAM_REQUESTS:
            return "Je recupere les demandes equipe."
        if intent == GET_PENDING_VALIDATIONS:
            return "Je recupere les validations en attente."
        if intent == GET_RH_STATS:
            return "Je recupere les statistiques RH."
        if intent == GET_ALL_REQUESTS:
            return "Je recupere toutes les demandes RH."
        if intent == CREATE_LEAVE:
            return "Je cree votre demande de conge."
        if intent == CREATE_AUTORISATION:
            return "Je cree votre demande d'autorisation."
        if intent == CREATE_TELEWORK:
            return "Je cree votre demande de teletravail."
        if intent == REQUEST_DOCUMENT:
            return "Je cree votre demande de document."
        if intent == OPEN_DOCUMENT:
            return "J'ouvre le document demande."
        if intent == PROCESS_REQUEST:
            return "Je traite la demande RH."
        if intent == "APPROVE_REQUEST":
            return "Je valide la demande manager."
        if intent == "REJECT_REQUEST":
            return "Je refuse la demande manager."
        if is_query_intent(intent) or is_navigation_intent(intent):
            return "Je traite votre demande."
        return "Je traite votre demande."

    def _decision(
        self,
        *,
        decision_type: str,
        status: str,
        intent: str,
        message: str,
        action: str | None = None,
        workflow: str | None = None,
        entities: dict[str, Any] | None = None,
        missing_fields: list[str] | None = None,
        data: dict[str, Any] | None = None,
        resume: bool = False,
    ) -> dict[str, Any]:
        payload_entities = dict(entities or {})
        return {
            "type": decision_type,
            "status": status,
            "message": message,
            "action": action,
            "workflow": workflow,
            "resume": resume,
            "data": data or payload_entities,
            "intent": intent,
            "entities": payload_entities,
            "missing_fields": list(missing_fields or []),
        }
