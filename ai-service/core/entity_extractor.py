from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

from core.intent_engine import is_question, normalize_text


MONTHS = {
    "janvier": 1,
    "january": 1,
    "jan": 1,
    "fevrier": 2,
    "fev": 2,
    "february": 2,
    "feb": 2,
    "mars": 3,
    "march": 3,
    "mar": 3,
    "avril": 4,
    "april": 4,
    "apr": 4,
    "mai": 5,
    "may": 5,
    "juin": 6,
    "june": 6,
    "jun": 6,
    "juillet": 7,
    "july": 7,
    "jul": 7,
    "aout": 8,
    "august": 8,
    "aug": 8,
    "septembre": 9,
    "september": 9,
    "sep": 9,
    "octobre": 10,
    "october": 10,
    "oct": 10,
    "novembre": 11,
    "november": 11,
    "nov": 11,
    "decembre": 12,
    "december": 12,
    "dec": 12,
}

DOCUMENT_TYPES = {
    "attestation de travail": "ATTESTATION_TRAVAIL",
    "attestation travail": "ATTESTATION_TRAVAIL",
    "attestation": "ATTESTATION_TRAVAIL",
    "bulletin de paie": "BULLETIN_PAIE",
    "bulletin paie": "BULLETIN_PAIE",
    "fiche de paie": "BULLETIN_PAIE",
    "payslip": "BULLETIN_PAIE",
    "salary slip": "BULLETIN_PAIE",
    "attestation de salaire": "ATTESTATION_SALAIRE",
    "certificat de conge": "CERTIFICAT_CONGE",
    "contrat de travail": "CONTRAT_TRAVAIL",
    "contract": "CONTRAT_TRAVAIL",
    "attestation anciennete": "ATTESTATION_ANCIENNETE",
    "fiche de poste": "FICHE_POSTE",
}

REQUEST_TYPE_HINTS = {
    "conge": "CONGE",
    "conges": "CONGE",
    "leave": "CONGE",
    "autorisation": "AUTORISATION",
    "permission": "AUTORISATION",
    "teletravail": "TELETRAVAIL",
    "telework": "TELETRAVAIL",
    "remote": "TELETRAVAIL",
    "document": "DOCUMENT",
    "absence": "ABSENCE",
}

LEAVE_TYPE_HINTS = {
    "annuel": "Conge annuel",
    "maladie": "Conge maladie",
    "medical": "Conge maladie",
    "rtt": "RTT",
    "maternite": "Conge maternite",
    "paternite": "Conge paternite",
    "sans solde": "Sans Solde",
    "exceptionnel": "Conge exceptionnel",
}

AUTHORIZATION_TYPE_HINTS = {
    "sortie anticipee": "SORTIE_ANTICIPEE",
    "partir plus tot": "SORTIE_ANTICIPEE",
    "arrivee tardive": "ARRIVEE_TARDIVE",
    "retard": "ARRIVEE_TARDIVE",
    "rdv medical": "RDV_MEDICAL",
    "rendez vous medical": "RDV_MEDICAL",
    "medecin": "RDV_MEDICAL",
    "pause longue": "PAUSE_LONGUE",
    "teletravail exceptionnel": "TELETRAVAIL_EXCEPTIONNEL",
    "mi temps": "MI_TEMPS_EXCEPTIONNEL",
    "demi journee": "MI_TEMPS_EXCEPTIONNEL",
    "autre": "AUTRE",
}

CONFIRM_WORDS = (
    "confirme",
    "confirmer",
    "confirmez",
    "vas y",
    "go",
    "execute",
    "execute la demande",
    "lance",
    "envoye",
    "envoyer",
)

CREATE_WORDS = (
    "je veux",
    "je souhaite",
    "je voudrais",
    "demande",
    "demander",
    "creer",
    "cree",
    "poser",
    "soumettre",
    "fais",
    "donne moi",
    "donne",
    "genere",
    "fournis",
)


