from __future__ import annotations

import re
import unicodedata

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult

from .base_domain_agent import DomainAgent
from .response_composer import compose_tool_error


class ReunionAgent(DomainAgent):
    """
    Routes natural-language meeting/planning queries to the `reunion.*` tools.

    Read-only. Available to every business role (matching the backend
    `ReunionController` which only requires authentication for these reads).

    Slice 2 covers the most common queries: 'mes reunions', 'ma prochaine
    reunion / what is my next meeting / c quoi mon planning' and Tunisian /
    Arabic equivalents. UUID-detail lookup is exposed as a tool but the agent
    does not yet auto-route a bare UUID to `reunion.get_detail` — that needs
    a UUID-detection pattern and is left for a follow-up to avoid false
    positives on stray hex strings.
    """

    name = "reunion"

    def __init__(self, executor: ToolExecutor) -> None:
        self.executor = executor

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent and not intent.endswith(".unknown") else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        if intent == "planning.unavailable":
            # Manager-side team-schedule prompt ("horaires equipe", "team
            # schedule") routes to the manager-specific capability_unavailable
            # so the frontend can render a manager-flavoured card. The intent
            # name matches the slice 2 allowlist entry.
            if _is_team_schedule_query(message, context):
                return self._team_schedule_unavailable(confidence)
            return self._planning_unavailable(confidence)
        if intent == "reunion.next":
            result = await self.executor.execute("reunion.next", {}, context)
            if not result.success:
                return self._meeting_unavailable(confidence, result)
            return self._answer_response(result, "reunion.next", confidence)
        if intent == "reunion.list_mine":
            result = await self.executor.execute("reunion.list_mine", {}, context)
            if not result.success:
                return self._meeting_unavailable(confidence, result)
            return self._answer_response(result, "reunion.list_mine", confidence)
        return AgentResponse(
            type="ask",
            text=(
                "Que souhaitez-vous savoir sur vos reunions ? Je peux lister vos "
                "reunions ou vous indiquer la prochaine."
            ),
            intent="reunion.unknown",
            confidence=confidence,
        )

    def _meeting_unavailable(self, confidence: float, result: ToolResult) -> AgentResponse:
        # When the reunion backend is not reachable (404 / 401 / 403 / 5xx) we
        # answer with a deterministic capability_unavailable instead of letting
        # the response surface a tool error — ResponseGuard whitelists
        # capability_unavailable, so the user gets the explanation rather than
        # fallback.guard_rejected.
        text = (
            "La gestion des reunions n'est pas encore disponible dans ce contexte. "
            "Vous pouvez consulter vos demandes RH, votre pointage, vos conges, "
            "votre teletravail ou vos autorisations."
        )
        return AgentResponse(
            type="answer",
            text=text,
            intent="meeting.unavailable",
            confidence=confidence,
            actionResult={
                "kind": "capability_unavailable",
                "capability": "reunion",
                "reason": result.error_code or "backend_unavailable",
                "status_code": result.status_code,
            },
        )

    def _team_schedule_unavailable(self, confidence: float) -> AgentResponse:
        text = (
            "Les horaires de l'equipe ne sont pas encore connectes a l'agent IA. "
            "Consultez les depuis l'onglet 'Planning equipe' de l'application; "
            "je peux toujours vous aider sur les validations en attente, le pointage "
            "personnel, vos conges ou vos autorisations."
        )
        return AgentResponse(
            type="answer",
            text=text,
            intent="manager.team_schedule",
            confidence=confidence,
            actionResult={
                "kind": "capability_unavailable",
                "capability": "manager.team_schedule",
                "reason": "tool_not_wired",
            },
        )

    def _planning_unavailable(self, confidence: float) -> AgentResponse:
        # Planning / horaires is its own backend module (HoraireController);
        # the agent doesn't have a friendly "today's schedule" tool wired up
        # yet, so we return a planning-specific message instead of the meeting
        # one — otherwise a "c quoi mon planning" prompt incorrectly blamed
        # the reunion module.
        text = (
            "Le module planning / horaires n'est pas encore connecte a l'agent IA. "
            "Consultez votre planning depuis l'onglet 'Planning' de l'application; "
            "je peux toujours vous aider sur le pointage, les conges, le teletravail "
            "ou les autorisations."
        )
        return AgentResponse(
            type="answer",
            text=text,
            intent="planning.unavailable",
            confidence=confidence,
            actionResult={
                "kind": "capability_unavailable",
                "capability": "planning",
                "reason": "tool_not_wired",
            },
        )

    def detect_intent(
        self,
        message: str,
        context: CurrentUserContext | None = None,
    ) -> tuple[str, float]:
        text = _normalize(message)
        if not text:
            return "reunion.unknown", 0.0

        mentions_meeting = _has_any(text, _MEETING_TERMS)
        mentions_planning = _has_any(text, _PLANNING_TERMS)
        if not (mentions_meeting or mentions_planning):
            return "reunion.unknown", 0.0

        # Planning-only (no meeting words) — route to a planning-specific
        # capability_unavailable. The reunion backend is the wrong target for
        # "c quoi mon planning" / "mes horaires aujourd'hui" — those are
        # served by HoraireController, which we don't have a friendly tool
        # for yet.
        if mentions_planning and not mentions_meeting:
            return "planning.unavailable", 0.9

        # Next-meeting cues come before list — "ma prochaine reunion" is more specific than "mes reunions".
        if _has_any(text, _NEXT_CUES):
            return "reunion.next", 0.9

        if mentions_meeting and _has_any(text, _MY_CUES):
            return "reunion.list_mine", 0.86

        # Short topic-only message ('mes reunions', 'reunions', 'meetings') → list.
        words = text.split()
        if mentions_meeting and len(words) <= 3:
            return "reunion.list_mine", 0.74

        return "reunion.unknown", 0.0

    def _answer_response(
        self,
        result: ToolResult,
        tool_name: str,
        confidence: float,
    ) -> AgentResponse:
        if not result.success:
            return compose_tool_error(tool_name, result)
        data = result.data if isinstance(result.data, dict) else {}
        read = data.get("read_result") if isinstance(data, dict) else None
        if isinstance(read, dict):
            summary = read.get("summary")
        else:
            summary = None
        text = summary if isinstance(summary, str) and summary.strip() else "Voici vos reunions."
        return AgentResponse(
            type="answer",
            text=text,
            intent=tool_name,
            confidence=confidence,
            toolCalls=[ToolCallRecord(name=tool_name, status="success")],
            actionResult=result.model_dump(mode="json"),
        )


