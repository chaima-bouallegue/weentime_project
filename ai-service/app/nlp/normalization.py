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
    # Common FR typos seen in chatbot logs — keep narrow (whole-word only).
    "je veut": "je veux",
    "je veu": "je veux",
    "contart": "contrat",
    "travaille": "travail",
    "travaillee": "travail",
    "demand": "demande",
    "deamnde": "demande",
    "atestation": "attestation",
    "atestaion": "attestation",
    "conges": "congÃ©",
    "conge": "congÃ©",
    "vacance": "congÃ©",
    "vacances": "congÃ©",
    "absence": "congÃ©",
    "leave": "congÃ©",
    "day off": "congÃ©",
    "time off": "congÃ©",
    "holiday": "congÃ©",
    "holidays": "congÃ©",
    "remote work": "tÃ©lÃ©travail",
    "work from home": "tÃ©lÃ©travail",
    "working from home": "tÃ©lÃ©travail",
    "telework": "tÃ©lÃ©travail",
    "wfh": "tÃ©lÃ©travail",
    "certificate": "document",
    "salary certificate": "attestation de salaire",
    "work certificate": "attestation de travail",
    "paper": "document",
    "pay slip": "bulletin",
    "payslip": "bulletin",
    "check in": "pointer mon entrÃ©e",
    "clock in": "pointer mon entrÃ©e",
    "sign in": "pointer mon entrÃ©e",
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
    "aatini": "donne moi",
    "tounsi": "tunisien",
    "baad ghodwa": "apres demain",
    "ba3d ghodwa": "apres demain",
    "ghodwa": "demain",
    "pointit ou nn": "statut pointage",
    "pointit": "statut pointage",
    "pointi": "pointage",
    "npointi": "pointer mon entree",
    "rani jit": "pointer mon entree",
    "rani khrajt": "pointer ma sortie",
    "dakhla": "pointer mon entree",
    "dakhel": "pointer mon entree",
    "khrouj": "pointer ma sortie",
    "kharrej": "pointer ma sortie",
    "nokhrej": "pointer ma sortie",
    "aandi": "j ai",
    "3andi": "j ai",
    "andi": "j ai",
    "chnowa": "quoi",
    "chkoun": "qui",
    "chkon": "qui",
    "ma pointach": "n a pas pointe",
    "9adech": "combien",
    "kadech": "combien",
    "mazeli": "reste",
    "famma": "il y a",
    "fama": "il y a",
    "nkhdem remote": "teletravail",
    "war9a khidma": "attestation de travail",
    "autorisation nokhrej": "autorisation sortie",
    "konji": "conge",
    "congi": "conge",
    "conge": "conge",
    "repos": "conge",
    "maladie": "conge maladie",
    "rdv medical": "rendez vous medical",
    "swaye3": "heures",
}

