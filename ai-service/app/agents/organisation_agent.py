from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult

from .base_domain_agent import DomainAgent
from .response_composer import compose_tool_error

# Roles that should at least be routed here (writes are further role-gated by ToolRegistry).
ROUTABLE_ROLES = {"RH", "ADMIN", "MANAGER"}


class OrganisationAgent(DomainAgent):
    """
    Routes natural-language requests about organisation structure (teams, departments)
    to the `organisation.*` ToolRegistry entries.

    Multilingual coverage: FR, EN, AR, TN (Tunisian / Franco-Arabic).

    Write flows return a confirmation envelope when all required fields are present
    in the same message. When fields are missing, the agent asks one targeted
    question and does not start a multi-turn slot-filling flow — keeping this slice
    additive and reversible. Multi-turn slot-filling for org creates is deferred
    until FLOW_CONFIG in `app/core/slot_filling.py` is extended.
    """

    name = "organisation"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent and not intent.endswith(".unknown") else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        source_text = (context.metadata.get("original_text") if context else None) or message

        if intent == "organisation.list_teams":
            result = await self.executor.execute("organisation.list_teams", {}, context)
            return self._list_response(result, "organisation.list_teams", confidence, "Voici les equipes.")
        if intent == "organisation.list_departments":
            result = await self.executor.execute("organisation.list_departments", {}, context)
            return self._list_response(result, "organisation.list_departments", confidence, "Voici les departements.")

        if intent in {"organisation.create_team", "rh.structure.team.create"}:
            tool_name = "rh.structure.team.create" if intent.startswith("rh.") else "organisation.create_team"
            return self._create_team_response(source_text, context, confidence, intent=intent, tool_name=tool_name)
        if intent in {"organisation.create_department", "rh.structure.department.create"}:
            tool_name = "rh.structure.department.create" if intent.startswith("rh.") else "organisation.create_department"
            return self._create_department_response(source_text, context, confidence, intent=intent, tool_name=tool_name)
        if intent == "rh.structure.department.update":
            return self._update_department_response(source_text, context, confidence)
        if intent == "rh.structure.department.delete":
            return self._delete_department_response(source_text, context, confidence)
        if intent == "rh.structure.employee.assign_team":
            return self._assign_employee_team_response(source_text, context, confidence)
        if intent == "rh.structure.manager.assign_team":
            return self._assign_manager_team_response(source_text, context, confidence)

        return AgentResponse(
            type="ask",
            text=(
                "Que souhaitez-vous faire ? Je peux lister les equipes ou departements, "
                "ou en creer un (RH/ADMIN)."
            ),
            intent="organisation.unknown",
            confidence=confidence,
        )

    # ----- intent detection ---------------------------------------------------

    def detect_intent(
        self,
        message: str,
        context: CurrentUserContext | None = None,
    ) -> tuple[str, float]:
        hybrid_intent = _metadata_hybrid_intent(context)
        if hybrid_intent == "rh.structure.department.create":
            return "organisation.create_department", _metadata_hybrid_confidence(context) or 0.93
        if hybrid_intent in {
            "rh.structure.department.update",
            "rh.structure.department.delete",
            "rh.structure.team.create",
            "rh.structure.employee.assign_team",
            "rh.structure.manager.assign_team",
        }:
            return hybrid_intent, _metadata_hybrid_confidence(context) or 0.93
        if hybrid_intent == "rh.structure.department.list":
            return "organisation.list_departments", _metadata_hybrid_confidence(context) or 0.92
        if hybrid_intent == "rh.structure.team.list":
            return "organisation.list_teams", _metadata_hybrid_confidence(context) or 0.92

        text = _normalize(message)
        if not text:
            return "organisation.unknown", 0.0

        # Arabic forms can change shape under NFKD; check raw lowercased original
        # too so AR script patterns survive normalization edge cases.
        raw_lower = (message or "").lower()

        wants_create = _has_any(text, _CREATE_VERBS) or _has_any(raw_lower, _CREATE_VERBS_RAW)
        wants_list = _has_any(text, _LIST_VERBS) or _has_any(raw_lower, _LIST_VERBS_RAW)
        mentions_team = _has_any(text, _TEAM_TERMS) or _has_any(raw_lower, _TEAM_TERMS_RAW)
        mentions_dept = _has_any(text, _DEPT_TERMS) or _has_any(raw_lower, _DEPT_TERMS_RAW)

        if not (mentions_team or mentions_dept):
            return "organisation.unknown", 0.0

        # Create paths must come first — "creer equipe" beats "list equipes" if both verbs hit.
        if wants_create and mentions_team:
            return "organisation.create_team", 0.9
        if wants_create and mentions_dept:
            return "organisation.create_department", 0.9

        # List paths.
        if mentions_team and (wants_list or _short_topic(text, _TEAM_TERMS)):
            return "organisation.list_teams", 0.82
        if mentions_dept and (wants_list or _short_topic(text, _DEPT_TERMS)):
            return "organisation.list_departments", 0.82

        # Topic mentioned but no clear verb — low confidence ask.
        return "organisation.unknown", 0.0

    # ----- responses ----------------------------------------------------------

    def _list_response(
        self,
        result: ToolResult,
        tool_name: str,
        confidence: float,
        success_text: str,
    ) -> AgentResponse:
        if not result.success:
            return compose_tool_error(tool_name, result)
        data = result.data if isinstance(result.data, dict) else {}
        read = data.get("read_result") if isinstance(data, dict) else None
        count = 0
        if isinstance(read, dict):
            raw_count = read.get("count")
            if isinstance(raw_count, int):
                count = raw_count
            summary = read.get("summary") if isinstance(read.get("summary"), str) else success_text
        else:
            summary = success_text
        text = f"{summary}" if count == 0 else f"{summary}"
        return AgentResponse(
            type="answer",
            text=text,
            intent=tool_name,
            confidence=confidence,
            toolCalls=[ToolCallRecord(name=tool_name, status="success")],
            actionResult=result.model_dump(mode="json"),
        )

    def _create_team_response(
        self,
        source_text: str,
        context: CurrentUserContext,
        confidence: float,
        *,
        intent: str = "organisation.create_team",
        tool_name: str = "organisation.create_team",
    ) -> AgentResponse:
        name = _extract_named_target(source_text, _TEAM_TERMS)
        departement_id = _extract_int_after(source_text, ("departement", "department", "dept", "قسم"))
        if not name:
            return AgentResponse(
                type="ask",
                text="Comment souhaitez-vous nommer cette equipe ?",
                intent=intent,
                confidence=confidence,
            )
        if not departement_id:
            return AgentResponse(
                type="ask",
                text=(
                    f"Pour quel departement (ID numerique) souhaitez-vous creer l'equipe '{name}' ? "
                    "Exemple: 'creer equipe IA dans departement 3'."
                ),
                intent=intent,
                confidence=confidence,
            )
        tool_input: dict[str, Any] = {
            "nom": name,
            "departement_id": departement_id,
            "est_active": True,
        }
        record = self.confirmation_store.create(context, tool_name, tool_input)
        return AgentResponse(
            type="confirm_action",
            text=(
                f"Confirmez-vous la creation de l'equipe '{name}' dans le departement {departement_id} ?"
            ),
            intent=intent,
            confidence=confidence,
            requiresConfirmation=True,
            confirmationId=record.confirmation_id,
            toolCalls=[
                ToolCallRecord(
                    name=tool_name,
                    arguments=tool_input,
                    status="pending_confirmation",
                )
            ],
        )

    def _create_department_response(
        self,
        source_text: str,
        context: CurrentUserContext,
        confidence: float,
        *,
        intent: str = "organisation.create_department",
        tool_name: str = "organisation.create_department",
    ) -> AgentResponse:
        name = _extract_named_target(source_text, _DEPT_TERMS)
        code = _extract_code_interne(source_text)
        if not name:
            return AgentResponse(
                type="ask",
                text="Comment souhaitez-vous nommer ce departement ?",
                intent=intent,
                confidence=confidence,
            )
        if not code:
            return AgentResponse(
                type="ask",
                text=(
                    f"Quel code interne pour le departement '{name}' ? "
                    "Format: lettres majuscules, chiffres et tirets uniquement (ex: TECH, RND-2)."
                ),
                intent=intent,
                confidence=confidence,
            )
        tool_input: dict[str, Any] = {
            "nom": name,
            "code_interne": code,
        }
        record = self.confirmation_store.create(context, tool_name, tool_input)
        return AgentResponse(
            type="confirm_action",
            text=(
                f"Confirmez-vous la creation du departement '{name}' (code: {code}) ?"
            ),
            intent=intent,
            confidence=confidence,
            requiresConfirmation=True,
            confirmationId=record.confirmation_id,
            toolCalls=[
                ToolCallRecord(
                    name=tool_name,
                    arguments=tool_input,
                    status="pending_confirmation",
                )
            ],
        )

    def _update_department_response(
        self,
        source_text: str,
        context: CurrentUserContext,
        confidence: float,
    ) -> AgentResponse:
        department_id = _extract_int_after(source_text, ("departement", "department", "dept", "id"))
        name = _extract_rename_target(source_text) or _extract_named_target(source_text, _DEPT_TERMS)
        code = _extract_code_interne(source_text)
        if not department_id:
            return AgentResponse(
                type="ask",
                text="Quel est l'identifiant numerique du departement a modifier ?",
                intent="rh.structure.department.update",
                confidence=confidence,
            )
        if not (name or code):
            return AgentResponse(
                type="ask",
                text="Que faut-il modifier sur ce departement (nom ou code interne) ?",
                intent="rh.structure.department.update",
                confidence=confidence,
            )
        tool_input: dict[str, Any] = {"department_id": department_id}
        if name:
            tool_input["nom"] = name
        if code:
            tool_input["code_interne"] = code
        record = self.confirmation_store.create(context, "rh.structure.department.update", tool_input)
        return AgentResponse(
            type="confirm_action",
            text=f"Confirmez-vous la mise a jour du departement {department_id} ?",
            intent="rh.structure.department.update",
            confidence=confidence,
            requiresConfirmation=True,
            confirmationId=record.confirmation_id,
            toolCalls=[
                ToolCallRecord(
                    name="rh.structure.department.update",
                    arguments=tool_input,
                    status="pending_confirmation",
                )
            ],
        )

    def _delete_department_response(
        self,
        source_text: str,
        context: CurrentUserContext,
        confidence: float,
    ) -> AgentResponse:
        department_id = _extract_int_after(source_text, ("departement", "department", "dept", "id"))
        if not department_id:
            return AgentResponse(
                type="ask",
                text="Quel est l'identifiant numerique du departement a supprimer ?",
                intent="rh.structure.department.delete",
                confidence=confidence,
            )
        tool_input = {"department_id": department_id}
        record = self.confirmation_store.create(context, "rh.structure.department.delete", tool_input)
        return AgentResponse(
            type="confirm_action",
            text=f"Confirmez-vous la suppression du departement {department_id} ?",
            intent="rh.structure.department.delete",
            confidence=confidence,
            requiresConfirmation=True,
            confirmationId=record.confirmation_id,
            toolCalls=[
                ToolCallRecord(
                    name="rh.structure.department.delete",
                    arguments=tool_input,
                    status="pending_confirmation",
                )
            ],
        )

    def _assign_employee_team_response(
        self,
        source_text: str,
        context: CurrentUserContext,
        confidence: float,
    ) -> AgentResponse:
        user_id = _extract_int_after(source_text, ("employe", "employee", "user", "utilisateur", "salarie", "salarié"))
        team_id = _extract_int_after(source_text, ("equipe", "team"))
        department_id = _extract_int_after_anchor_only(source_text, ("departement", "department", "dept"))
        if not user_id or not team_id:
            return AgentResponse(
                type="ask",
                text="Donnez l'identifiant de l'employe et l'identifiant de l'equipe cible.",
                intent="rh.structure.employee.assign_team",
                confidence=confidence,
                actionResult={"kind": "slot_filling", "missing": ["user_id", "team_id"]},
            )
        tool_input: dict[str, Any] = {"user_id": user_id, "team_id": team_id}
        if department_id:
            tool_input["department_id"] = department_id
        record = self.confirmation_store.create(context, "rh.structure.employee.assign_team", tool_input)
        return AgentResponse(
            type="confirm_action",
            text=f"Confirmez-vous l'affectation de l'employe {user_id} a l'equipe {team_id} ?",
            intent="rh.structure.employee.assign_team",
            confidence=confidence,
            requiresConfirmation=True,
            confirmationId=record.confirmation_id,
            toolCalls=[
                ToolCallRecord(
                    name="rh.structure.employee.assign_team",
                    arguments=tool_input,
                    status="pending_confirmation",
                )
            ],
        )

    def _assign_manager_team_response(
        self,
        source_text: str,
        context: CurrentUserContext,
        confidence: float,
    ) -> AgentResponse:
        manager_id = _extract_int_after(source_text, ("manager", "responsable"))
        team_id = _extract_int_after(source_text, ("equipe", "team"))
        if not manager_id or not team_id:
            return AgentResponse(
                type="ask",
                text="Donnez l'identifiant du manager et l'identifiant de l'equipe cible.",
                intent="rh.structure.manager.assign_team",
                confidence=confidence,
                actionResult={"kind": "slot_filling", "missing": ["manager_id", "team_id"]},
            )
        tool_input = {"manager_id": manager_id, "team_id": team_id}
        record = self.confirmation_store.create(context, "rh.structure.manager.assign_team", tool_input)
        return AgentResponse(
            type="confirm_action",
            text=f"Confirmez-vous l'affectation du manager {manager_id} a l'equipe {team_id} ?",
            intent="rh.structure.manager.assign_team",
            confidence=confidence,
            requiresConfirmation=True,
            confirmationId=record.confirmation_id,
            toolCalls=[
                ToolCallRecord(
                    name="rh.structure.manager.assign_team",
                    arguments=tool_input,
                    status="pending_confirmation",
                )
            ],
        )


