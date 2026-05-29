from __future__ import annotations

import re
from typing import Any, Mapping

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
LATIN_RE = re.compile(r"[a-zA-ZÀ-ÿ']+")
SUPPORTED_LANGUAGES = {"fr", "en", "ar", "tn"}
LANGUAGE_METADATA_KEYS = (
    "response_language",
    "responseLanguage",
    "requested_language",
    "requestedLanguage",
    "detectedLanguage",
    "detected_language",
    "stt_language",
    "sttLanguage",
    "language",
)

FR_HINTS = {
    "je",
    "veux",
    "conge",
    "congé",
    "demain",
    "pointage",
    "pointe",
    "pointer",
    "sortie",
    "entree",
    "entrée",
    "teletravail",
    "télétravail",
    "document",
    "attestation",
    "autorisation",
    "heures",
    "semaine",
    "solde",
    "statut",
    "demande",
    "demander",
    "besoin",
    "souhaite",
    "voudrais",
    "vacances",
    "absence",
    "presence",
    "equipe",
    "aujourd",
    "hui",
    "affiche",
    "montre",
    "resume",
    "résumé",
    "jour",
    "etat",
    "état",
    "plateforme",
    "stats",
}

EN_HINTS = {
    "i",
    "want",
    "request",
    "leave",
    "tomorrow",
    "check",
    "clock",
    "in",
    "out",
    "document",
    "telework",
    "remote",
    "hours",
    "week",
    "policy",
    "status",
    "attendance",
    "presence",
    "team",
    "admin",
    "manager",
    "open",
    "download",
    "tries",
    "my",
    "need",
    "would",
    "like",
    "from",
    "home",
    "show",
    "summary",
    "daily",
    "today",
    "platform",
    "stats",
    "statistics",
    "display",
    "please",
    "hello",
    "hi",
}

TN_HINTS = {
    "nheb",
    "n7eb",
    "nhib",
    "bghit",
    "tounsi",
    "tounes",
    "ghodwa",
    "baad",
    "ba3d",
    "pointi",
    "npointi",
    "pointit",
    "rani",
    "jit",
    "dakhla",
    "dakhel",
    "khrajt",
    "khrouj",
    "kharrej",
    "nokhrej",
    "konji",
    "congi",
    "ena",
    "chkon",
    "chnowa",
    "chkoun",
    "kadeh",
    "adech",
    "mazeli",
    "fama",
    "famma",
    "swaye3",
    "war9a",
    "khidma",
    "nkhdem",
    "khirja",
    "dok",
    "taw",
    # Possessives — "I have" colloquial forms used in "aandi reunion?",
    # "andi rdv", "3andi reunion".
    "aandi",
    "andi",
    "3andi",
    "i7awejli",
    # Verb forms common in slot-filling prompts.
    "naamel",
    "naamela",
    "najem",
    "aatini",
    "nzid",
    "nchouf",
    "tasrih",
    "warini",
    "lyoum",
    "hedha",
    "hetha",
    "kifeh",
    "9adeh",
    "9addeh",
    "ma3andich",
    "chniya",
    "chneya",
    "shnowa",
    "achnowa",
    "cahnowa",
}

ARABIC_TN_HINTS = {
    "شنوة",
    "شنو",
    "اشنو",
    "آشنو",
    "قداش",
    "فما",
    "كيفاش",
    "علاش",
}


def normalize_language_code(value: Any) -> str | None:
    """Normalize UI/STT/provider language hints to fr, en, ar, or tn."""
    normalized = str(value or "").strip().lower().replace("_", "-")
    if not normalized:
        return None
    if normalized in {"tn", "tunisian", "tounsi", "darija-tn", "franco-arabic", "franco-arabic-tn"}:
        return "tn"
    if normalized in SUPPORTED_LANGUAGES:
        return normalized
    if normalized.startswith("ar-tn") or normalized.endswith("-tn"):
        return "tn"
    if normalized.startswith("ar"):
        return "ar"
    if normalized.startswith("en"):
        return "en"
    if normalized.startswith("fr"):
        return "fr"
    return None


def detect_language_from_metadata(metadata: Mapping[str, Any] | None) -> str | None:
    """Return the first supported language hint carried by request metadata."""
    if not metadata:
        return None
    for key in LANGUAGE_METADATA_KEYS:
        language = normalize_language_code(metadata.get(key))
        if language:
            return language
    return None


def detect_language(text: str | None) -> str:
    """Return one of the supported routing languages: fr, en, ar, or tn."""
    value = (text or "").strip().lower()
    if not value:
        return "fr"
    if ARABIC_RE.search(value):
        if any(term in value for term in ARABIC_TN_HINTS):
            return "tn"
        return "ar"

    tokens = set(LATIN_RE.findall(value))
    if tokens & TN_HINTS:
        return "tn"

    fr_score = len(tokens & FR_HINTS)
    en_score = len(tokens & EN_HINTS)
    if en_score > fr_score and en_score > 0:
        return "en"
    if fr_score > 0:
        return "fr"
    if any(char in value for char in "éèêàùç"):
        return "fr"
    return "fr"


def resolve_response_language(
    text: str | None,
    metadata: Mapping[str, Any] | None = None,
    *,
    stt_language: str | None = None,
    fallback: str = "fr",
) -> str:
    """Resolve the language the assistant should answer in.

    Latest user text is strongest because browser locale metadata can be stale.
    Metadata/STT remain useful for empty or short confirmation flows.
    """
    value = (text or "").strip()
    metadata_language = detect_language_from_metadata(metadata)
    stt = normalize_language_code(stt_language)
    fallback_language = normalize_language_code(fallback) or "fr"

    if value and _has_text_language_signal(value):
        text_language = detect_language(value)
        if text_language in SUPPORTED_LANGUAGES:
            return text_language

    return metadata_language or stt or fallback_language


def response_script(text: str | None) -> str:
    return "arabic" if ARABIC_RE.search(text or "") else "latin"


def _has_text_language_signal(value: str) -> bool:
    lowered = value.strip().lower()
    if not lowered:
        return False
    if ARABIC_RE.search(lowered):
        return True
    tokens = set(LATIN_RE.findall(lowered))
    if tokens & (FR_HINTS | EN_HINTS | TN_HINTS):
        return True
    return any(char in lowered for char in "éèêàùç")