# ----- terms ------------------------------------------------------------------

_MEETING_TERMS = (
    # FR / TN
    "reunion", "reunions", "rdv", "rendez vous", "rendez-vous",
    # EN
    "meeting", "meetings",
    # AR
    "اجتماع", "اجتماعات", "مقابلة", "مقابلات",
)

_PLANNING_TERMS = (
    # FR / TN
    "planning", "agenda", "emploi du temps", "calendrier",
    "horaire", "horaires",
    # EN
    "schedule", "calendar",
    # AR
    "جدول", "روزنامة",
)

_TEAM_TERMS = (
    # FR / TN
    "equipe", "equipes", "team", "teams",
    # AR
    "فريق", "فرق",
)

_NEXT_CUES = (
    # FR
    "prochaine", "prochain", "suivante", "suivant",
    # EN
    "next", "upcoming",
    # TN / FR-AR
    "jaya", "jeya", "ghodwa",  # 'next' / 'tomorrow' colloquial
    # AR
    "القادم", "القادمة", "التالي", "التالية",
)

_MY_CUES = (
    # FR / TN
    "mes", "ma", "mon",
    # FR yes/no question forms — "est ce que jai", "ai je", "ai-je"
    "est ce que jai", "est-ce que jai", "est ce que j ai", "est-ce que j ai",
    "ai je", "ai-je", "j ai", "j'ai",
    # TN normalized form: "fama reunion" -> "il y a reunion".
    "il y a",
    # EN — deliberately omit bare "i" because it substring-matches "j'ai" /
    # "rdv" / "médical" and would steal authorization-reason messages.
    "my", "i have", "do i",
    # TN colloquial variants — "aandi" / "3andi" / "andi" all mean "I have"
    "andi", "aandi", "3andi", "i7awejli",
    # AR
    "لي", "عندي",
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


def _is_team_schedule_query(message: str, context: CurrentUserContext) -> bool:
    role = (context.role or "").upper().replace("ROLE_", "")
    if role != "MANAGER":
        return False
    text = _normalize(message)
    return _has_any(text, _TEAM_TERMS)