def _today() -> date:
    return date.today()


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _coerce_year(raw_year: str | None) -> int:
    if not raw_year:
        return _today().year
    value = int(raw_year)
    return 2000 + value if value < 100 else value


def _parse_numeric_date(raw_value: str) -> date | None:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%m/%d/%Y", "%m-%d-%Y"):
        try:
            parsed = datetime.strptime(raw_value.strip(), fmt).date()
            if parsed.year < 100:
                return parsed.replace(year=parsed.year + 2000)
            return parsed
        except ValueError:
            continue
    return None


def _relative_date_range(normalized: str) -> tuple[str | None, str | None, str | None, float]:
    today = _today()
    mapping = (
        ("after tomorrow", 2),
        ("apres demain", 2),
        ("tomorrow", 1),
        ("demain", 1),
        ("today", 0),
        ("aujourd hui", 0),
    )
    for token, offset in mapping:
        if token in normalized:
            target = today + timedelta(days=offset)
            return target.isoformat(), target.isoformat(), "relative", 0.95
    return None, None, None, 0.0


def _named_date_range(normalized: str) -> tuple[str | None, str | None, str | None, float]:
    ranged = re.search(
        r"(?:du|from)?\s*(\d{1,2})(?:er)?\s+([a-z]+)(?:\s+(\d{2,4}))?\s*(?:a|au|-|to)\s*(\d{1,2})(?:er)?(?:\s+([a-z]+))?(?:\s+(\d{2,4}))?",
        normalized,
    )
    if ranged:
        start_month = MONTHS.get(ranged.group(2))
        end_month = MONTHS.get(ranged.group(5) or ranged.group(2))
        if start_month and end_month:
            start = _safe_date(_coerce_year(ranged.group(3)), start_month, int(ranged.group(1)))
            end = _safe_date(_coerce_year(ranged.group(6) or ranged.group(3)), end_month, int(ranged.group(4)))
            if start and end:
                return start.isoformat(), end.isoformat(), "exact", 0.9

    single = re.search(r"\b(\d{1,2})(?:er)?\s+([a-z]+)(?:\s+(\d{2,4}))?\b", normalized)
    if single:
        month = MONTHS.get(single.group(2))
        if month:
            value = _safe_date(_coerce_year(single.group(3)), month, int(single.group(1)))
            if value:
                return value.isoformat(), value.isoformat(), "exact", 0.88

    return None, None, None, 0.0


def _month_inferred_range(normalized: str) -> tuple[str | None, str | None, str | None, float]:
    ranged = re.search(r"(?:du|from)?\s*(\d{1,2})(?:er)?\s*(?:a|au|-|to)\s*(\d{1,2})(?:er)?\b", normalized)
    if not ranged:
        return None, None, None, 0.0

    today = _today()
    start = _safe_date(today.year, today.month, int(ranged.group(1)))
    end = _safe_date(today.year, today.month, int(ranged.group(2)))
    if start and end:
        return start.isoformat(), end.isoformat(), "month_inferred", 0.55
    return None, None, None, 0.0


def _numeric_date_range(normalized: str) -> tuple[str | None, str | None, str | None, float]:
    matches = re.findall(r"\b(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{2,4})\b", normalized)
    parsed = [item.isoformat() for item in (_parse_numeric_date(value) for value in matches[:2]) if item]
    if len(parsed) >= 2:
        return parsed[0], parsed[1], "exact", 0.9
    if len(parsed) == 1:
        return parsed[0], parsed[0], "exact", 0.88
    return None, None, None, 0.0


def _extract_date_range(normalized: str) -> tuple[str | None, str | None, str | None, float]:
    for parser in (_relative_date_range, _named_date_range, _numeric_date_range, _month_inferred_range):
        start_date, end_date, precision, confidence = parser(normalized)
        if start_date or end_date:
            return start_date, end_date, precision, confidence
    return None, None, None, 0.0


