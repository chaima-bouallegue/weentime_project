from __future__ import annotations

import re
import unicodedata


GREETING = "GREETING"
CHAT = "CHAT"
CREATE_LEAVE = "CREATE_LEAVE"
CREATE_AUTORISATION = "CREATE_AUTORISATION"
CREATE_TELEWORK = "CREATE_TELEWORK"
REQUEST_DOCUMENT = "REQUEST_DOCUMENT"
OPEN_DOCUMENT = "OPEN_DOCUMENT"
GET_LEAVE_BALANCE = "GET_LEAVE_BALANCE"
GET_NOTIFICATIONS = "GET_NOTIFICATIONS"
GET_MY_REQUESTS = "GET_MY_REQUESTS"
APPROVE_REQUEST = "APPROVE_REQUEST"
REJECT_REQUEST = "REJECT_REQUEST"
GET_TEAM_REQUESTS = "GET_TEAM_REQUESTS"
GET_PENDING_VALIDATIONS = "GET_PENDING_VALIDATIONS"
GET_RH_STATS = "GET_RH_STATS"
GET_ALL_REQUESTS = "GET_ALL_REQUESTS"
PROCESS_REQUEST = "PROCESS_REQUEST"


QUESTION_PREFIXES = (
    "comment",
    "pourquoi",
    "quand",
    "combien",
    "quel",
    "quelle",
    "quels",
    "quelles",
    "est ce que",
    "peux tu",
    "peux je",
    "pouvez vous",
)

GREETING_TERMS = ("bonjour", "salut", "hello", "bonsoir", "hey")
QUERY_TERMS = ("voir", "afficher", "montrer", "lister", "consulter", "suivre", "historique", "statut")
LEAVE_TERMS = ("conge", "conges", "vacance", "vacances", "leave")
AUTHORIZATION_TERMS = (
    "autorisation",
    "permission",
    "sortie anticipee",
    "arrivee tardive",
    "rdv medical",
    "rendez vous medical",
)
TELEWORK_TERMS = ("teletravail", "telework", "travail a distance", "remote")
DOCUMENT_TERMS = ("document", "attestation", "bulletin", "paie", "certificat", "contrat", "fiche")
CREATE_TERMS = (
    "creer",
    "cree",
    "demande",
    "demander",
    "soumettre",
    "poser",
    "prendre",
    "je veux",
    "je souhaite",
    "je voudrais",
    "j ai besoin",
    "donne moi",
    "donne",
    "genere",
    "genere moi",
    "fournis",
    "prepare",
)
OPEN_TERMS = ("ouvre", "ouvrir", "telecharge", "telecharger", "consulte", "voir", "affiche")
APPROVE_TERMS = ("approuve", "approuver", "valide", "valider", "accepte", "accepter")
REJECT_TERMS = ("refuse", "refuser", "rejette", "rejeter")


def normalize_text(value: str) -> str:
    lowered = (value or "").strip().lower()
    replacements = {
        "baad ghodwa": "apres demain",
        "ba3d ghodwa": "apres demain",
        "بعد غدوة": "apres demain",
        "بعد غدا": "apres demain",
        "ghodwa": "demain",
        "غدوة": "demain",
        "غدا": "demain",
        "nheb": "je veux",
        "نحب": "je veux",
        "konji": "conge",
        "كونجي": "conge",
        "عطلة مرضية": "conge maladie",
        "عطلة": "conge",
        "إذن خروج": "autorisation sortie",
        "اذن خروج": "autorisation sortie",
        "nokhrej": "sortie",
        "remote": "telework",
    }
    for source, target in replacements.items():
        lowered = lowered.replace(source, target)
    ascii_text = unicodedata.normalize("NFKD", lowered).encode("ascii", "ignore").decode("ascii")
    compact = ascii_text.replace("'", " ")
    compact = re.sub(r"[^a-z0-9:/\-\s]", " ", compact)
    return re.sub(r"\s+", " ", compact).strip()


