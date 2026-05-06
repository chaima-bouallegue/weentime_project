from __future__ import annotations

import re
import unicodedata

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
ARABIC_DIACRITICS_RE = re.compile(r"[\u064B-\u065F\u0670]")
ARABIC_VARIANTS = str.maketrans(
    {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ى": "ي",
        "ؤ": "و",
        "ئ": "ي",
        "ة": "ه",
    }
)

LATIN_SYNONYMS = {
    "i would like": "je veux",
    "i want": "je veux",
    "i need": "je veux",
    "please create": "je veux",
    "please request": "je veux",
    "conges": "congé",
    "conge": "congé",
    "vacance": "congé",
    "vacances": "congé",
    "absence": "congé",
    "leave": "congé",
    "day off": "congé",
    "time off": "congé",
    "holiday": "congé",
    "holidays": "congé",
    "remote work": "télétravail",
    "work from home": "télétravail",
    "working from home": "télétravail",
    "telework": "télétravail",
    "wfh": "télétravail",
    "certificate": "document",
    "salary certificate": "attestation de salaire",
    "work certificate": "attestation de travail",
    "paper": "document",
    "pay slip": "bulletin",
    "payslip": "bulletin",
    "check in": "pointer mon entrée",
    "clock in": "pointer mon entrée",
    "sign in": "pointer mon entrée",
    "check out": "pointer ma sortie",
    "clock out": "pointer ma sortie",
    "sign out": "pointer ma sortie",
    "status": "statut",
    "state": "statut",
}

TUNISIAN_LATIN_SYNONYMS = {
    "nheb": "je veux",
    "n7eb": "je veux",
    "nhib": "je veux",
    "bghit": "je veux",
    "ghodwa": "demain",
    "pointi": "pointage",
    "npointi": "pointer mon entrée",
    "nokhrej": "pointer ma sortie",
    "konji": "congé",
    "swaye3": "heures",
}

ARABIC_SYNONYMS = {
    "قداش": "combien",
    "كداش": "combien",
    "باقيلي": "reste",
    "باقي": "reste",
    "نحب": "je veux",
    "نحبّ": "je veux",
    "احب": "je veux",
    "اريد": "je veux",
    "بدي": "je veux",
    "عايز": "je veux",
    "عطله": "congé",
    "عطلة": "congé",
    "اجازه": "congé",
    "اجازة": "congé",
    "رخصه": "congé",
    "رخصة": "congé",
    "كونجي": "congé",
    "كونجيه": "congé",
    "غدا": "demain",
    "غدوة": "demain",
    "غدوه": "demain",
    "اليوم": "aujourd hui",
    "وثيقه": "document",
    "وثيقة": "document",
    "شهاده": "attestation",
    "تليترافاي": "télétravail",
    "عن بعد": "télétravail",
    "العمل عن بعد": "télétravail",
    "حاله": "statut",
    "دخول": "pointer mon entrée",
    "خروج": "pointer ma sortie",
    "نبصم": "pointer mon entrée",
    "نسجل الدخول": "pointer mon entrée",
    "نسجل الخروج": "pointer ma sortie",
}


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _replace_terms(value: str, replacements: dict[str, str]) -> str:
    for source in sorted(replacements, key=len, reverse=True):
        target = replacements[source]
        value = re.sub(rf"(?<!\w){re.escape(source)}(?!\w)", target, value)
    return value


def normalize_latin(text: str | None) -> str:
    value = _strip_accents((text or "").lower())
    value = value.replace("’", "'")
    value = re.sub(r"[^a-z0-9:/\-\s']", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = _replace_terms(value, TUNISIAN_LATIN_SYNONYMS)
    value = _replace_terms(value, LATIN_SYNONYMS)
    return re.sub(r"\s+", " ", value).strip()


def normalize_arabic(text: str | None) -> str:
    value = (text or "").strip().lower().translate(ARABIC_VARIANTS)
    value = ARABIC_DIACRITICS_RE.sub("", value)
    value = re.sub(r"[^\w\s:/\-']", " ", value, flags=re.UNICODE)
    value = re.sub(r"\s+", " ", value).strip()
    value = _replace_terms(value, ARABIC_SYNONYMS)
    return re.sub(r"\s+", " ", value).strip()


def normalize_text(text: str | None, language: str | None = None) -> str:
    if ARABIC_RE.search(text or ""):
        return normalize_arabic(text)
    return normalize_latin(text)


def normalize_for_intent(text: str | None, language: str | None = None) -> str:
    return normalize_text(text, language)
