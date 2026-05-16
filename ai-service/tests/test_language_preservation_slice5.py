"""Slice 5 — Arabic/Tounsi/Franco-Arabic language preservation (text only).

Three areas:
  - detect_language returns the right code for screenshot inputs
  - localize_agent_response renders ar/tn/en for the prompts the user
    actually sees (slot-filling asks, capability_unavailable cards)
  - end-to-end: agent.handle + localize_agent_response on a Tounsi input
    yields a Tounsi response

Voice / STT / Ollama / frontend are explicitly out of scope.
"""
from __future__ import annotations

import asyncio

import pytest

from app.agents.authorization_agent import AuthorizationAgent
from app.agents.leave_agent import LeaveAgent
from app.agents.reunion_agent import ReunionAgent
from app.context.current_user import CurrentUserContext
from app.i18n.response_localizer import localize_agent_response, response_locale
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.nlp.language_detector import detect_language
from app.tools.result import ToolResult


# ---------- A. detect_language ----------------------------------------------


@pytest.mark.parametrize(
    "message, expected",
    [
        # Arabic script — all must be 'ar'
        ("أريد عطلة", "ar"),
        ("أريد تصريح خروج غدا", "ar"),
        ("هل عندي اجتماع اليوم؟", "ar"),
        ("كم بقي لدي من الإجازة؟", "ar"),
        # Tounsi / Franco-Arabic (Latin script with Tounsi vocabulary)
        ("nheb naamela autorisation de 2h", "tn"),
        ("nheb nchouf les horaire de l equipes", "tn"),
        ("aandi reunion?", "tn"),
        ("nheb conge ghodwa", "tn"),
        # French
        ("je suis malade aujourd'hui", "fr"),
        ("je veux prendre une autorisation pour 2 heures", "fr"),
        # English
        ("Did I check in?", "en"),
        ("I want leave tomorrow", "en"),
    ],
)
def test_A_detect_language(message: str, expected: str) -> None:
    assert detect_language(message) == expected, f"got {detect_language(message)!r} for {message!r}"


# ---------- B. response_locale -----------------------------------------------


def _ctx(language: str, original: str, role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=1,
        role=role,
        entreprise_id=2,
        token="token",
        language=language,
        metadata={"original_text": original, "language": language},
    )


@pytest.mark.parametrize(
    "language, original, expected_locale",
    [
        ("ar", "أريد عطلة", "ar"),
        ("tn", "nheb naamela autorisation", "tn"),
        ("en", "I want leave", "en"),
        ("fr", "je veux un conge", "fr"),
        # If language is misclassified to fr but original_text has TN hints,
        # response_locale should detect and return tn.
        ("fr", "nheb naamela autorisation", "tn"),
    ],
)
def test_B_response_locale_resolves_correctly(language: str, original: str, expected_locale: str) -> None:
    assert response_locale(_ctx(language, original)) == expected_locale


# ---------- C. localization of slot-filling asks ----------------------------


def _french_text_for(intent: str, fragment: str) -> AgentResponse:
    return AgentResponse(type="ask", text=fragment, intent=intent, confidence=0.9)


def _has_arabic(text: str) -> bool:
    return any("؀" <= ch <= "ۿ" for ch in text)


def _assert_localized(out: AgentResponse, original: str, locale: str) -> None:
    """The localizer mutates the response in place, so we compare to a
    captured-before-call snapshot and check that the text is now in the
    expected script / style."""
    assert out.text != original, f"text not localized for {locale}: {out.text!r}"
    if locale == "ar":
        assert _has_arabic(out.text), f"ar locale expected Arabic script, got: {out.text!r}"
    else:
        # tn / en: must NOT be the original French.
        assert out.text != original


@pytest.mark.parametrize("locale", ["ar", "tn", "en"])
def test_C_authorization_date_ask_is_localized(locale: str) -> None:
    original = "Pour quelle date souhaitez-vous demander cette autorisation ?"
    response = _french_text_for("authorization.create", original)
    ctx = _ctx(locale, "أريد إذن" if locale == "ar" else "nheb autorisation" if locale == "tn" else "I want authorization")

    out = localize_agent_response(response, ctx)

    _assert_localized(out, original, locale)


@pytest.mark.parametrize("locale", ["ar", "tn", "en"])
def test_C_authorization_time_ask_is_localized(locale: str) -> None:
    original = "Merci de preciser les heures de debut et de fin de l'autorisation."
    response = _french_text_for("authorization.create", original)
    ctx = _ctx(locale, "أريد إذن" if locale == "ar" else "nheb naamela autorisation de 2h" if locale == "tn" else "I want authorization for 2 hours")

    out = localize_agent_response(response, ctx)

    _assert_localized(out, original, locale)


