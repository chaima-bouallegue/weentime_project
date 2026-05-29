from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.nlp.entity_extraction import extract_basic_entities
from app.nlp.intent_patterns import CHECK_IN, CHECK_OUT, GET_STATUS, match_intent
from app.nlp.language_detector import resolve_response_language
from app.nlp.normalization import normalize_text
from app.observability.tracing import log_event, start_span

from .attendance_agent import AttendanceAgent
from .base_domain_agent import DomainAgent
from .legacy_agent import LegacyAgent
from .routing_priority import RoutingDecision, choose_priority_route


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
        language = resolve_response_language(message, context.metadata)
        normalized = normalize_text(message, language)
        context.language = language
        context.metadata["original_text"] = message
        context.metadata["normalized_text"] = normalized
        context.metadata["language"] = language
        context.metadata["requested_language"] = language
        context.metadata["response_language"] = language

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

        priority_decision = choose_priority_route(
            normalized_text=routing_text,
            original_text=message,
            context=context,
            matched_intent=multilingual_match.intent if multilingual_match else None,
        )
        priority_response = await self._handle_priority_decision(
            priority_decision,
            routing_text=routing_text,
            original_message=message,
            normalized_text=normalized,
            context=context,
        )
        if priority_response is not None:
            return priority_response

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

    async def _handle_priority_decision(
        self,
        decision: RoutingDecision | None,
        *,
        routing_text: str,
        original_message: str,
        normalized_text: str,
        context: CurrentUserContext,
    ) -> AgentResponse | None:
        if decision is None:
            return None

        context.metadata["routing_priority"] = decision.category
        context.metadata["routing_priority_reason"] = decision.reason
        if decision.intent:
            context.metadata["rh_hybrid_intent"] = decision.intent
            context.metadata["route_intent"] = decision.intent
            context.metadata["rh_hybrid_confidence"] = decision.confidence
        if decision.entities:
            context.metadata["rh_hybrid_entities"] = decision.entities
        if decision.missing:
            context.metadata["rh_hybrid_missing"] = list(decision.missing)

        if decision.category == "capability_unavailable":
            response = _capability_unavailable_response(decision)
            log_event(
                "router.selected",
                input=original_message,
                output={"agent": "capability_unavailable", "confidence": decision.confidence},
                metadata={
                    "selected_agent": "capability_unavailable",
                    "intent": response.intent,
                    "confidence": decision.confidence,
                    "language": context.language,
                    "routing_reason": decision.reason,
                    "routing_priority": decision.category,
                },
            )
            context.metadata["selected_agent"] = "capability_unavailable"
            return response

        agent = self._agent_by_name(decision.agent_name)
        if agent is None:
            return None

        selected_agent = getattr(agent, "name", agent.__class__.__name__)
        confidence = max(decision.confidence, agent.can_handle(routing_text, context))
        if not decision.force and confidence < 0.5:
            return None

        context.metadata["selected_agent"] = selected_agent
        entities = extract_basic_entities(normalized_text, context.language)
        log_event(
            "router.selected",
            input=original_message,
            output={"agent": selected_agent, "confidence": confidence, "entities": entities},
            metadata={
                "selected_agent": selected_agent,
                "intent": context.metadata.get("route_intent") or context.metadata.get("matched_intent"),
                "confidence": confidence,
                "language": context.language,
                "routing_reason": "central_priority",
                "routing_priority": decision.category,
            },
        )
        agent_text = _priority_agent_text(decision, routing_text, context)
        return await agent.handle(agent_text, context)

    def _agent_by_name(self, name: str | None) -> DomainAgent | None:
        if not name:
            return None
        if name == "attendance":
            return self.attendance_agent
        for agent in self.extra_agents:
            if getattr(agent, "name", None) == name:
                return agent
        return None

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
    # Reunion / planning — read-only domain. NOTE: deliberately excludes "rdv"
    # and "rendez-vous" because those are also valid authorization reasons
    # ("rendez-vous medical"). Restrict to unambiguous meeting/planning vocabulary.
    if _has_any(text, ("reunion", "reunions", "meeting", "meetings", "planning", "agenda", "اجتماع", "اجتماعات", "جدول")):
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
    # Friendly small-talk greetings should not fall through to the provider /
    # unsafe fallback path. Keep this narrow so real domain questions still
    # route to domain agents.
    if any(stripped.startswith(term) for term in _GREETING_TERMS) and any(
        marker in stripped
        for marker in (
            "comment ca va",
            "comment ça va",
            "how are you",
            "how's it going",
        )
    ):
        return True
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


