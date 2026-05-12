from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.i18n.response_localizer import localize_agent_response, response_locale
from app.models.agent_models import AgentResponse


def context(language: str, original: str) -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role="EMPLOYEE", entreprise_id=2, token="token", language=language, metadata={"original_text": original})


def test_english_ask_is_localized() -> None:
    response = AgentResponse(type="ask", text="Pour quelle date souhaitez-vous demander ce conge ?", intent="leave.create", confidence=0.9)

    localized = localize_agent_response(response, context("en", "I want leave"))

    assert localized.text == "For which date would you like to request leave?"


def test_arabic_ask_is_localized() -> None:
    response = AgentResponse(type="ask", text="Pour quelle date souhaitez-vous demander ce conge ?", intent="leave.create", confidence=0.9)

    localized = localize_agent_response(response, context("ar", "أريد عطلة"))

    assert "تاريخ" in localized.text


def test_tunisian_locale_detected_from_franco_input() -> None:
    ctx = context("tn", "nheb conge ghodwa")

    assert response_locale(ctx) == "tn"
    response = AgentResponse(type="ask", text="Quel motif souhaitez-vous indiquer pour cette demande de conge ?", intent="leave.create", confidence=0.9)
    localized = localize_agent_response(response, ctx)

    assert "motif" in localized.text.lower()
