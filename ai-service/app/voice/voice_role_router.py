from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.intelligence import RoleIntelligenceService
from app.models.agent_models import AgentResponse
from app.nlp.normalization import normalize_text

from .voice_response_optimizer import optimize_voice_response

_COMMON_MARKERS = (
    "what should i do today",
    "what should i do",
    "today summary",
    "today's summary",
    "give me today's summary",
    "give me today summary",
    "daily summary",
    "daily briefing",
    "briefing",
    "summary today",
    "resume du jour",
    "resume aujourd hui",
    "résumé du jour",
    "résumé aujourd hui",
    "quoi faire aujourd hui",
    "que dois je faire",
    "que dois-je faire",
    "que dois je traiter",
    "que dois-je traiter",
    "شنوة نعمل",
    "ماذا افعل",
    "ما الذي يتطلب الانتباه",
    "chnowa naamel",
    "chnoa naamel",
    "chnowa nعمل",
)
_RH_MARKERS = (
    "what requires attention",
    "requires attention",
    "attention rh",
    "backlog rh",
    "validations rh",
    "hr attention",
    "hr backlog",
)
_ADMIN_MARKERS = (
    "system health",
    "health system",
    "sante systeme",
    "santé système",
    "etat systeme",
    "état système",
    "diagnostic systeme",
    "admin health",
    "صحة النظام",
)
_VALID_ROLES = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}


class VoiceRoleRouter:
    """Routes voice-only briefing prompts into safe Role Intelligence."""

    def __init__(self, executor: Any, service: RoleIntelligenceService | None = None) -> None:
        self.executor = executor
        self.service = service or RoleIntelligenceService(executor)

    def can_handle(self, transcript: str, context: CurrentUserContext) -> bool:
        role = _canonical_role(context.role)
        if role not in _VALID_ROLES:
            return False
        text = _normalized_voice_text(transcript, context)
        if not text:
            return False
        if _is_admin_prompt(text):
            return role == "ADMIN"
        if _is_rh_prompt(text):
            return role == "RH"
        return any(marker in text for marker in _COMMON_MARKERS)

    async def handle(self, transcript: str, context: CurrentUserContext) -> AgentResponse:
        role = _canonical_role(context.role)
        if role not in _VALID_ROLES:
            return AgentResponse(
                type="error",
                text="Ce role n'est pas supporte pour un briefing vocal.",
                intent="voice_role.unsupported_role",
                confidence=0.85,
                requiresConfirmation=False,
                actionResult={
                    "kind": "voice_role_briefing",
                    "role": role,
                    "requiresConfirmation": False,
                    "warnings": ["unsupported_role"],
                },
            )
        if not context.is_verified:
            return AgentResponse(
                type="error",
                text="Contexte utilisateur non verifie. Reconnectez-vous avant de demander un briefing vocal.",
                intent="voice_role.unverified_context",
                confidence=0.95,
                requiresConfirmation=False,
                actionResult={
                    "kind": "role_intelligence_digest",
                    "role": role,
                    "tenantId": context.tenant_id,
                    "sections": [],
                    "priorities": [],
                    "warnings": ["unverified_context"],
                    "requiresConfirmation": False,
                },
            )

        response = await self.service.build_response(_canonical_prompt_for(role, transcript), context)
        response.intent = f"voice_role.{role.lower()}_briefing"
        return optimize_voice_response(response, context)


def _canonical_role(value: str | None) -> str:
    return (value or "EMPLOYEE").upper().replace("ROLE_", "")


def _normalized_voice_text(transcript: str, context: CurrentUserContext) -> str:
    language = str(context.language or context.metadata.get("language") or "").lower() or None
    return normalize_text(transcript, language)


def _is_admin_prompt(text: str) -> bool:
    return any(marker in text for marker in _ADMIN_MARKERS)


def _is_rh_prompt(text: str) -> bool:
    return any(marker in text for marker in _RH_MARKERS)


def _canonical_prompt_for(role: str, transcript: str) -> str:
    if role == "MANAGER":
        return "management digest priorites"
    if role == "RH":
        return "hr digest backlog what requires attention"
    if role == "ADMIN":
        return "admin digest diagnostic system health"
    return "digest de mes priorites what should i do today"