def is_question(value: str) -> bool:
    normalized = normalize_text(value)
    if "?" in (value or ""):
        return True
    return any(normalized.startswith(prefix) for prefix in QUESTION_PREFIXES)


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def _has_date_or_time_hint(text: str) -> bool:
    return bool(
        re.search(r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b", text)
        or re.search(r"\b\d{1,2}(?::\d{2})?\s*h(?:\s*\d{2})?\b", text)
        or any(
            token in text
            for token in ("demain", "aujourd hui", "apres demain", "tomorrow", "today", "after tomorrow", "du ", "au ", "from ")
        )
    )


def _looks_like_follow_up(text: str, pending_intent: str | None) -> bool:
    if pending_intent in {CREATE_LEAVE, CREATE_TELEWORK}:
        return _has_date_or_time_hint(text)
    if pending_intent == CREATE_AUTORISATION:
        return _has_date_or_time_hint(text) or _contains_any(text, AUTHORIZATION_TERMS)
    if pending_intent == REQUEST_DOCUMENT:
        return _contains_any(text, DOCUMENT_TERMS)
    if pending_intent in {APPROVE_REQUEST, REJECT_REQUEST, PROCESS_REQUEST, OPEN_DOCUMENT}:
        return bool(re.search(r"\b\d+\b", text)) or any(
            label in text for label in ("conge", "autorisation", "teletravail", "document", "absence")
        )
    return False


def detect_intent(text: str, *, role: str = "EMPLOYEE", pending_intent: str | None = None) -> str:
    normalized = normalize_text(text)
    resolved_role = (role or "EMPLOYEE").strip().upper()

    if not normalized:
        return CHAT

    if pending_intent and _looks_like_follow_up(normalized, pending_intent):
        return pending_intent

    if any(normalized == term or normalized.startswith(f"{term} ") for term in GREETING_TERMS):
        return GREETING

    if _contains_any(normalized, DOCUMENT_TERMS) and _contains_any(normalized, OPEN_TERMS) and re.search(r"\b\d+\b", normalized):
        return OPEN_DOCUMENT

    if resolved_role == "MANAGER":
        if _contains_any(normalized, APPROVE_TERMS):
            return APPROVE_REQUEST
        if _contains_any(normalized, REJECT_TERMS):
            return REJECT_REQUEST
        if any(token in normalized for token in ("validation", "validations", "pending", "en attente")):
            return GET_PENDING_VALIDATIONS
        if any(token in normalized for token in ("equipe", "team", "workspace", "demandes equipe")):
            return GET_TEAM_REQUESTS

    if resolved_role == "RH":
        if _contains_any(normalized, APPROVE_TERMS) or _contains_any(normalized, REJECT_TERMS) or "traiter" in normalized:
            return PROCESS_REQUEST
        if any(token in normalized for token in ("stats", "statistiques", "kpi", "indicateur")):
            return GET_RH_STATS
        if any(token in normalized for token in ("toutes les demandes", "toutes demandes", "backlog", "demandes rh", "historique global", "liste des demandes")):
            return GET_ALL_REQUESTS

    if _contains_any(normalized, ("notification", "notifications", "notif")):
        return GET_NOTIFICATIONS

    if any(token in normalized for token in ("solde", "jours restants", "leave balance")) and _contains_any(normalized, LEAVE_TERMS):
        return GET_LEAVE_BALANCE

    if resolved_role == "EMPLOYEE":
        if any(token in normalized for token in ("mes demandes", "mes conges", "mes autorisations", "mes documents", "mes teletravail", "historique")):
            return GET_MY_REQUESTS
        if _contains_any(normalized, QUERY_TERMS) and any(
            token in normalized for token in ("mes", "mon", "ma", "suivi", "demandes")
        ) and (
            _contains_any(normalized, LEAVE_TERMS)
            or _contains_any(normalized, AUTHORIZATION_TERMS)
            or _contains_any(normalized, TELEWORK_TERMS)
            or _contains_any(normalized, DOCUMENT_TERMS)
        ):
            return GET_MY_REQUESTS

    if _contains_any(normalized, DOCUMENT_TERMS) and (_contains_any(normalized, CREATE_TERMS) or resolved_role == "EMPLOYEE"):
        return REQUEST_DOCUMENT

    if _contains_any(normalized, TELEWORK_TERMS) and (_contains_any(normalized, CREATE_TERMS) or _has_date_or_time_hint(normalized)):
        return CREATE_TELEWORK

    if _contains_any(normalized, AUTHORIZATION_TERMS) and (_contains_any(normalized, CREATE_TERMS) or _has_date_or_time_hint(normalized)):
        return CREATE_AUTORISATION

    if _contains_any(normalized, LEAVE_TERMS) and (_contains_any(normalized, CREATE_TERMS) or _has_date_or_time_hint(normalized)):
        return CREATE_LEAVE

    if is_question(text):
        if resolved_role == "MANAGER" and any(token in normalized for token in ("equipe", "team")):
            return GET_TEAM_REQUESTS
        if resolved_role == "RH" and any(token in normalized for token in ("stats", "kpi", "demandes")):
            return GET_ALL_REQUESTS if "demand" in normalized or "demandes" in normalized else GET_RH_STATS
        if resolved_role == "EMPLOYEE" and (
            _contains_any(normalized, LEAVE_TERMS)
            or _contains_any(normalized, DOCUMENT_TERMS)
            or _contains_any(normalized, AUTHORIZATION_TERMS)
            or _contains_any(normalized, TELEWORK_TERMS)
        ):
            return GET_MY_REQUESTS

    return CHAT
