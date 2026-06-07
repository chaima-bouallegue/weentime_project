from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta
from typing import Any

DOCUMENT_TYPE_LABELS: dict[str, str] = {
    "ATTESTATION_TRAVAIL": "l'attestation de travail",
    "BULLETIN_PAIE": "bulletin de paie",
    "ATTESTATION_SALAIRE": "l'attestation de salaire",
    "CONTRAT_TRAVAIL": "contrat de travail",
    "CERTIFICAT_CONGE": "certificat de congé",
    "ATTESTATION_ANCIENNETE": "l'attestation d'ancienneté",
    "FICHE_POSTE": "fiche de poste",
}

FRENCH_MONTH_LABELS = {
    1: "Janvier",
    2: "Février",
    3: "Mars",
    4: "Avril",
    5: "Mai",
    6: "Juin",
    7: "Juillet",
    8: "Août",
    9: "Septembre",
    10: "Octobre",
    11: "Novembre",
    12: "Décembre",
}

_DOCUMENT_ALIASES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "BULLETIN_PAIE",
        (
            "BULLETIN_PAIE",
            "BULLETIN_DE_PAIE",
            "bulletin de paie",
            "bulletin paie",
            "fiche de paie",
            "fiche paie",
            "payslip",
            "pay slip",
            "salary slip",
            "كشف الراتب",
            "كشف راتب",
            "راتب",
            "kashf el rateb",
            "war9a paie",
        ),
    ),
    (
        "ATTESTATION_SALAIRE",
        (
            "ATTESTATION_SALAIRE",
            "ATTESTATION_DE_SALAIRE",
            "attestation de salaire",
            "attestation salaire",
            "salary certificate",
            "شهادة راتب",
            "شهادة الراتب",
        ),
    ),
    (
        "CONTRAT_TRAVAIL",
        (
            "CONTRAT_TRAVAIL",
            "CONTRAT_DE_TRAVAIL",
            "contrat de travail",
            "contract",
            "work contract",
            "عقد عمل",
        ),
    ),
    (
        "CERTIFICAT_CONGE",
        (
            "CERTIFICAT_CONGE",
            "CERTIFICAT_DE_CONGE",
            "certificat de congé",
            "certificat de conge",
            "leave certificate",
            "شهادة عطلة",
            "شهادة إجازة",
        ),
    ),
    (
        "ATTESTATION_ANCIENNETE",
        (
            "ATTESTATION_ANCIENNETE",
            "ATTESTATION_D_ANCIENNETE",
            "attestation d'ancienneté",
            "attestation ancienneté",
            "attestation anciennete",
            "ancienneté",
            "anciennete",
            "seniority certificate",
        ),
    ),
    (
        "FICHE_POSTE",
        (
            "FICHE_POSTE",
            "FICHE_DE_POSTE",
            "fiche de poste",
            "job description",
            "description de poste",
        ),
    ),
    (
        "ATTESTATION_TRAVAIL",
        (
            "ATTESTATION_TRAVAIL",
            "ATTESTATION_DE_TRAVAIL",
            "attestation de travail",
            "attestation travail",
            "work certificate",
            "certificate of employment",
            "employment certificate",
            "certificat de travail",
            "certificat travail",
            "شهادة عمل",
            "شهادة العمل",
            "war9a khidma",
            "warka khidma",
        ),
    ),
)

_MONTH_ALIASES: dict[int, tuple[str, ...]] = {
    1: ("janvier", "january", "jan", "جانفي", "يناير", "janfi"),
    2: ("février", "fevrier", "february", "feb", "فيفري", "فبراير", "fivri"),
    3: ("mars", "march", "mar", "مارس", "mars"),
    4: ("avril", "april", "apr", "أفريل", "افريل", "إبريل", "ابريل", "avril"),
    5: ("mai", "may", "ماي", "مايو"),
    6: ("juin", "june", "jun", "جوان", "يونيو", "juin"),
    7: ("juillet", "july", "jul", "جويلية", "يوليو", "juillet"),
    8: ("août", "aout", "august", "aug", "أوت", "اوت", "غشت", "aout"),
    9: ("septembre", "september", "sep", "sept", "سبتمبر", "شتنبر"),
    10: ("octobre", "october", "oct", "أكتوبر", "اكتوبر"),
    11: ("novembre", "november", "nov", "نوفمبر"),
    12: ("décembre", "decembre", "december", "dec", "ديسمبر", "دجنبر"),
}


