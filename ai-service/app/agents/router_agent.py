from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.nlp.entity_extraction import extract_basic_entities
from app.nlp.intent_patterns import CHECK_IN, CHECK_OUT, GET_STATUS, match_intent
from app.nlp.language_detector import detect_language
from app.nlp.normalization import normalize_text
from app.observability.tracing import log_event, start_span

from .attendance_agent import AttendanceAgent
from .base_domain_agent import DomainAgent
from .legacy_agent import LegacyAgent


class RouterAgent:
    def __init__(
        self,
        attendance_agent: AttendanceAgent,
        extra_agents: list[DomainAgent] | None = None,
        legacy_agent: LegacyAgent | None = None,
    ) -> None:
        self.attendance_agent = attendance_agent
        self.extra_agents = extra_agents or []
        self.legacy_agent = legacy_agent

    async def handle(self, message: str, context: CurrentUserContext):
        language = detect_language(message)
        normalized = normalize_text(message, language)
        context.language = language
        context.metadata["original_text"] = message
        context.metadata["normalized_text"] = normalized
        context.metadata["language"] = language

        multilingual_match = match_intent(normalized) or match_intent(message)
        if multilingual_match is not None:
            context.metadata["matched_intent"] = multilingual_match.intent
            context.metadata["route_intent"] = multilingual_match.route_intent

        routing_text = normalized or message
        candidates: list[tuple[float, DomainAgent]] = []
        candidates.append((self.attendance_agent.can_handle(routing_text, context), self.attendance_agent))
        for agent in self.extra_agents:
            candidates.append((agent.can_handle(routing_text, context), agent))
        confidence, agent = max(candidates, key=lambda item: item[0])

        entities = extract_basic_entities(normalized, context.language)
        selected_agent = getattr(agent, "name", agent.__class__.__name__)
        with start_span(
            "router.detect_intent",
            {
                "language": context.language,
                "normalized_length": len(normalized or ""),
                "matched_intent": multilingual_match.intent if multilingual_match else None,
                "route_intent": multilingual_match.route_intent if multilingual_match else None,
                "selected_agent": selected_agent,
                "confidence": confidence,
                "entities": entities,
            },
        ):
            if multilingual_match and multilingual_match.intent in {CHECK_IN, CHECK_OUT, GET_STATUS}:
                context.metadata["selected_agent"] = "attendance"
                attendance_text = routing_text
                if multilingual_match.intent == GET_STATUS:
                    attendance_text = "statut pointage"
                elif multilingual_match.intent == CHECK_IN:
                    attendance_text = "pointer mon entree"
                elif multilingual_match.intent == CHECK_OUT:
                    attendance_text = "pointer ma sortie"
                log_event(
                    "router.selected",
                    input=message,
                    output={
                        "agent": "attendance",
                        "confidence": multilingual_match.confidence,
                        "intent": multilingual_match.intent,
                        "entities": entities,
                    },
                    metadata={
                        "selected_agent": "attendance",
                        "intent": multilingual_match.intent,
                        "confidence": multilingual_match.confidence,
                        "language": context.language,
                    },
                )
                return await self.attendance_agent.handle(attendance_text, context)

            if confidence >= 0.55:
                context.metadata["selected_agent"] = selected_agent
                log_event(
                    "router.selected",
                    input=message,
                    output={"agent": selected_agent, "confidence": confidence, "entities": entities},
                    metadata={
                        "selected_agent": selected_agent,
                        "intent": context.metadata.get("route_intent") or context.metadata.get("matched_intent"),
                        "confidence": confidence,
                        "language": context.language,
                    },
                )
                return await agent.handle(routing_text, context)

            if multilingual_match and self.legacy_agent is None:
                context.metadata["selected_agent"] = "none"
                return AgentResponse(
                    type="ask",
                    text="J'ai compris votre intention, mais aucun agent n'est disponible pour la traiter.",
                    intent=multilingual_match.intent,
                    confidence=multilingual_match.confidence,
                )

        if self.legacy_agent is not None and self.legacy_agent.can_handle(message, context):
            context.metadata["selected_agent"] = "legacy"
            log_event(
                "router.selected",
                input=message,
                output={"agent": "legacy", "confidence": self.legacy_agent.can_handle(message, context)},
                metadata={
                    "selected_agent": "legacy",
                    "intent": context.metadata.get("route_intent") or context.metadata.get("matched_intent") or "legacy.fallback",
                    "confidence": self.legacy_agent.can_handle(message, context),
                    "language": context.language,
                },
            )
            return await self.legacy_agent.handle(message, context)

        return AgentResponse(
            type="ask",
            text=(
                "Je n'ai pas encore compris cette demande. Pouvez-vous la reformuler ?"
            ),
            intent="fallback.unknown",
            confidence=0.35,
        )
