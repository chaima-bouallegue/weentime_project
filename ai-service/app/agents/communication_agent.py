from __future__ import annotations

import re
import unicodedata
from uuid import UUID

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, has_any

UUID_RE = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b", re.IGNORECASE)


class CommunicationAgent(ConfirmationMixin, DomainAgent):
    name = "communication"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        channel_id = _channel_id_from_message_or_context(message, context)

        if intent == "communication.list_channels":
            return await self.read_response(
                tool_name="communication.list_channels",
                tool_input={},
                context=context,
                intent=intent,
                success_text="Voici vos canaux de communication.",
                confidence=confidence,
            )

        if intent == "communication.read_messages":
            if not channel_id:
                return AgentResponse(
                    type="ask",
                    text="Quel canal voulez-vous consulter ? Donnez-moi l'identifiant du canal.",
                    intent=intent,
                    confidence=confidence,
                )
            return await self.read_response(
                tool_name="communication.get_channel_messages",
                tool_input={"channel_id": channel_id, "limit": 30},
                context=context,
                intent=intent,
                success_text="Voici les derniers messages visibles.",
                confidence=confidence,
            )

        if intent == "communication.summarize_channel":
            if not channel_id:
                return AgentResponse(
                    type="ask",
                    text="Quel canal voulez-vous resumer ? Donnez-moi l'identifiant du canal.",
                    intent=intent,
                    confidence=confidence,
                )
            return await self.read_response(
                tool_name="communication.summarize_channel",
                tool_input={"channel_id": channel_id, "limit": 50},
                context=context,
                intent=intent,
                success_text="Voici le resume du canal.",
                confidence=confidence,
            )

        if intent == "communication.send_message":
            if not channel_id:
                return AgentResponse(
                    type="ask",
                    text="Dans quel canal voulez-vous envoyer ce message ? Donnez-moi l'identifiant du canal.",
                    intent=intent,
                    confidence=confidence,
                )
            content = _extract_send_content(message)
            if not content:
                return AgentResponse(
                    type="ask",
                    text="Quel message voulez-vous envoyer ?",
                    intent=intent,
                    confidence=confidence,
                )
            return self.confirmation_response(
                context=context,
                tool_name="communication.send_message",
                tool_input={"channel_id": channel_id, "content": content},
                intent=intent,
                text="Confirmez-vous l'envoi de ce message ?",
                confidence=confidence,
                action_result={
                    "kind": "confirmation_summary",
                    "intent": intent,
                    "summary": {
                        "channelId": channel_id,
                        "message": content,
                    },
                },
            )

        return AgentResponse(
            type="ask",
            text="Que souhaitez-vous faire dans la communication ? Je peux lister vos canaux, lire ou resumer un canal.",
            intent="communication.unknown",
            confidence=0.35,
        )

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = _normalize(message)
        if not text:
            return None, 0.0

        if has_any(text, ("envoie", "envoyer", "send", "poster", "publie", "message a", "message dans")):
            if has_any(text, ("message", "canal", "channel", "salon", "discussion")):
                return "communication.send_message", 0.86

        if has_any(
            text,
            (
                "resume canal",
                "resumer canal",
                "summarize channel",
                "summary channel",
                "what did i miss",
                "qu est ce que j ai rate",
                "ce que j ai rate",
            ),
        ):
            return "communication.summarize_channel", 0.84

        if has_any(text, ("lire", "read", "messages", "derniers messages", "latest messages", "canal")) and has_any(
            text,
            ("message", "messages", "canal", "channel", "salon", "discussion"),
        ):
            return "communication.read_messages", 0.78

        if has_any(
            text,
            (
                "mes canaux",
                "canaux",
                "channels",
                "show my channels",
                "list channels",
                "liste les canaux",
                "discussions",
                "salons",
            ),
        ):
            return "communication.list_channels", 0.82

        return None, 0.0


def _channel_id_from_message_or_context(message: str, context: CurrentUserContext) -> str | None:
    match = UUID_RE.search(message or "")
    if match:
        return match.group(0)
    for key in ("channel_id", "active_channel_id", "communication_channel_id"):
        value = context.metadata.get(key)
        if _is_uuid(value):
            return str(value)
    return None


def _extract_send_content(message: str) -> str | None:
    text = (message or "").strip()
    if ":" in text:
        content = text.split(":", 1)[1].strip()
        return content or None

    normalized = _normalize(text)
    markers = ("message", "msg", "dis", "say")
    for marker in markers:
        index = normalized.find(marker)
        if index >= 0:
            original_tail = text[index + len(marker) :].strip(" :-")
            original_tail = UUID_RE.sub("", original_tail).strip(" :-")
            if original_tail:
                return original_tail
    return None


def _is_uuid(value: object) -> bool:
    try:
        UUID(str(value))
        return True
    except (TypeError, ValueError):
        return False


def _normalize(value: str) -> str:
    text = (value or "").strip().lower()
    normalized = unicodedata.normalize("NFKD", text)
    without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
    return " ".join(without_accents.split())