_CAPABILITY_TEXTS = {
    "meeting.create": "Le module de creation de reunion n'est pas encore connecte a l'agent IA.",
    "manager.reports": "La generation de rapports equipe n'est pas encore connectee a l'agent IA.",
    "manager.availability": "La disponibilite equipe n'est pas encore connectee a l'agent IA.",
    "manager.missions": "Le module missions n'est pas encore connecte a l'agent IA.",
    "manager.analytics": "Les analyses avancees equipe ne sont pas encore connectees a l'agent IA.",
    "rh.organisation_assignment": "L'affectation d'un utilisateur a une equipe, un departement ou un manager n'est pas encore connectee a un outil RH verifie. Je peux lister les equipes/departements ou creer une structure si les informations sont completes.",
    "rh.contracts": "Le module contrats RH n'est pas encore connecte a l'agent IA.",
    "rh.e_signature": "La signature electronique RH n'est pas encore connectee a l'agent IA.",
    "admin.service_control": "Le controle des services n'est pas disponible via l'agent IA.",
    "admin.database_operations": "Les operations de sauvegarde/restauration base de donnees ne sont pas disponibles via l'agent IA.",
    "admin.enterprise_creation": "La creation d'entreprise n'est pas encore connectee a un outil admin verifie.",
    "admin.ai_config_mutation": "La modification de configuration IA n'est pas disponible via l'agent IA.",
    "admin.rag_mutation": "Les mutations RAG destructives ou la reindexation ne sont pas disponibles via l'agent IA.",
    "rh.recruitment_training": "Le module recrutement/formation n'est pas encore connecte a l'agent IA.",
    "rh.predictive_analytics": "Les analyses predictives RH ne sont pas encore connectees a l'agent IA.",
    "reports.generation": "La generation de rapports n'est pas encore connectee a l'agent IA.",
    "personal_tasks": "Les rappels, notes et taches personnelles ne sont pas encore connectes a l'agent IA.",
}


def _capability_unavailable_response(decision: RoutingDecision) -> AgentResponse:
    capability = decision.capability or "unknown"
    text = _CAPABILITY_TEXTS.get(
        capability,
        "Cette capacite n'est pas encore disponible dans l'agent IA.",
    )
    return AgentResponse(
        type="answer",
        text=text,
        intent=f"{capability}.unavailable",
        confidence=decision.confidence,
        actionResult={
            "kind": "capability_unavailable",
            "capability": capability,
            "reason": decision.reason,
            "routingPriority": decision.category,
        },
    )


def _priority_agent_text(decision: RoutingDecision, routing_text: str, context: CurrentUserContext) -> str:
    if decision.agent_name == "organisation" and decision.intent:
        entities = decision.entities or {}
        if decision.intent == "rh.structure.department.create":
            name = entities.get("department_name") or _tail_after_topic(routing_text, ("departement", "department"))
            return f"creer departement {name}".strip()
        if decision.intent == "rh.structure.department.list":
            return "liste departements"
        if decision.intent == "rh.structure.team.create":
            name = entities.get("team_name") or _tail_after_topic(routing_text, ("equipe", "team"))
            return f"creer equipe {name}".strip()
        if decision.intent == "rh.structure.team.list":
            return "liste equipes"
    if decision.agent_name != "attendance":
        return routing_text
    matched_intent = context.metadata.get("matched_intent") if isinstance(context.metadata, dict) else None
    if decision.intent == "attendance.self.check_in":
        return "pointer mon entree"
    if decision.intent == "attendance.self.check_out":
        return "pointer ma sortie"
    if decision.intent == "attendance.self.status":
        return "statut pointage"
    if decision.intent == "attendance.self.clarify":
        return "pointe"
    if matched_intent == GET_STATUS or decision.reason == "attendance_status_marker":
        return "statut pointage"
    if matched_intent == CHECK_IN:
        return "pointer mon entree"
    if matched_intent == CHECK_OUT:
        return "pointer ma sortie"
    return routing_text


def _tail_after_topic(text: str, topics: tuple[str, ...]) -> str:
    normalized = (text or "").strip()
    lower = normalized.lower()
    for topic in topics:
        index = lower.find(topic)
        if index >= 0:
            tail = normalized[index + len(topic):].strip()
            return tail.split(",", 1)[0].split(";", 1)[0].strip()
    return ""