# ----- normalization & extraction helpers -------------------------------------

_CREATE_VERBS = (
    # FR
    "creer", "cree", "ajouter", "ajoute", "nouveau", "nouvelle", "ouvrir",
    # EN
    "create", "add", "new", "open",
    # TN / FR-AR
    "naamel", "nzid", "jdid", "jdida", "n9oud",
)

# Arabic create-verb forms — checked against the RAW lowercased message because
# NFKD normalization in `_normalize` decomposes hamza-on-ya/alif variants and
# the resulting string may not contain the source token verbatim.
_CREATE_VERBS_RAW = (
    "أنشئ", "انشئ", "إنشاء", "انشاء", "أضف", "اضف",
)

_LIST_VERBS = (
    # FR
    "liste", "lister", "voir", "montre", "montrer", "afficher", "consulter", "consultes", "donne",
    # EN
    "list", "show", "see", "view", "display", "give",
    # TN
    "warri", "ari", "oraani",
)

_LIST_VERBS_RAW = (
    "اعرض", "أظهر", "اظهر", "قائمة", "قائمه",
)

_TEAM_TERMS = (
    # FR / TN
    "equipe", "equipes",
    # EN
    "team", "teams",
)

_TEAM_TERMS_RAW = (
    "فريق", "فرق",
)

