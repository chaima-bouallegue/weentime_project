from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.voice.voice_response_optimizer import optimize_voice_response


def context(role: str = "EMPLOYEE", language: str = "fr") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=1,
        role=role,
        entreprise_id=None if role == "ADMIN" else 9,
        token="token",
        language=language,
        metadata={"jwt_verified": True, "language": language},
    )


def digest(role: str = "EMPLOYEE") -> dict:
    return {
        "kind": "role_intelligence_digest",
        "role": role,
        "tenantId": 9,
        "sections": [],
        "priorities": [
            {
                "id": "p1",
                "type": "pending",
                "title": "Pending item",
                "summary": "One item requires attention.",
            }
        ],
        "reminders": [],
        "warnings": [],
        "requiresConfirmation": False,
    }


def optimize(language: str, role: str = "EMPLOYEE") -> AgentResponse:
    response = AgentResponse(
        type="answer",
        text="Digest role with many details.",
        intent="role_intelligence.digest",
        confidence=0.9,
        actionResult=digest(role),
    )
    return optimize_voice_response(response, context(role, language))


def test_french_voice_briefing_stays_french() -> None:
    response = optimize("fr")

    assert response.text.startswith("Votre briefing")


def test_english_voice_briefing_stays_english() -> None:
    response = optimize("en")

    assert response.text.startswith("Your personal briefing")


def test_tunisian_voice_briefing_uses_tunisian_friendly_style() -> None:
    response = optimize("tn")

    assert response.text.startswith("Brief mteek")


def test_arabic_voice_briefing_stays_arabic_text() -> None:
    response = optimize("ar", role="ADMIN")

    assert response.text.startswith("ملخص")
