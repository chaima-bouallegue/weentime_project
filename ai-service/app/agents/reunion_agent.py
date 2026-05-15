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
        if intent == "reunion.next":
            result = await self.executor.execute("reunion.next", {}, context)
            return self._answer_response(result, "reunion.next", confidence)
        if intent == "reunion.list_mine":
            result = await self.executor.execute("reunion.list_mine", {}, context)
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

        # Next-meeting cues come before list — "ma prochaine reunion" is more specific than "mes reunions".
        if _has_any(text, _NEXT_CUES):
            return "reunion.next", 0.9

        # "c quoi mon planning" / "what is my schedule today" → treat as listing today's meetings.
        if mentions_planning and _has_any(text, _MY_CUES + ("today", "aujourd hui", "ghodwa", "demain", "اليوم", "غدا")):
            return "reunion.list_mine", 0.84

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
    # EN
    "schedule", "calendar",
    # AR
    "جدول", "روزنامة",
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
    # EN
    "my", "i", "i have", "do i",
    # TN
    "andi", "3andi", "i7awejli",
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
