from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.voice.voice_response_optimizer import optimize_voice_response
from app.voice.voice_summary_builder import VoiceSummaryBuilder


def context(role: str = "EMPLOYEE", language: str = "fr") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=1,
        role=role,
        entreprise_id=None if role == "ADMIN" else 9,
        token="token",
        language=language,
        metadata={"jwt_verified": True, "language": language},
    )


def digest(role: str = "EMPLOYEE", priorities=None, warnings=None):
    return {
        "kind": "role_intelligence_digest",
        "role": role,
        "tenantId": 9,
        "sections": [{"title": "Pointage", "status": "ok", "summary": "ok", "toolName": "get_pointage_status"}],
        "priorities": priorities or [
            {
                "id": "p1",
                "type": "missing_checkout",
                "title": "Sortie manquante",
                "summary": "Une entree est detectee sans sortie visible.",
            }
        ],
        "reminders": [],
        "warnings": warnings or [],
        "requiresConfirmation": False,
    }


def test_voice_summary_builder_creates_concise_employee_summary() -> None:
    text = VoiceSummaryBuilder().build(digest("EMPLOYEE"), context("EMPLOYEE", "fr"))

    assert text.startswith("Votre briefing personnel")
    assert "Sortie manquante" in text
    assert len(text) < 260


def test_voice_summary_builder_localizes_english_manager_summary() -> None:
    text = VoiceSummaryBuilder().build(digest("MANAGER"), context("MANAGER", "en"))

    assert text.startswith("Your team briefing")
    assert "Main focus" in text


def test_voice_summary_builder_localizes_tunisian_summary() -> None:
    text = VoiceSummaryBuilder().build(digest("EMPLOYEE"), context("EMPLOYEE", "tn"))

    assert text.startswith("Brief mteek")
    assert "Ahamm haja" in text


def test_voice_summary_builder_localizes_arabic_summary() -> None:
    text = VoiceSummaryBuilder().build(digest("ADMIN"), context("ADMIN", "ar"))

    assert text.startswith("ملخص")


def test_voice_response_optimizer_shortens_role_digest_and_preserves_metadata() -> None:
    response = AgentResponse(
        type="answer",
        text="Long role digest text. " * 80,
        intent="role_intelligence.employee_digest",
        confidence=0.9,
        actionResult=digest("EMPLOYEE"),
    )

    optimized = optimize_voice_response(response, context("EMPLOYEE", "fr"))

    assert len(optimized.text) < 260
    assert optimized.actionResult is not None
    assert optimized.actionResult["voice"]["optimized"] is True
    assert optimized.actionResult["voice"]["reason"] == "role_intelligence_digest"


def test_voice_response_optimizer_preserves_confirmations() -> None:
    response = AgentResponse(
        type="confirm_action",
        text="Confirmez-vous cette demande ?",
        intent="leave.create",
        confidence=0.95,
        requiresConfirmation=True,
        confirmationId="confirm-1",
        actionResult={"pending": True},
    )

    optimized = optimize_voice_response(response, context("EMPLOYEE", "fr"))

    assert optimized.text == "Confirmez-vous cette demande ?"
    assert optimized.actionResult == {"pending": True}
    assert optimized.confirmationId == "confirm-1"
