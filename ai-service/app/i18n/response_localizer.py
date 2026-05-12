from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse

from .templates import PHRASES

TN_HINTS = ("nheb", "n7eb", "ghodwa", "npointi", "nokhrej", "konji", "swaye3")


def response_locale(context: CurrentUserContext) -> str:
    original = str(context.metadata.get("original_text") or "").lower()
    language = (context.language or context.metadata.get("language") or "fr").lower()
    if language == "tn" or any(term in original for term in TN_HINTS):
        return "tn"
    if language in {"en", "ar"}:
        return language
    return "fr"


def localize_agent_response(response: AgentResponse, context: CurrentUserContext) -> AgentResponse:
    locale = response_locale(context)
    if locale == "fr":
        return response

    key = _template_key(response)
    if key:
        response.text = PHRASES[key].get(locale) or response.text
        return response

    if response.type == "error" and _looks_like_unavailable(response.text):
        response.text = PHRASES["unavailable.backend"].get(locale) or response.text
    elif locale == "en" and response.type == "ask" and "motif" in response.text.lower():
        response.text = "What reason should I add?"
    elif locale == "ar" and response.type == "ask" and "motif" in response.text.lower():
        response.text = "ما هو السبب؟"
    elif locale == "tn" and response.type == "ask" and "motif" in response.text.lower():
        response.text = "Chnowa el motif?"
    return response


def _template_key(response: AgentResponse) -> str | None:
    text = (response.text or "").lower()
    intent = response.intent or ""
    if intent == "attendance.unknown":
        return "ask.attendance.choice"
    if intent == "leave.create":
        if "date" in text:
            return "ask.date.leave"
        if "motif" in text:
            return "ask.reason.leave"
    if intent == "authorization.create" and "date" in text:
        return "ask.date.authorization"
    return None


def _looks_like_unavailable(text: str) -> bool:
    value = (text or "").lower()
    return "pas encore disponible" in value or "indisponible" in value or "capability" in value
