from __future__ import annotations

import re

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
LATIN_RE = re.compile(r"[a-zA-ZÀ-ÿ']+")

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
}

TN_HINTS = {
    "nheb",
    "n7eb",
    "nhib",
    "bghit",
    "ghodwa",
    "pointi",
    "npointi",
    "nokhrej",
    "konji",
    "ena",
    "chkon",
    "kadeh",
    "swaye3",
    "khirja",
    "dok",
    "taw",
}


def detect_language(text: str | None) -> str:
    """Return one of the supported routing languages: fr, en, ar, or tn."""
    value = (text or "").strip().lower()
    if not value:
        return "fr"
    if ARABIC_RE.search(value):
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
