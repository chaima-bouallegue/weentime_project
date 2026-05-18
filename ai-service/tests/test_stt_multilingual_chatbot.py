from __future__ import annotations

import asyncio

import pytest

from app.nlp.language_detector import detect_language
from app.nlp.normalization import normalize_text
from chatbot_test_helpers import send_chatbot_message
from voice.cleaner import clean_transcription


def test_stt_cleaner_accepts_short_tunisian_hr_commands() -> None:
    assert clean_transcription("npointi") == "npointi"
    assert clean_transcription("ghodwa") == "ghodwa"
    assert clean_transcription("teletravail") == "teletravail"


def test_language_detector_marks_tunisian_franco_commands() -> None:
    assert detect_language("nheb conge ghodwa") == "tn"
    assert detect_language("baad ghodwa nheb teletravail") == "tn"


def test_normalization_preserves_tunisian_domain_meaning() -> None:
    normalized = normalize_text("nheb npointi", "tn")
    assert "point" in normalized or "pointer" in normalized


def test_arabic_voice_text_is_detected_as_arabic() -> None:
    assert detect_language("أريد إجازة غدا") == "ar"


@pytest.mark.parametrize(
    ("transcript", "role", "expected_intent"),
    [
        ("Je veux poser un congé demain", "EMPLOYEE", "leave."),
        ("Ai-je pointé aujourd'hui ?", "EMPLOYEE", "attendance.status"),
        ("I need leave tomorrow", "EMPLOYEE", "leave."),
        ("Did I check in?", "EMPLOYEE", "attendance.status"),
        ("أريد إجازة غدا", "EMPLOYEE", "leave."),
        ("هل سجلت الحضور؟", "EMPLOYEE", "attendance.status"),
        ("nheb conge ghodwa", "EMPLOYEE", "leave."),
        ("nheb npointi", "EMPLOYEE", "attendance."),
        ("pointit ou nn", "EMPLOYEE", "attendance.status"),
        ("aandi meeting", "EMPLOYEE", "reunion."),
        ("rani jit", "EMPLOYEE", "attendance.check_in"),
        ("rani khrajt", "EMPLOYEE", "attendance.check_out"),
        ("chkoun ma pointach", "MANAGER", "attendance.team_presence"),
    ],
)
def test_voice_transcripts_route_to_same_chatbot_intents(
    transcript: str,
    role: str,
    expected_intent: str,
) -> None:
    response, _ = asyncio.run(
        send_chatbot_message(
            transcript,
            role=role,
            language=detect_language(transcript),
        )
    )

    if expected_intent.endswith("."):
        assert response.intent.startswith(expected_intent), response.intent
    else:
        assert response.intent == expected_intent
    assert not response.intent.startswith("fallback.")
