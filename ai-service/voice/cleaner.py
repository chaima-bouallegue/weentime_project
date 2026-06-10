from __future__ import annotations

import re
import unicodedata

SHORT_COMMANDS = {
    "bonjour",
    "salut",
    "coucou",
    "hello",
    "hi",
    "oui",
    "non",
    "ok",
    "yes",
    "no",
    "نعم",
    "لا",
    "conge",
    "congé",
    "ghodwa",
    "npointi",
    "pointi",
    "pointage",
    "nokhrej",
    "teletravail",
    "télétravail",
    "autorisation",
    "مرحبا",
}

SHORT_COMMAND_ALIASES = {
    "conge": "congé",
    "télé travail": "télétravail",
}


def _is_repeated_sequence(words: list[str]) -> bool:
    if len(words) < 4:
        return False

    for chunk_size in range(1, min(4, len(words) // 2) + 1):
        if len(words) % chunk_size != 0:
            continue
        chunk = words[:chunk_size]
        if chunk * (len(words) // chunk_size) == words:
            return True
    return False


def clean_transcription(text: str | None):
    if not text:
        return None

    normalized = unicodedata.normalize("NFC", str(text))
    normalized = re.sub(r"\s+", " ", normalized).strip().lower()
    normalized = re.sub(r"[^\w\s\-']", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized:
        return None
    normalized = SHORT_COMMAND_ALIASES.get(normalized, normalized)

    words = [word for word in normalized.split(" ") if word]
    if len(words) <= 2 and normalized in SHORT_COMMANDS:
        return normalized
    if len(words) < 2:
        return None

    if len(set(words)) <= 2 and len(words) >= 4:
        return None

    if normalized.count("bien") > 3:
        return None

    if _is_repeated_sequence(words):
        return None

    repeated_runs = 0
    for previous, current in zip(words, words[1:]):
        if previous == current:
            repeated_runs += 1
    if repeated_runs >= max(2, len(words) // 3):
        return None

    return normalized
