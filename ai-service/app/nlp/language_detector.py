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
