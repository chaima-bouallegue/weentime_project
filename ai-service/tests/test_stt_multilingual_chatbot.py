from __future__ import annotations

from app.nlp.language_detector import detect_language
from app.nlp.normalization import normalize_text
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