_DEPT_TERMS = (
    # FR / TN
    "departement", "departements",
    # EN
    "department", "departments", "dept",
)

_DEPT_TERMS_RAW = (
    "قسم", "أقسام", "اقسام",
)


def _normalize(message: str) -> str:
    if not message:
        return ""
    text = unicodedata.normalize("NFKD", message)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def _short_topic(text: str, topic_terms: tuple[str, ...]) -> bool:
    """Treat very short topic-only messages (e.g. 'equipes', 'departments') as list intent."""
    words = text.split()
    if len(words) > 3:
        return False
    return any(term in text for term in topic_terms)


_QUOTE_PATTERN = re.compile(r"""[\"“”«»']([^\"“”«»']{1,80})[\"“”«»']""")


def _extract_named_target(source_text: str, topic_terms: tuple[str, ...]) -> str | None:
    """
    Pull the proposed name out of the message. Tries (in order):
      1. Quoted segment ('equipe "IA NLP"').
      2. Token immediately following a topic term ('equipe IA' or 'team IA').
    Returns None when nothing reasonable was found.
    """
    if not source_text:
        return None
    quoted = _QUOTE_PATTERN.search(source_text)
    if quoted:
        candidate = quoted.group(1).strip()
        if candidate:
            return candidate
    text = source_text
    lower = _normalize(text)
    for term in topic_terms:
        pos = lower.find(term)
        if pos < 0:
            continue
        # Walk past the term and find the next non-stopword token of the original text.
        after = text[pos + len(term):].strip()
        if not after:
            continue
        tokens = re.split(r"[,;\.\!\?]", after, maxsplit=1)[0].split()
        cleaned: list[str] = []
        for token in tokens:
            low = _normalize(token)
            if low in _NAME_STOPWORDS or low.isdigit():
                if cleaned:
                    break
                continue
            cleaned.append(token.strip("'\"«»“”"))
            if len(cleaned) >= 4:
                break
        if cleaned:
            return " ".join(cleaned).strip(" '\"«»“”")
    return None