def _extract_request_id(text: str, normalized: str) -> int | None:
    specific = re.search(
        r"(?:conge|leave|autorisation|teletravail|telework|document|absence|demande|request)\s+#?\s*(\d+)",
        normalized,
    )
    if specific:
        return int(specific.group(1))
    explicit = re.search(r"\b(?:id|numero|num|request)\s*#?\s*(\d+)\b", normalized)
    if explicit:
        return int(explicit.group(1))
    generic = re.search(r"\b(\d+)\b", text)
    return int(generic.group(1)) if generic else None


def _extract_document_type(normalized: str) -> str | None:
    for label, document_type in DOCUMENT_TYPES.items():
        if label in normalized:
            return document_type
    return None


def _extract_request_type(normalized: str) -> str | None:
    for label, request_type in REQUEST_TYPE_HINTS.items():
        if label in normalized:
            return request_type
    return None


def _extract_reason(normalized: str) -> str | None:
    for pattern in (
        r"(?:motif|raison)\s+(?:de|du|des)?\s*(.+)$",
        r"\bpour\s+(.+)$",
        r"\bcar\s+(.+)$",
        r"\bbecause\s+(.+)$",
    ):
        match = re.search(pattern, normalized)
        if match:
            value = match.group(1).strip(" .")
            if value:
                return value
    return None


def _extract_month_reference(normalized: str) -> str | None:
    numeric = re.search(r"\b(0?[1-9]|1[0-2])[/-](\d{4})\b", normalized)
    if numeric:
        month = int(numeric.group(1))
        year = int(numeric.group(2))
        return f"{year:04d}-{month:02d}"

    named = re.search(r"\b([a-z]+)(?:\s+(\d{4}))?\b", normalized)
    if named and named.group(1) in MONTHS:
        year = _coerce_year(named.group(2))
        month = MONTHS[named.group(1)]
        return f"{year:04d}-{month:02d}"
    return None


def _extract_time_range(normalized: str) -> tuple[str | None, str | None]:
    patterns = (
        r"(?:de|du|from)?\s*(\d{1,2})(?::(\d{2}))?\s*h?(?:\s*(\d{2}))?\s*(?:a|au|-|to)\s*(\d{1,2})(?::(\d{2}))?\s*h?(?:\s*(\d{2}))?",
        r"(\d{1,2}):(\d{2})\s*(?:a|au|-|to)\s*(\d{1,2}):(\d{2})",
    )
    for index, pattern in enumerate(patterns):
        match = re.search(pattern, normalized)
        if not match:
            continue
        if index == 0:
            start_hour = int(match.group(1))
            start_minute = int(match.group(2) or match.group(3) or 0)
            end_hour = int(match.group(4))
            end_minute = int(match.group(5) or match.group(6) or 0)
        else:
            start_hour = int(match.group(1))
            start_minute = int(match.group(2))
            end_hour = int(match.group(3))
            end_minute = int(match.group(4))
        return f"{start_hour:02d}:{start_minute:02d}:00", f"{end_hour:02d}:{end_minute:02d}:00"
    return None, None


def _extract_leave_type(normalized: str) -> str | None:
    for token, label in LEAVE_TYPE_HINTS.items():
        if token in normalized:
            return label
    return None


def _extract_authorization_type(normalized: str) -> str | None:
    for token, label in AUTHORIZATION_TYPE_HINTS.items():
        if token in normalized:
            return label
    return None


def _extract_telework_type(normalized: str) -> tuple[str | None, str | None]:
    if "demi journee matin" in normalized:
        return "DEMI_JOURNEE_MATIN", "MATIN"
    if "demi journee apres midi" in normalized or "demi journee apres midi" in normalized:
        return "DEMI_JOURNEE_APRES_MIDI", "APRES_MIDI"
    if "semaine" in normalized or "week" in normalized:
        return "SEMAINE_COMPLETE", None
    if "teletravail" in normalized or "telework" in normalized or "remote" in normalized:
        return "JOURNEE_COMPLETE", None
    return None, None


