from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext


class VoiceSummaryBuilder:
    """Build short spoken summaries from authoritative role-intelligence digests."""

    def build(self, action_result: dict[str, Any], context: CurrentUserContext) -> str:
        role = str(action_result.get("role") or context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        locale = _voice_locale(context)
        priorities = _dict_list(action_result.get("priorities"))
        reminders = _dict_list(action_result.get("reminders"))
        warnings = [str(item) for item in action_result.get("warnings", []) if str(item or "").strip()]
        sections = _dict_list(action_result.get("sections"))

        if priorities:
            focus_items = priorities[:3]
            focus = _join_short([_short_item(item) for item in focus_items], locale=locale)
            count_text = _count_phrase(len(priorities), locale=locale)
            return _template(locale, role, count_text, focus, has_warning=bool(warnings))

        if reminders:
            focus = _join_short([_short_item(item) for item in reminders[:2]], locale=locale)
            return _reminder_template(locale, role, focus, has_warning=bool(warnings))

        ok_sections = [section for section in sections if section.get("status") == "ok"]
        if ok_sections:
            focus = _join_short([str(section.get("title") or section.get("toolName") or "section") for section in ok_sections[:3]], locale=locale)
            return _no_priority_template(locale, role, focus, has_warning=bool(warnings))

        return _unavailable_template(locale, role)


def _voice_locale(context: CurrentUserContext) -> str:
    value = str(context.language or context.metadata.get("language") or "fr").lower()
    if value in {"en", "ar", "tn"}:
        return value
    return "fr"


def _dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _short_item(item: dict[str, Any]) -> str:
    title = str(item.get("title") or item.get("type") or "point").strip()
    summary = str(item.get("summary") or "").strip()
    if not summary:
        return title
    summary = summary.replace("\n", " ")
    if len(summary) > 90:
        summary = summary[:87].rstrip() + "..."
    if title.lower() in summary.lower():
        return summary
    return f"{title}: {summary}"


def _join_short(values: list[str], *, locale: str) -> str:
    clean = [value for value in values if value]
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    separator = " و " if locale == "ar" else " et " if locale in {"fr", "tn"} else " and "
    return ", ".join(clean[:-1]) + separator + clean[-1]


def _count_phrase(count: int, *, locale: str) -> str:
    if locale == "en":
        return f"{count} " + ("priority" if count == 1 else "priorities")
    if locale == "ar":
        return f"{count} اولوية"
    if locale == "tn":
        return f"{count} haja mohemma"
    return f"{count} priorite" + ("" if count == 1 else "s")


def _role_label(role: str, locale: str) -> str:
    if locale == "en":
        return {"EMPLOYEE": "personal", "MANAGER": "team", "RH": "HR", "ADMIN": "system"}.get(role, "role")
    if locale == "ar":
        return {"EMPLOYEE": "الشخصي", "MANAGER": "الفريق", "RH": "الموارد البشرية", "ADMIN": "النظام"}.get(role, "الدور")
    if locale == "tn":
        return {"EMPLOYEE": "mteek", "MANAGER": "mtaa equipe", "RH": "RH", "ADMIN": "system"}.get(role, "role")
    return {"EMPLOYEE": "personnel", "MANAGER": "equipe", "RH": "RH", "ADMIN": "systeme"}.get(role, "role")


def _template(locale: str, role: str, count_text: str, focus: str, *, has_warning: bool) -> str:
    warning = _warning_suffix(locale) if has_warning else ""
    label = _role_label(role, locale)
    if locale == "en":
        return f"Your {label} briefing has {count_text}. Main focus: {focus}.{warning}"
    if locale == "ar":
        return f"ملخص {label}: لديك {count_text}. الاهم: {focus}.{warning}"
    if locale == "tn":
        return f"Brief {label}: aandek {count_text}. Ahamm haja: {focus}.{warning}"
    return f"Votre briefing {label} contient {count_text}. A traiter: {focus}.{warning}"


def _reminder_template(locale: str, role: str, focus: str, *, has_warning: bool) -> str:
    warning = _warning_suffix(locale) if has_warning else ""
    label = _role_label(role, locale)
    if locale == "en":
        return f"Your {label} briefing has no urgent priority, but note: {focus}.{warning}"
    if locale == "ar":
        return f"ملخص {label}: لا توجد اولوية عاجلة، لكن انتبه الى: {focus}.{warning}"
    if locale == "tn":
        return f"Brief {label}: ma fama hata urgence, ama thabet: {focus}.{warning}"
    return f"Votre briefing {label} ne montre pas d'urgence, mais a noter: {focus}.{warning}"


def _no_priority_template(locale: str, role: str, focus: str, *, has_warning: bool) -> str:
    warning = _warning_suffix(locale) if has_warning else ""
    label = _role_label(role, locale)
    if locale == "en":
        return f"Your {label} briefing shows no urgent priority. Data checked: {focus}.{warning}"
    if locale == "ar":
        return f"ملخص {label}: لا توجد اولوية عاجلة. تم فحص: {focus}.{warning}"
    if locale == "tn":
        return f"Brief {label}: ma fama hata urgence. Tcheckina: {focus}.{warning}"
    return f"Votre briefing {label} ne montre pas de priorite urgente. Donnees consultees: {focus}.{warning}"


def _unavailable_template(locale: str, role: str) -> str:
    label = _role_label(role, locale)
    if locale == "en":
        return f"I cannot build your {label} voice briefing because the required data is unavailable."
    if locale == "ar":
        return f"لا يمكنني اعداد ملخص {label} لان المعطيات غير متوفرة."
    if locale == "tn":
        return f"Ma nejjemch naamlel brief {label} khater el donnees moch mawjoudin."
    return f"Je ne peux pas preparer le briefing {label}, car les donnees necessaires sont indisponibles."


def _warning_suffix(locale: str) -> str:
    if locale == "en":
        return " Some data is unavailable."
    if locale == "ar":
        return " بعض المعطيات غير متوفرة."
    if locale == "tn":
        return " Fama donnees na9sin."
    return " Certaines donnees sont indisponibles."
