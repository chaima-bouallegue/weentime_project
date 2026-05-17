from __future__ import annotations

import re
from dataclasses import dataclass

CREATE_LEAVE = "CREATE_LEAVE"
CHECK_IN = "CHECK_IN"
CHECK_OUT = "CHECK_OUT"
REQUEST_DOCUMENT = "REQUEST_DOCUMENT"
CREATE_TELEWORK = "CREATE_TELEWORK"
GET_STATUS = "GET_STATUS"

INTENTS = {
    CREATE_LEAVE,
    CHECK_IN,
    CHECK_OUT,
    REQUEST_DOCUMENT,
    CREATE_TELEWORK,
    GET_STATUS,
    "attendance.status",
    "attendance.check_in",
    "attendance.check_out",
    "attendance.week_hours",
    "attendance.history",
    "leave.balance",
    "leave.create",
    "leave.list",
    "leave.status",
    "document.create",
    "document.list",
    "document.download",
    "telework.create",
    "telework.list",
    "authorization.create",
    "authorization.list",
    "communication.send_message",
    "communication.summarize_channel",
    "meeting.create",
    "daily.submit",
    "daily.summary",
    "hr.policy_question",
    "fallback.unknown",
}


@dataclass(frozen=True, slots=True)
class IntentMatch:
    intent: str
    confidence: float
    route_intent: str


INTENT_ROUTE_MAP = {
    CREATE_LEAVE: CREATE_LEAVE,
    CHECK_IN: "attendance.check_in",
    CHECK_OUT: "attendance.check_out",
    REQUEST_DOCUMENT: REQUEST_DOCUMENT,
    CREATE_TELEWORK: CREATE_TELEWORK,
    GET_STATUS: "attendance.status",
}

INTENT_PATTERNS: dict[str, tuple[str, ...]] = {
    CREATE_LEAVE: (
        r"\b(je veux|je souhaite|je voudrais|j ai besoin|demande|demander|prendre|create|request|want|need)\b.*\b(congé|conge)\b",
        r"\b(congé|conge)\b.*\b(demain|aujourd hui|\d{1,2}[/-]\d{1,2}|from|tomorrow|today)\b",
        r"\b(leave|vacation|holiday|time off)\b",
        r"(نحب|اريد|بدي|عايز).*(عطلة|عطله|اجازة|اجازه|رخصة|رخصه|كونجي)",
        r"(عطلة|عطله|اجازة|اجازه|رخصة|رخصه|كونجي)",
    ),
    CHECK_IN: (
        r"\b(pointer mon entrée|pointer mon entree|check in|check me in|clock in|sign in|j arrive|je commence|arrivée|arrivee|nheb npointi|npointi|rani jit)\b",
        # Arrival affirmations — "I just arrived" / "je viens d'arriver" /
        # "viens d arriver" / "viens darriver" (apostrophe stripped). Distinct
        # from the present-tense "j arrive" above.
        r"\b(viens d'arriver|viens d arriver|viens darriver|just arrived|i arrived)\b",
        r"(دخول|نسجل الدخول|نبصم)",
    ),
    CHECK_OUT: (
        r"\b(pointer ma sortie|check out|clock out|sign out|je pars|départ|depart|sortie|rani khrajt)\b",
        r"(خروج|نسجل الخروج)",
    ),
    REQUEST_DOCUMENT: (
        r"\b(document|attestation|certificat|bulletin|fiche de paie|payslip|certificate|war9a khidma)\b",
        r"(وثيقة|وثيقه|شهادة|شهاده|مستند)",
    ),
    CREATE_TELEWORK: (
        r"\b(télétravail|teletravail|telework|remote work|work from home|wfh|travail a distance|nkhdem remote)\b",
        r"(تليترافاي|عن بعد|العمل عن بعد)",
    ),
    GET_STATUS: (
        r"\b(statut|status|etat|état)\b.*\b(pointage|presence|présence|attendance)\b",
        r"\b(pointage|presence|présence|attendance)\b.*\b(statut|status|etat|état)\b",
        r"\b(est ce que je suis pointe|suis je pointe|am i checked in)\b",
        # Question forms — "did I X?" / "have I X-ed" / "am I X-ed" are
        # status checks, NOT requests to perform X. Must be tried before the
        # CHECK_IN / CHECK_OUT patterns, otherwise the substring "check in"
        # inside the question hijacks the intent.
        r"\b(did i (?:check|clock|sign) (?:in|out)|did i checked in|did i checked out)\b",
        r"\b(have i (?:checked|clocked|signed) (?:in|out))\b",
        r"\b(am i (?:checked|clocked|signed) (?:in|out))\b",
        r"\b(pointit ou nn|statut pointage)\b",
        r"(هل سجلت الحضور|شكون ما بوّنتاش)",
        r"(حالة|حاله).*(الحضور|الدخول|البصمة)",
    ),
}


def match_intent(text: str | None) -> IntentMatch | None:
    value = (text or "").strip().lower()
    if not value:
        return None

    # GET_STATUS is tried first so question forms like "did i check in?" are
    # not hijacked by the CHECK_IN substring "check in".
    for intent in (GET_STATUS, CHECK_IN, CHECK_OUT, CREATE_LEAVE, CREATE_TELEWORK, REQUEST_DOCUMENT):
        for pattern in INTENT_PATTERNS[intent]:
            if re.search(pattern, value, flags=re.IGNORECASE | re.UNICODE):
                return IntentMatch(intent=intent, confidence=0.94, route_intent=INTENT_ROUTE_MAP[intent])
    return None