_NAME_STOPWORDS = {
    # FR
    "de", "du", "des", "la", "le", "les", "un", "une", "pour", "dans", "au", "aux", "en",
    # EN
    "the", "a", "an", "in", "for", "of", "to",
    # TN
    "fi", "lel", "lil",
    # AR
    "في", "من", "إلى", "الى", "على",
    # Generic / field anchors that signal the name ended.
    "nouveau", "nouvelle", "new", "id",
    "code", "manager", "responsable", "responsible", "departement", "department",
}


def _extract_int_after(source_text: str, anchors: tuple[str, ...]) -> int | None:
    if not source_text:
        return None
    lower = _normalize(source_text)
    for anchor in anchors:
        match = re.search(rf"{re.escape(anchor)}\s*(?:#|n[°o]\s*)?(\d{{1,7}})", lower)
        if match:
            try:
                return int(match.group(1))
            except (TypeError, ValueError):
                continue
    # Fallback: standalone integer in a short message.
    # Only trust when explicit anchors fail and the message is short.
    if len(lower.split()) <= 8:
        fallback = re.search(r"(?<!\d)(\d{1,5})(?!\d)", lower)
        if fallback:
            try:
                return int(fallback.group(1))
            except (TypeError, ValueError):
                return None
    return None


def _extract_int_after_anchor_only(source_text: str, anchors: tuple[str, ...]) -> int | None:
    if not source_text:
        return None
    lower = _normalize(source_text)
    for anchor in anchors:
        match = re.search(rf"{re.escape(anchor)}\s*(?:#|n[Â°o]\s*)?(\d{{1,7}})", lower)
        if match:
            try:
                return int(match.group(1))
            except (TypeError, ValueError):
                continue
    return None