ARABIC_SYNONYMS = {
    "Ù‚Ø¯Ø§Ø´": "combien",
    "ÙƒØ¯Ø§Ø´": "combien",
    "Ø¨Ø§Ù‚ÙŠÙ„ÙŠ": "reste",
    "Ø¨Ø§Ù‚ÙŠ": "reste",
    "Ù†Ø­Ø¨": "je veux",
    "Ù†Ø­Ø¨Ù‘": "je veux",
    "Ø§Ø­Ø¨": "je veux",
    "Ø§Ø±ÙŠØ¯": "je veux",
    "Ø¨Ø¯ÙŠ": "je veux",
    "Ø¹Ø§ÙŠØ²": "je veux",
    "Ø¹Ø·Ù„Ù‡": "congÃ©",
    "Ø¹Ø·Ù„Ø©": "congÃ©",
    "Ø§Ø¬Ø§Ø²Ù‡": "congÃ©",
    "Ø§Ø¬Ø§Ø²Ø©": "congÃ©",
    "Ø±Ø®ØµÙ‡": "congÃ©",
    "Ø±Ø®ØµØ©": "congÃ©",
    "ÙƒÙˆÙ†Ø¬ÙŠ": "congÃ©",
    "ÙƒÙˆÙ†Ø¬ÙŠÙ‡": "congÃ©",
    "ØºØ¯Ø§": "demain",
    "ØºØ¯ÙˆØ©": "demain",
    "ØºØ¯ÙˆÙ‡": "demain",
    "Ø§Ù„ÙŠÙˆÙ…": "aujourd hui",
    "ÙˆØ«ÙŠÙ‚Ù‡": "document",
    "ÙˆØ«ÙŠÙ‚Ø©": "document",
    "Ø´Ù‡Ø§Ø¯Ù‡": "attestation",
    "ØªÙ„ÙŠØªØ±Ø§ÙØ§ÙŠ": "tÃ©lÃ©travail",
    "Ø¹Ù† Ø¨Ø¹Ø¯": "tÃ©lÃ©travail",
    "Ø§Ù„Ø¹Ù…Ù„ Ø¹Ù† Ø¨Ø¹Ø¯": "tÃ©lÃ©travail",
    "Ø­Ø§Ù„Ù‡": "statut",
    "Ø¯Ø®ÙˆÙ„": "pointer mon entrÃ©e",
    "Ø®Ø±ÙˆØ¬": "pointer ma sortie",
    "Ù†Ø¨ØµÙ…": "pointer mon entrÃ©e",
    "Ù†Ø³Ø¬Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„": "pointer mon entrÃ©e",
    "Ù†Ø³Ø¬Ù„ Ø§Ù„Ø®Ø±ÙˆØ¬": "pointer ma sortie",
}

ARABIC_SYNONYMS.update(
    {
        "نحب": "je veux",
        "اريد": "je veux",
        "كم": "combien",
        "بقي": "reste",
        "بقي لدي": "reste",
        "عطلة مرضية": "congé maladie",
        "عطله مرضيه": "congé maladie",
        "عطلة": "congé",
        "عطله": "congé",
        "اجازة": "congé",
        "اجازه": "congé",
        "الاجازات": "congé",
        "الاجازة": "congé",
        "غدا": "demain",
        "غدوة": "demain",
        "بعد غدوة": "apres demain",
        "وثيقة": "document",
        "شهادة عمل": "attestation de travail",
        "شهاده عمل": "attestation de travail",
        "كشف الراتب": "bulletin",
        "إذن خروج": "autorisation sortie",
        "اذن خروج": "autorisation sortie",
        "هل سجلت الحضور اليوم": "statut pointage",
        "هل سجلت الحضور": "statut pointage",
        "من لم يسجل الحضور": "qui n a pas pointe",
        "من لم يسجل الدخول": "qui n a pas pointe",
        "من لم يبصم": "qui n a pas pointe",
        "هل نسيت تسجيل الخروج": "oublie de pointer la sortie",
        "نسيت نبوّنتي": "oublie de pointer",
        "نسيت نبونتي": "oublie de pointer",
        "شكون ما بوّنتاش": "statut pointage",
        "أريد العمل عن بعد": "je veux teletravail",
        "اريد العمل عن بعد": "je veux teletravail",
        "العمل عن بعد": "teletravail",
        "هل لدي اجتماع": "mes reunions",
        "ماذا يجب أن أفعل اليوم": "que dois je faire aujourd hui",
        "ماذا يجب ان افعل اليوم": "que dois je faire aujourd hui",
        "الموافقات المعلقة": "pending approvals",
        "الموافقات المعلقه": "pending approvals",
        "طلبات في الانتظار": "pending approvals",
        "الطلبات المعلقة": "pending approvals",
        "الطلبات المعلقه": "pending approvals",
        "من ينتظر الموافقة": "pending approvals",
        "من ينتظر التحقق": "pending approvals",
        "خروج": "sortie",
    }
)


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
    value = value.replace("â€™", "'")
    value = re.sub(r"[^a-z0-9:/\-\s']", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = _replace_terms(value, TUNISIAN_LATIN_SYNONYMS)
    value = _replace_terms(value, LATIN_SYNONYMS)
    value = value.replace("congÃ©", "congé").replace("congĂŠ", "congé").replace("conge", "congé")
    value = value.replace("télétravail", "teletravail").replace("tÃ©lÃ©travail", "teletravail")
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

