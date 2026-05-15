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
        greeting_response = self._greeting_response(routing_text, message, context)
        if greeting_response is not None:
            context.metadata["selected_agent"] = "greeting"
            log_event(
                "router.selected",
                input=message,
                output={"agent": "greeting", "confidence": greeting_response.confidence},
                metadata={
                    "selected_agent": "greeting",
                    "intent": greeting_response.intent,
                    "confidence": greeting_response.confidence,
                    "language": context.language,
                    "routing_reason": "deterministic_greeting",
                },
            )
            return greeting_response

        role_action_agent = self._role_action_agent(routing_text, context)
        if role_action_agent is not None:
            confidence = role_action_agent.can_handle(routing_text, context)
            selected_agent = getattr(role_action_agent, "name", role_action_agent.__class__.__name__)
            context.metadata["selected_agent"] = selected_agent
            entities = extract_basic_entities(normalized, context.language)
            log_event(
                "router.selected",
                input=message,
                output={"agent": selected_agent, "confidence": confidence, "entities": entities},
                metadata={
                    "selected_agent": selected_agent,
                    "confidence": confidence,
                    "language": context.language,
                    "routing_reason": "role_action",
                },
            )
            return await role_action_agent.handle(routing_text, context)

        explicit_agent = self._explicit_domain_agent(routing_text, context)
        if explicit_agent is not None:
            confidence = explicit_agent.can_handle(routing_text, context)
            selected_agent = getattr(explicit_agent, "name", explicit_agent.__class__.__name__)
            context.metadata["selected_agent"] = selected_agent
            entities = extract_basic_entities(normalized, context.language)
            log_event(
                "router.selected",
                input=message,
                output={"agent": selected_agent, "confidence": confidence, "entities": entities},
                metadata={
                    "selected_agent": selected_agent,
                    "intent": context.metadata.get("route_intent") or context.metadata.get("matched_intent"),
                    "confidence": confidence,
                    "language": context.language,
                    "routing_reason": "explicit_domain",
                },
            )
            return await explicit_agent.handle(routing_text, context)

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

    def _explicit_domain_agent(self, text: str, context: CurrentUserContext) -> DomainAgent | None:
        """Keep explicit domain reads/actions from being swallowed by broad role summaries."""
        normalized = (text or "").lower()
        if not normalized:
            return None

        domain = _explicit_domain(normalized)
        if not domain:
            return None
        for agent in [self.attendance_agent, *self.extra_agents]:
            if getattr(agent, "name", "") == domain and agent.can_handle(normalized, context) >= 0.5:
                return agent
        return None

    def _role_action_agent(self, text: str, context: CurrentUserContext) -> DomainAgent | None:
        normalized = (text or "").lower()
        if not _has_any(normalized, ("approuve", "approve", "valide", "refuse", "reject", "rejette")):
            return None
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        target_name = "rh" if role == "RH" else "manager" if role == "MANAGER" else None
        if not target_name:
            return None
        for agent in self.extra_agents:
            if getattr(agent, "name", "") == target_name and agent.can_handle(normalized, context) >= 0.5:
                return agent
        return None

    def _greeting_response(
        self,
        routing_text: str,
        original_message: str,
        context: CurrentUserContext,
    ) -> AgentResponse | None:
        if not _is_greeting(routing_text) and not _is_greeting(original_message):
            return None
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        text = _GREETING_TEXTS.get(role, _GREETING_TEXTS["EMPLOYEE"])
        return AgentResponse(
            type="answer",
            text=text,
            intent="system.greeting",
            confidence=0.96,
            actionResult={
                "kind": "greeting",
                "agent": "greeting",
                "role": role,
            },
        )


def _explicit_domain(text: str) -> str | None:
    has_list = _has_any(text, ("montre", "voir", "liste", "list", "show", "historique", "mes demandes", "mes"))
    has_create = _has_any(text, ("creer", "cree", "create", "new", "nouveau", "nouvelle", "naamel", "nzid", "أنشئ", "انشئ"))
    if _has_any(text, ("document", "documents", "attestation", "bulletin", "payslip", "certificate")) and has_list:
        return "document"
    if _has_any(text, ("cong", "conge", "conges", "leave", "vacance")) and has_list:
        return "leave"
    if _has_any(text, ("teletravail", "telework", "remote", "travail a distance")) and has_list:
        return "telework"
    if _has_any(text, ("autorisation", "autorisations", "permission")) and has_list:
        return "authorization"
    # Reunion / planning — read-only domain. Route on topic + my-cue or topic + create-cue isn't relevant here.
    if _has_any(text, ("reunion", "reunions", "meeting", "meetings", "rendez vous", "rendez-vous", "rdv", "planning", "agenda", "اجتماع", "اجتماعات", "جدول")):
        return "reunion"
    # Organisation structure — both list and create are valid explicit-domain hits.
    if (_has_any(text, ("equipe", "equipes", "team", "teams", "departement", "departements", "department", "departments", "فريق", "فرق", "قسم"))
            and (has_list or has_create)):
        return "organisation"
    return None


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


_GREETING_TEXTS = {
    "ADMIN": "Bonjour. Je peux vous aider avec la sante systeme, les utilisateurs, les entreprises ou les diagnostics IA.",
    "RH": "Bonjour. Je peux vous aider avec le backlog RH, les validations, les documents ou les employes.",
    "MANAGER": "Bonjour. Je peux vous aider avec votre equipe, les validations et le pointage.",
    "EMPLOYEE": "Bonjour. Je peux vous aider avec vos conges, documents, teletravail, autorisations et pointage.",
}

_GREETING_TERMS: tuple[str, ...] = (
    "bonjour",
    "bonsoir",
    "salut",
    "hello",
    "hi",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
    "salam",
    "salaam",
    "sbah",
    "صباح الخير",
    "مساء الخير",
    "مرحبا",
    "أهلا",
    "اهلا",
)


def _is_greeting(text: str | None) -> bool:
    raw = (text or "").strip().lower()
    if not raw:
        return False
    # Strip surrounding punctuation and normalize spaces.
    stripped = raw.strip(" \t\r\n.,!?:;-")
    # Short greeting alone.
    if stripped in _GREETING_TERMS:
        return True
    # Very short message (<= 4 words) starting with a greeting term.
    words = stripped.split()
    if len(words) <= 4 and any(stripped.startswith(term) for term in _GREETING_TERMS):
        # But not a greeting followed by a real ask ("hello how do i ...").
        return not any(action in stripped for action in (
            "comment", "how", "où", "ou ", "quand", "when", "what", "quoi",
            "pourquoi", "why", "aide", "help", "puis-je", "can i", "peux-tu",
        ))
    return False