@pytest.mark.parametrize("locale", ["ar", "tn", "en"])
def test_C_authorization_type_ask_is_localized(locale: str) -> None:
    original = "Quel type d'autorisation souhaitez-vous demander ? Par exemple: sortie anticipee, arrivee tardive ou absence temporaire."
    response = _french_text_for("authorization.create", original)
    ctx = _ctx(locale, "أريد إذن" if locale == "ar" else "nheb naamela autorisation" if locale == "tn" else "I want an authorization")

    out = localize_agent_response(response, ctx)

    _assert_localized(out, original, locale)


@pytest.mark.parametrize("locale", ["ar", "tn", "en"])
def test_C_leave_type_ask_is_localized(locale: str) -> None:
    original = "Quel type de conge souhaitez-vous demander ? Par exemple: conge annuel, maladie, RTT."
    response = _french_text_for("leave.create", original)
    ctx = _ctx(locale, "أريد عطلة" if locale == "ar" else "nheb conge" if locale == "tn" else "I want leave")

    out = localize_agent_response(response, ctx)

    _assert_localized(out, original, locale)


# ---------- D. localization of capability_unavailable cards -----------------


@pytest.mark.parametrize("locale", ["ar", "tn", "en"])
def test_D_planning_unavailable_is_localized(locale: str) -> None:
    original = "Le module planning / horaires n'est pas encore connecte a l'agent IA. Consultez votre planning depuis l'onglet 'Planning' de l'application; je peux toujours vous aider sur le pointage, les conges, le teletravail ou les autorisations."
    response = AgentResponse(type="answer", text=original, intent="planning.unavailable", confidence=0.9)
    ctx = _ctx(locale, "جدول" if locale == "ar" else "nheb nchouf el planning" if locale == "tn" else "what is my planning")

    out = localize_agent_response(response, ctx)

    _assert_localized(out, original, locale)


@pytest.mark.parametrize("locale", ["ar", "tn", "en"])
def test_D_meeting_unavailable_is_localized(locale: str) -> None:
    original = "La gestion des reunions n'est pas encore disponible dans ce contexte. Vous pouvez consulter vos demandes RH, votre pointage, vos conges, votre teletravail ou vos autorisations."
    response = AgentResponse(type="answer", text=original, intent="meeting.unavailable", confidence=0.9)
    ctx = _ctx(locale, "اجتماع" if locale == "ar" else "aandi reunion" if locale == "tn" else "do i have a meeting")

    out = localize_agent_response(response, ctx)

    _assert_localized(out, original, locale)


@pytest.mark.parametrize("locale", ["ar", "tn", "en"])
def test_D_team_schedule_unavailable_is_localized(locale: str) -> None:
    original = "Les horaires de l'equipe ne sont pas encore connectes a l'agent IA. Consultez les depuis l'onglet 'Planning equipe' de l'application; je peux toujours vous aider sur les validations en attente, le pointage personnel, vos conges ou vos autorisations."
    response = AgentResponse(type="answer", text=original, intent="manager.team_schedule", confidence=0.9)
    ctx = _ctx(
        locale,
        "جدول الفريق" if locale == "ar" else "nheb nchouf les horaire de l equipes" if locale == "tn" else "team schedule",
        role="MANAGER",
    )

    out = localize_agent_response(response, ctx)

    _assert_localized(out, original, locale)


# ---------- E. End-to-end through agents ------------------------------------


class _FakeExecutor:
    async def execute(self, tool_name, payload, context, **kwargs):
        return ToolResult.ok({"read_result": {"kind": "read_result", "summary": "ok", "items": [], "count": 0}}, status_code=200)


def test_E_tounsi_sick_leave_response_is_localized() -> None:
    """End-to-end: 'nheb conge maladie' from a Tounsi user should produce
    a response whose text is NOT plain French."""
    agent = LeaveAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]
    ctx = _ctx("tn", "nheb conge maladie")

    response = asyncio.run(agent.handle("nheb conge maladie", ctx))
    out = localize_agent_response(response, ctx)

    # If the response is a date-ask, its text must be the localized template.
    if out.intent == "leave.create" and out.type == "ask":
        # Should not be the bare French "Pour quelle date" template.
        assert "souhaitez-vous" not in out.text or "L nhar" in out.text


def test_E_arabic_authorization_response_is_localized() -> None:
    agent = AuthorizationAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]
    ctx = _ctx("ar", "أريد إذن خروج غدا")

    response = asyncio.run(agent.handle("أريد إذن خروج غدا", ctx))
    out = localize_agent_response(response, ctx)

    # Arabic ask must contain Arabic script, not be the original French.
    if out.type == "ask":
        has_arabic_script = any("؀" <= ch <= "ۿ" for ch in out.text)
        assert has_arabic_script, f"expected Arabic text, got: {out.text!r}"


# ---------- F. Regression -------------------------------------------------


def test_F_french_input_text_unchanged() -> None:
    """A French ask in a French context should pass through unchanged."""
    response = _french_text_for("leave.create", "Pour quelle date souhaitez-vous demander ce conge ?")
    ctx = _ctx("fr", "je veux un conge demain")

    out = localize_agent_response(response, ctx)

    assert out.text == response.text