def _extract_decision(normalized: str) -> str | None:
    if any(term in normalized for term in ("approuve", "approuver", "valide", "valider", "accepte", "accepter", "approve")):
        return "APPROUVE"
    if any(term in normalized for term in ("refuse", "refuser", "rejette", "rejeter", "reject")):
        return "REFUSE"
    return None


def _has_any(normalized: str, values: tuple[str, ...]) -> bool:
    return any(value in normalized for value in values)


def _extract_confidence(
    *,
    normalized: str,
    intent: str | None,
    start_date: str | None,
    end_date: str | None,
    date_precision: str | None,
    request_id: int | None,
    document_type: str | None,
    request_type: str | None,
    time_start: str | None,
    time_end: str | None,
    authorization_type: str | None,
    pending_intent: str | None = None,
) -> tuple[float, bool]:
    confidence = 0.35
    if intent and _has_any(normalized, CREATE_WORDS):
        confidence += 0.25
    if intent and _has_any(normalized, CONFIRM_WORDS):
        confidence += 0.2
    if pending_intent and intent == pending_intent:
        confidence += 0.25
    if start_date and end_date:
        confidence += 0.25
    if date_precision == "relative":
        confidence += 0.1
    if request_id is not None:
        confidence += 0.25
    if document_type:
        confidence += 0.35
    if request_type:
        confidence += 0.2
    if time_start and time_end:
        confidence += 0.2
    if authorization_type:
        confidence += 0.15

    needs_confirmation = date_precision == "month_inferred"
    if needs_confirmation:
        confidence = min(confidence, 0.6)

    return min(confidence, 0.99), needs_confirmation


def extract_entities(
    text: str,
    *,
    intent: str | None = None,
    role: str = "EMPLOYEE",
    pending_intent: str | None = None,
) -> dict[str, Any]:
    normalized = normalize_text(text)
    start_date, end_date, date_precision, date_confidence = _extract_date_range(normalized)
    request_id = _extract_request_id(text, normalized)
    document_type = _extract_document_type(normalized)
    request_type = _extract_request_type(normalized)
    reason = _extract_reason(normalized)
    month = _extract_month_reference(normalized)
    time_start, time_end = _extract_time_range(normalized)
    leave_type_label = _extract_leave_type(normalized)
    authorization_type = _extract_authorization_type(normalized)
    telework_type, telework_period = _extract_telework_type(normalized)
    decision = _extract_decision(normalized)

    request_date = start_date or end_date
    if intent == "CREATE_AUTORISATION" and request_date:
        start_date = request_date
        end_date = request_date

    confidence, needs_confirmation = _extract_confidence(
        normalized=normalized,
        intent=intent,
        start_date=start_date,
        end_date=end_date,
        date_precision=date_precision,
        request_id=request_id,
        document_type=document_type,
        request_type=request_type,
        time_start=time_start,
        time_end=time_end,
        authorization_type=authorization_type,
        pending_intent=pending_intent,
    )
    confidence = max(confidence, date_confidence)

    return {
        "raw_text": text,
        "normalized_text": normalized,
        "role": (role or "EMPLOYEE").upper(),
        "intent": intent,
        "is_question": is_question(text),
        "request_id": request_id,
        "type_demande": request_type,
        "request_type": request_type,
        "document_type": document_type,
        "month": month,
        "reason": reason,
        "comment": reason,
        "start_date": start_date,
        "end_date": end_date,
        "request_date": request_date,
        "time_start": time_start,
        "time_end": time_end,
        "leave_type_label": leave_type_label,
        "authorization_type": authorization_type,
        "telework_type": telework_type,
        "telework_period": telework_period,
        "decision": decision,
        "download_url": None,
        "incomplete": False,
        "validation_errors": [],
        "date_precision": date_precision,
        "confidence": round(confidence, 2),
        "needs_confirmation": needs_confirmation,
    }
