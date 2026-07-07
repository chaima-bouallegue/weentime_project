from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Literal

from app.models.agent_models import AgentResponse, ToolCallRecord

from .session_serializer import deserialize_agent_response
from .session_state import SessionState

RecoveryAction = Literal["none", "continue", "approve", "reject"]

POSITIVE_RECOVERY_TOKENS = {
    "approve",
    "approved",
    "confirme",
    "confirmer",
    "confirm",
    "d accord",
    "d'accord",
    "yes",
    "yes please",
    "oui",
    "ok",
    "okay",
    "behi",
    "ey",
    "نعم",
    "اوافق",
}
NEGATIVE_RECOVERY_TOKENS = {
    "annule",
    "cancel",
    "non",
    "no",
    "refuse",
    "لا",
}
CONTINUE_RECOVERY_TOKENS = {
    "complete previous",
    "continue",
    "continuer",
    "poursuivre",
    "reprendre",
    "suite",
    "continue previous",
    "واصل",
    "كمل",
}


@dataclass(slots=True)
class RecoveryDirective:
    action: RecoveryAction
    normalized_message: str

    @property
    def matched(self) -> bool:
        return self.action != "none"


def classify_recovery_message(message: str | None) -> RecoveryDirective:
    normalized = normalize_recovery_message(message)

    if normalized in POSITIVE_RECOVERY_TOKENS:
        return RecoveryDirective(action="approve", normalized_message=normalized)

    if normalized in NEGATIVE_RECOVERY_TOKENS:
        return RecoveryDirective(action="reject", normalized_message=normalized)

    if normalized in CONTINUE_RECOVERY_TOKENS:
        return RecoveryDirective(action="continue", normalized_message=normalized)

    for token in POSITIVE_RECOVERY_TOKENS:
        if re.search(rf"\b{re.escape(token)}\b", normalized):
            return RecoveryDirective(action="approve", normalized_message=normalized)

    for token in NEGATIVE_RECOVERY_TOKENS:
        if re.search(rf"\b{re.escape(token)}\b", normalized):
            return RecoveryDirective(action="reject", normalized_message=normalized)

    for token in CONTINUE_RECOVERY_TOKENS:
        if re.search(rf"\b{re.escape(token)}\b", normalized):
            return RecoveryDirective(action="continue", normalized_message=normalized)

    return RecoveryDirective(action="none", normalized_message=normalized)


def build_resume_response(session: SessionState) -> AgentResponse | None:
    response = deserialize_agent_response(session.last_safe_response)
    if response is not None:
        return response

    if isinstance(session.pending_confirmation, dict):
        confirmation_id = str(session.pending_confirmation.get("confirmation_id") or "").strip()
        if confirmation_id:
            tool_name = str(session.pending_confirmation.get("tool_name") or "pending_action")
            tool_arguments = session.pending_confirmation.get("tool_arguments")
            return AgentResponse(
                type="confirm_action",
                text="Une confirmation est en attente. Repondez oui pour confirmer ou non pour annuler.",
                intent="confirmation.resume",
                confidence=1.0,
                requiresConfirmation=True,
                confirmationId=confirmation_id,
                toolCalls=[
                    ToolCallRecord(
                        name=tool_name,
                        arguments=dict(tool_arguments) if isinstance(tool_arguments, dict) else {},
                        status=str(session.pending_confirmation.get("status") or "pending_confirmation"),
                    )
                ],
                actionResult={"kind": "session_recovery", "status": "pending_confirmation"},
            )

    if isinstance(session.pending_flow, dict):
        question = str(session.pending_flow.get("last_question") or "").strip() or "Pouvez-vous reprendre votre derniere demande ?"
        intent = str(session.pending_flow.get("intent") or "conversation.resume")
        return AgentResponse(
            type="ask",
            text=question,
            intent=intent,
            confidence=1.0,
            actionResult={"kind": "session_recovery", "status": "pending_flow", "pendingFlow": dict(session.pending_flow)},
        )
    return None


def build_resume_unavailable_response() -> AgentResponse:
    return AgentResponse(
        type="answer",
        text="Aucune action en cours a reprendre.",
        intent="conversation.resume_unavailable",
        confidence=1.0,
        actionResult={"kind": "session_recovery", "status": "not_found"},
    )


def normalize_recovery_message(value: str | None) -> str:
    lowered = str(value or "").strip().lower().replace("â€™", "'")
    lowered = (
        lowered.replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("à", "a")
        .replace("ù", "u")
        .replace("ô", "o")
    )
    return " ".join(lowered.split())
