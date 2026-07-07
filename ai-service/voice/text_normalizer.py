from __future__ import annotations

import re
import uuid
from num2words import num2words as _num2words


def normalize_percentages(text: str, lang: str = "fr") -> str:
    def _replace(m: re.Match) -> str:
        try:
            word = _num2words(int(m.group(1)), lang=lang)
            suffix = {"fr": "pourcent", "en": "percent", "ar": "بالمئة"}
            return f"{word} {suffix.get(lang, 'pourcent')}"
        except (ValueError, NotImplementedError):
            return m.group(0)

    return re.sub(r'\b(\d+)\s*%', _replace, text)


def normalize_currencies(text: str, lang: str = "fr") -> str:
    currency_map = {
        "DT":  {"fr": "dinars",  "en": "dinars",  "ar": "دينار"},
        "TND": {"fr": "dinars",  "en": "dinars",  "ar": "دينار"},
        "€":   {"fr": "euros",   "en": "euros",   "ar": "يورو"},
        "EUR": {"fr": "euros",   "en": "euros",   "ar": "يورو"},
        "$":   {"fr": "dollars", "en": "dollars", "ar": "دولار"},
        "USD": {"fr": "dollars", "en": "dollars", "ar": "دولار"},
    }

    pattern = re.compile(
        r'\b(\d+(?:[.,]\d+)?)\s*(' +
        '|'.join(re.escape(k) for k in currency_map) +
        r')'
    )

    def _replace(m: re.Match) -> str:
        try:
            raw = m.group(1).replace(",", ".")
            num = float(raw) if "." in raw else int(raw)
            word = _num2words(num, lang=lang)
            label = currency_map.get(m.group(2), {}).get(lang, m.group(2))
            return f"{word} {label}"
        except (ValueError, NotImplementedError):
            return m.group(0)

    return pattern.sub(_replace, text)


def _protect_dates(text: str) -> tuple[str, dict[str, str]]:
    date_pattern = re.compile(
        r'\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b'
        r'|\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b'
    )
    placeholders: dict[str, str] = {}

    def _protect(m: re.Match) -> str:
        key = f"__DATEPROTECT_{uuid.uuid4().hex[:8]}__"
        placeholders[key] = m.group(0)
        return key

    return date_pattern.sub(_protect, text), placeholders


def _restore_placeholders(text: str, placeholders: dict[str, str]) -> str:
    for key, value in placeholders.items():
        text = text.replace(key, value)
    return text


def normalize_numbers(text: str, lang: str = "fr") -> str:
    rh_context_pattern = re.compile(
        r'\b(ID|Matricule|Référence|Ref|Code|N°|No\.?)\s*:?\s*\d+',
        re.IGNORECASE
    )
    rh_placeholders: dict[str, str] = {}

    def _protect_rh(m: re.Match) -> str:
        key = f"__RHCODE_{uuid.uuid4().hex[:8]}__"
        rh_placeholders[key] = m.group(0)
        return key

    text = rh_context_pattern.sub(_protect_rh, text)

    pattern = re.compile(
        r'(?<![A-Za-z\-\/])'
        r'\b'
        r'(?!(?:19|20)\d{2}\b)'
        r'(?!(?:200|201|202|301|302|400|401|403|404|500)\b)'
        r'(\d+(?:[.,]\d+)?)'
        r'\b'
        r'(?![A-Za-z])'
    )

    def _replace(m: re.Match) -> str:
        try:
            raw = m.group(1).replace(",", ".")
            if "." in raw:
                return _num2words(float(raw), lang=lang)
            return _num2words(int(raw), lang=lang)
        except (ValueError, NotImplementedError):
            return m.group(0)

    text = pattern.sub(_replace, text)

    return _restore_placeholders(text, rh_placeholders)


def normalize_for_tts(text: str, lang: str = "fr") -> str:
    if not text or not text.strip():
        return text

    try:
        text, date_placeholders = _protect_dates(text)
        text = normalize_percentages(text, lang)
        text = normalize_currencies(text, lang)
        text = normalize_numbers(text, lang)
        text = _restore_placeholders(text, date_placeholders)
        return text
    except Exception:
        return text