_CODE_PATTERN = re.compile(r"(?<![A-Z0-9-])([A-Z][A-Z0-9-]{1,31})(?![A-Z0-9-])")


def _extract_code_interne(source_text: str) -> str | None:
    if not source_text:
        return None
    # Try explicit anchors first (handles "code TECH", "code: TECH-2").
    anchored = re.search(r"code\s*(?:interne)?\s*[:\-]?\s*([A-Z0-9-]{2,32})", source_text, re.IGNORECASE)
    if anchored:
        candidate = anchored.group(1).upper().strip("-")
        if _is_valid_code(candidate):
            return candidate
    # Fall back to the first standalone upper-case token (avoiding common French acronyms used in normal text).
    for match in _CODE_PATTERN.finditer(source_text):
        candidate = match.group(1).upper().strip("-")
        if _is_valid_code(candidate) and candidate not in _CODE_BLACKLIST:
            return candidate
    return None


def _extract_rename_target(source_text: str) -> str | None:
    if not source_text:
        return None
    patterns = (
        r"\b(?:en|to|vers|l)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ'-]{1,80})\b",
        r"\b(?:rename|renomme|baddel)\b.+?\b(?:en|to|vers|l)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ'-]{1,80})\b",
    )
    for pattern in patterns:
        match = re.search(pattern, source_text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip(" '\"«»“”")
            if candidate and _normalize(candidate) not in _NAME_STOPWORDS:
                return candidate
    return None


def _metadata_hybrid_intent(context: CurrentUserContext | None) -> str | None:
    metadata = context.metadata if context is not None and isinstance(context.metadata, dict) else {}
    value = metadata.get("rh_hybrid_intent")
    return str(value).strip() if value else None


def _metadata_hybrid_confidence(context: CurrentUserContext | None) -> float | None:
    metadata = context.metadata if context is not None and isinstance(context.metadata, dict) else {}
    try:
        return float(metadata.get("rh_hybrid_confidence"))
    except (TypeError, ValueError):
        return None


_CODE_BLACKLIST = {"ID", "RH", "RDV", "ETC", "API", "HR"}


def _is_valid_code(text: str) -> bool:
    if not text or len(text) < 2 or len(text) > 32:
        return False
    return all(c.isalnum() or c == "-" for c in text) and any(c.isalpha() for c in text)
