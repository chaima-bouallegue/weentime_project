from __future__ import annotations

import asyncio

import pytest

from app.nlp.language_detector import detect_language
from chatbot_test_helpers import send_chatbot_message


EN_FORBIDDEN = (
    "Donnee",
    "Donnée",
    "donnees",
    "données",
    "indisponible",
    "Statistiques RH",
    "employe(s)",
    "demande(s)",
    "priorite",
    "priorité",
)


def _response_language(response) -> str | None:
    action = response.actionResult if isinstance(response.actionResult, dict) else {}
    return action.get("response_language")


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)


@pytest.mark.parametrize(
    ("message", "expected_language"),
    [
        ("Show my daily summary", "en"),
        ("Montre mon résumé du jour", "fr"),
        ("شنوة ملخص اليوم", "tn"),
        ("chnowa résumé lyoum", "tn"),
    ],
)
def test_employee_digest_matches_latest_message_language(message: str, expected_language: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="EMPLOYEE", language=detect_language(message)))

    assert _response_language(response) == expected_language
    if expected_language == "en":
        assert response.text.startswith("Employee digest:")
        assert not any(fragment in response.text for fragment in EN_FORBIDDEN)
    if message.startswith("شنوة"):
        assert _has_arabic(response.text)
    if expected_language == "tn" and not message.startswith("شنوة"):
        assert "Résumé" in response.text or "Stats" in response.text


@pytest.mark.parametrize(
    ("message", "expected_language", "expected_fragment"),
    [
        ("Show RH stats", "en", "HR statistics:"),
        ("Affiche stats RH", "fr", "Statistiques RH"),
        ("warini stats RH", "tn", "Stats RH"),
    ],
)
def test_rh_stats_match_latest_message_language(message: str, expected_language: str, expected_fragment: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="RH", language=detect_language(message)))

    assert _response_language(response) == expected_language
    assert expected_fragment in response.text
    if expected_language == "en":
        assert not any(fragment in response.text for fragment in EN_FORBIDDEN)


@pytest.mark.parametrize(
    ("message", "expected_language"),
    [
        ("Show team summary", "en"),
        ("Résumé équipe aujourd’hui", "fr"),
        ("chnowa résumé équipe lyoum", "tn"),
    ],
)
def test_manager_digest_matches_latest_message_language(message: str, expected_language: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="MANAGER", language=detect_language(message)))

    assert _response_language(response) == expected_language
    if expected_language == "en":
        assert response.text.startswith("Manager digest:")
        assert not any(fragment in response.text for fragment in EN_FORBIDDEN)
    if expected_language == "tn":
        assert response.text.startswith("Résumé manager:")


@pytest.mark.parametrize(
    ("message", "expected_language", "expected_fragment"),
    [
        ("Show platform status", "en", "Admin digest:"),
        ("Affiche état plateforme", "fr", "Aucune"),
    ],
)
def test_admin_status_matches_latest_message_language(message: str, expected_language: str, expected_fragment: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="ADMIN", language=detect_language(message)))

    assert _response_language(response) == expected_language
    assert expected_fragment in response.text
    if expected_language == "en":
        assert not any(fragment in response.text for fragment in EN_FORBIDDEN)