def normalize_document_type(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    code = _strip_accents(text).upper().replace("-", "_").replace(" ", "_").replace("'", "_")
    code = re.sub(r"_+", "_", code).strip("_")
    if code in DOCUMENT_TYPE_LABELS:
        return code
    if code == "BULLETIN_DE_PAIE":
        return "BULLETIN_PAIE"

    normalized = _lookup(text)
    for canonical, aliases in _DOCUMENT_ALIASES:
        for alias in aliases:
            alias_key = _lookup(alias)
            if normalized == alias_key or _contains_phrase(normalized, alias_key):
                return canonical
    return None


def infer_document_type(text: Any) -> str | None:
    return normalize_document_type(text)


def is_payslip_type(document_type: Any) -> bool:
    return normalize_document_type(document_type) == "BULLETIN_PAIE"


def document_label(document_type: Any) -> str:
    normalized = normalize_document_type(document_type)
    return DOCUMENT_TYPE_LABELS.get(normalized or "", "ce document")


def parse_month_reference(value: Any, *, today: date | None = None) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    today = today or date.today()

    iso = re.search(r"\b(20\d{2})[-/](0?[1-9]|1[0-2])\b", raw)
    if iso:
        return format_month_label(int(iso.group(1)), int(iso.group(2)))

    numeric = re.search(r"\b(0?[1-9]|1[0-2])[-/](20\d{2})\b", raw)
    if numeric:
        return format_month_label(int(numeric.group(2)), int(numeric.group(1)))

    normalized = _lookup(raw)
    if _has_any(normalized, ("ce mois ci", "ce mois", "mois courant", "current month", "this month", "chhar hedha", "shhar hedha", "هذا الشهر", "الشهر الحالي")):
        return format_month_label(today.year, today.month)
    if _has_any(normalized, ("mois dernier", "le mois dernier", "last month", "previous month", "chhar elli fet", "الشهر الماضي")):
        previous = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
        return format_month_label(previous.year, previous.month)

    for month_number, aliases in _MONTH_ALIASES.items():
        for alias in sorted(aliases, key=len, reverse=True):
            alias_key = _lookup(alias)
            pattern = rf"(?<!\w){re.escape(alias_key)}(?!\w)(?:\s+(20\d{{2}}))?"
            match = re.search(pattern, normalized)
            if match:
                year = int(match.group(1)) if match.group(1) else today.year
                return format_month_label(year, month_number)
    return None


def format_month_label(year: int, month: int) -> str | None:
    if month not in FRENCH_MONTH_LABELS or year < 1900:
        return None
    return f"{FRENCH_MONTH_LABELS[month]} {year}"


def localized_document_type_question(language: Any) -> str:
    language_key = _language_key(language)
    if language_key == "en":
        return "Which document type do you want to request? For example: work certificate, payslip, or contract."
    if language_key == "ar":
        return "ما نوع الوثيقة التي تريد طلبها؟ مثلا: شهادة عمل، كشف راتب، أو عقد عمل."
    if language_key == "tn":
        return "Chnowa no3 el document elli t7eb talbou? Mathalan attestation de travail, bulletin de paie, wela contrat."
    return "Quel type de document souhaitez-vous demander ? Par exemple : attestation de travail, bulletin de paie ou contrat."


def localized_month_question(language: Any, *, invalid: bool = False) -> str:
    language_key = _language_key(language)
    if language_key == "en":
        prefix = "I did not recognize the month. " if invalid else ""
        return f"{prefix}Which month is this payslip for? Example: April 2026."
    if language_key == "ar":
        prefix = "لم أتعرف على الشهر. " if invalid else ""
        return f"{prefix}لأي شهر تريد كشف الراتب؟ مثال: Avril 2026 أو 04/2026."
    if language_key == "tn":
        prefix = "Ma fhemtch el chhar. " if invalid else ""
        return f"{prefix}L'bulletin de paie mta3 ay chhar? Mathalan: Avril 2026 wala 04/2026."
    prefix = "Je n'ai pas reconnu le mois. " if invalid else ""
    return f"{prefix}Pour quel mois souhaitez-vous le bulletin de paie ? Exemple : Avril 2026."


def localized_confirmation_text(document_type: Any, month: Any, language: Any) -> str:
    label = document_label(document_type)
    month_label = str(month or "").strip()
    language_key = _language_key(language)
    if language_key == "en":
        if is_payslip_type(document_type) and month_label:
            return f"Do you want to confirm the payslip request for {month_label}?"
        return f"Do you want to confirm the request for {label}?"
    if language_key == "ar":
        if is_payslip_type(document_type) and month_label:
            return f"هل تؤكد طلب كشف الراتب لشهر {month_label}؟"
        return f"هل تؤكد طلب {label}؟"
    if language_key == "tn":
        if is_payslip_type(document_type) and month_label:
            return f"T7eb tconfirmi demande bulletin de paie mta3 {month_label}?"
        return f"T7eb tconfirmi demande de {label}?"
    if is_payslip_type(document_type) and month_label:
        return f"Voulez-vous confirmer la demande de bulletin de paie pour {month_label} ?"
    return f"Voulez-vous confirmer la demande de {label} ?"


def localized_no_pending_confirmation(language: Any) -> str:
    language_key = _language_key(language)
    if language_key == "en":
        return "There is no pending action to confirm. Tell me what you want to request first, then I will ask for confirmation."
    if language_key == "ar":
        return "لا توجد أي عملية بانتظار التأكيد. قل لي أولا ماذا تريد طلبه، ثم سأطلب منك التأكيد."
    if language_key == "tn":
        return "Ma famech action tetsanna confirmation. Golli chnowa t7eb taleb, baad nconfirmiw."
    return "Aucune action n'est en attente de confirmation. Dites-moi d'abord ce que vous voulez demander, puis je vous proposerai une confirmation."


def localized_success_summary(document_type: Any, month: Any, language: Any) -> str:
    label = document_label(document_type)
    month_label = str(month or "").strip()
    language_key = _language_key(language)
    if language_key == "en":
        if is_payslip_type(document_type) and month_label:
            return f"Your payslip request for {month_label} has been sent."
        return "Your document request has been sent."
    if language_key == "ar":
        if is_payslip_type(document_type) and month_label:
            return f"تم إرسال طلب كشف الراتب لشهر {month_label}."
        return "تم إرسال طلب الوثيقة."
    if language_key == "tn":
        if is_payslip_type(document_type) and month_label:
            return f"Demande bulletin de paie mta3 {month_label} tbaathet."
        return "Demande document tbaathet."
    if is_payslip_type(document_type) and month_label:
        return f"Votre demande de bulletin de paie pour {month_label} a été envoyée."
    return f"Votre demande de {label} a été envoyée."


def _lookup(value: str) -> str:
    text = _strip_accents(value).lower()
    text = text.replace("_", " ").replace("-", " ").replace("/", " ")
    text = re.sub(r"[^\w\s\u0600-\u06FF]", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def _strip_accents(value: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", str(value))
        if not unicodedata.combining(char)
    )


def _contains_phrase(text: str, phrase: str) -> bool:
    if not phrase:
        return False
    return re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text) is not None


def _has_any(text: str, phrases: tuple[str, ...]) -> bool:
    return any(_contains_phrase(text, _lookup(phrase)) for phrase in phrases)


def _language_key(language: Any) -> str:
    value = str(language or "").strip().lower()
    if value.startswith("en"):
        return "en"
    if value == "tn" or "tunis" in value:
        return "tn"
    if value.startswith("ar"):
        return "ar"
    return "fr"
