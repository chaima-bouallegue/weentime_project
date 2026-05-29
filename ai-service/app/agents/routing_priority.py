from __future__ import annotations

from dataclasses import dataclass

from app.context.current_user import CurrentUserContext
from app.nlp.intent_patterns import CHECK_IN, CHECK_OUT, GET_STATUS

from .hybrid_intent_router import HybridIntentResult, classify_rh_intent

CENTRAL_ROUTING_PRIORITY: tuple[str, ...] = (
    "greeting",
    "role_digest",
    "attendance",
    "forgot_checkout",
    "reunion",
    "document",
    "authorization",
    "telework",
    "leave",
    "communication",
    "policy",
    "manager",
    "rh",
    "admin",
    "capability_unavailable",
    "fallback",
)


@dataclass(frozen=True, slots=True)
class RoutingDecision:
    category: str
    agent_name: str | None
    reason: str
    confidence: float
    force: bool = False
    capability: str | None = None
    intent: str | None = None
    entities: dict | None = None
    missing: tuple[str, ...] = ()


def choose_priority_route(
    *,
    normalized_text: str,
    original_text: str,
    context: CurrentUserContext,
    matched_intent: str | None = None,
) -> RoutingDecision | None:
    """Resolve one deterministic chatbot routing category before scoring agents.

    The decision does not execute tools. It only selects the safest existing
    agent to ask first, preserving ToolRegistry, confirmation, and ResponseGuard
    authority downstream.
    """
    normalized = _clean(normalized_text)
    original = _clean(original_text)
    text = _join(normalized, original)
    if not text:
        return None

    role = _role(context)

    # 2. Role daily digest / briefing. Greeting is handled in RouterAgent before
    # this classifier so it remains priority 1.
    if _is_role_digest(text):
        return RoutingDecision("role_digest", "role_intelligence", "role_digest_marker", 0.95, force=True)

    if role == "RH" and _is_rh_platform_user_creation(text):
        return RoutingDecision("rh", "rh", "rh_user_creation_capability", 0.94, force=True)

    hybrid_decision = _rh_hybrid_route(message=original_text, normalized_text=text, role=role, context=context)
    if hybrid_decision is not None:
        return hybrid_decision

    page_decision = _page_context_route(text, role, context)
    if page_decision is not None:
        return page_decision

    # Preserve RH operational presence requests for RHAgent. Employee/manager
    # pointage/presence prompts still follow the attendance priority below.
    if role == "RH" and _is_rh_presence(text):
        return RoutingDecision("rh", "rh", "rh_presence_marker", 0.94, force=True)

    rh_capability = _unsupported_rh_capability(text, role)
    if rh_capability:
        return RoutingDecision(
            "capability_unavailable",
            None,
            "rh_unsupported_feature",
            0.9,
            capability=rh_capability,
        )

    # RH operational prompts must beat generic document/insight routing.
    if role == "RH" and _is_rh_workflow(text):
        return RoutingDecision("rh", "rh", "rh_workflow_marker", 0.92, force=True)

    admin_capability = _unsupported_admin_capability(text, role)
    if admin_capability:
        return RoutingDecision(
            "capability_unavailable",
            None,
            "admin_unsupported_feature",
            0.9,
            capability=admin_capability,
        )

    # 3/4. Attendance and forgotten checkout. Keep these before authorization so
    # checkout/check-in phrases are not misread as sortie permissions.
    if _is_forgot_checkout(text):
        return RoutingDecision("forgot_checkout", "attendance", "forgot_checkout_marker", 0.97, force=True)
    if matched_intent == GET_STATUS or _is_attendance_status_question(text):
        return RoutingDecision("attendance", "attendance", "attendance_status_marker", 0.96, force=True)
    if (matched_intent in {CHECK_IN, CHECK_OUT} or _is_attendance(text)) and _attendance_write_allowed(text, role, matched_intent):
        return RoutingDecision("attendance", "attendance", "attendance_marker", 0.96, force=True)



    if role in {"RH", "ADMIN"} and _has_any(
        text,
        (
            "anomalies de presence", "anomalies de présence",
            "anomalies aujourd", "alertes pointage",
            "attendance anomalies", "show anomalies",
            "warini anomalies", "anomalies mta3 lyoum", "alertes 7dour",
        ),
    ):
        return RoutingDecision("rh", "rh", "rh_anomaly_marker", 0.96, force=True)

    if role == "MANAGER" and _has_any(
        text,
        (
            "anomalies de presence", "anomalies de présence",
            "anomalies equipe", "anomalies équipe",
            "team anomalies", "attendance anomalies",
            "warini anomalies",
        ),
    ):
        return RoutingDecision("manager", "manager", "manager_anomaly_marker", 0.96, force=True)

    if role == "MANAGER" and _is_manager_decision(text):
        return RoutingDecision("manager", "manager", "manager_decision_marker", 0.94, force=True)

    if role == "MANAGER" and _has_any(
        text,
        (
            "equipe", "équipe", "team", "mon equipe", "mon équipe",
            "horaire equipe", "horaires equipe", "horaires équipe",
            "planning equipe", "planning équipe",
            "presence equipe", "présence équipe",
            "chkoun absent", "chkoun present",
            "team schedule", "team attendance",
        ),
    ):
        return RoutingDecision(
            "manager",
            "manager",
            "manager_team_context",
            0.95,
            force=True,
        )

    # 5. Meeting/planning. Unsupported meeting creation is explicit capability
    # 5. Meeting/planning. Unsupported meeting creation is explicit capability
    # unavailable; read-only meeting/planning goes to ReunionAgent.
    if _is_meeting_or_planning(text):
        if _has_any(text, _CREATE_TERMS):
            return RoutingDecision(
                "capability_unavailable",
                None,
                "meeting_write_not_wired",
                0.92,
                capability="meeting.create",
            )
        return RoutingDecision("reunion", "reunion", "meeting_or_planning_marker", 0.9, force=True)

    manager_capability = _unsupported_manager_capability(text, role)
    if manager_capability:
        return RoutingDecision(
            "capability_unavailable",
            None,
            "manager_unsupported_feature",
            0.88,
            capability=manager_capability,
        )

    # 6. Documents before leave. "demande de document" contains "demande" but
    # must never be routed to LeaveAgent just because leave also creates requests.
    if _is_document(text):
        return RoutingDecision("document", "document", "document_marker", 0.94, force=True)

    # 7. Authorization info/list/create before telework/leave.
    if _is_authorization(text):
        return RoutingDecision("authorization", "authorization", "authorization_marker", 0.93, force=True)

    # 8. Telework before leave because Tunisian/FR prompts can say "demande".
    if _is_telework(text):
        return RoutingDecision("telework", "telework", "telework_marker", 0.92, force=True)

    # 9. Leave / absence.
    if _is_leave(text):
        return RoutingDecision("leave", "leave", "leave_marker", 0.91, force=True)

    # 10. Communication.
    if _is_communication(text):
        return RoutingDecision("communication", "communication", "communication_marker", 0.88, force=True)

    # 11. Policy / RAG.
    if _is_policy(text):
        return RoutingDecision("policy", "hr_policy", "policy_marker", 0.86, force=True)

    # 12. Manager workflows.
    if role == "MANAGER" and _is_manager_workflow(text):
        return RoutingDecision("manager", "manager", "manager_workflow_marker", 0.9, force=True)

    # 13. RH workflows.
    if role == "RH" and _is_rh_workflow(text):
        return RoutingDecision("rh", "rh", "rh_workflow_marker", 0.9, force=True)

    # 14. Admin workflows.
    if role == "ADMIN" and _is_admin_workflow(text):
        return RoutingDecision("admin", "admin", "admin_workflow_marker", 0.9, force=True)

    # 15. Known unsupported modules should get a clean capability card, never a
    # guard/provider fallback.
    capability = _unsupported_capability(text, role)
    if capability:
        return RoutingDecision("capability_unavailable", None, "known_unsupported_feature", 0.86, capability=capability)

    return None


def _rh_hybrid_route(
    *,
    message: str,
    normalized_text: str,
    role: str,
    context: CurrentUserContext,
) -> RoutingDecision | None:
    if role != "RH":
        return None
    hybrid = classify_rh_intent(message or normalized_text, context=context)
    if hybrid.intent is None:
        return None
    if hybrid.intent.endswith(".unavailable"):
        return RoutingDecision(
            "capability_unavailable",
            None,
            f"rh_hybrid:{hybrid.reason}",
            max(hybrid.confidence, 0.86),
            force=True,
            capability=hybrid.intent,
            intent=hybrid.intent,
            entities=hybrid.entities,
            missing=hybrid.missing,
        )
    if hybrid.confidence < 0.6:
        return None
    agent_name = _agent_for_rh_hybrid_intent(hybrid)
    if agent_name is None:
        return None
    return RoutingDecision(
        "rh_hybrid",
        agent_name,
        f"rh_hybrid:{hybrid.reason}",
        hybrid.confidence,
        force=True,
        intent=hybrid.intent,
        entities=hybrid.entities,
        missing=hybrid.missing,
    )


def _agent_for_rh_hybrid_intent(hybrid: HybridIntentResult) -> str | None:
    intent = hybrid.intent or ""
    if intent in {"rh.structure.employee.assign_team", "rh.structure.manager.assign_team"}:
        return "organisation"
    if intent.startswith("rh.structure.department") or intent.startswith("rh.structure.team"):
        return "organisation"
    if intent.startswith("rh.structure.employee") or intent.startswith("rh.structure.manager"):
        return "organisation"
    if intent.startswith("attendance.self."):
        return "attendance"
    if intent.startswith("rh.policy."):
        return "hr_policy"
    if intent.startswith("rh.message."):
        return "communication"
    if intent.startswith("rh."):
        return "rh"
    return None


def _role(context: CurrentUserContext) -> str:
    return (context.role or "EMPLOYEE").upper().replace("ROLE_", "")


def _page_context_route(text: str, role: str, context: CurrentUserContext) -> RoutingDecision | None:
    metadata = context.metadata if isinstance(context.metadata, dict) else {}
    page = _clean(str(metadata.get("current_page") or ""))
    if role != "RH" or not page:
        return None

    if "/app/rh/structure/departments" in page or "/app/rh/structure/departements" in page:
        if _has_any(text, ("departement", "department", "dept", "قسم")):
            return RoutingDecision("rh_structure", "organisation", "rh_department_page", 0.95, force=True)

    if "/app/rh/structure/equipes" in page or "/app/rh/structure/teams" in page:
        if _has_any(text, ("equipe", "team", "manager", "departement", "department", "فريق")):
            return RoutingDecision("rh_structure", "organisation", "rh_team_page", 0.95, force=True)

    if "/app/rh/conges" in page:
        if _has_any(text, ("conge", "conges", "leave", "demande", "approuve", "approve", "refuse", "reject", "validation")):
            return RoutingDecision("rh", "rh", "rh_leave_page", 0.94, force=True)

    if "/app/rh/pointage" in page:
        if _is_rh_presence(text) or _has_any(text, ("pointage", "presence", "retard", "manual", "corrige", "correction")):
            return RoutingDecision("rh", "rh", "rh_attendance_page", 0.94, force=True)
    return None


def _attendance_write_allowed(text: str, role: str, matched_intent: str | None) -> bool:
    if role != "RH":
        return True
    if matched_intent == GET_STATUS or _is_attendance_status_question(text):
        return True
    return _has_any(
        text,
        (
            "pointer mon entree",
            "pointer mon entr",
            "pointer ma sortie",
            "je pointe maintenant",
            "npointi",
            "rani jit",
            "rani khrajt",
            "سجل الحضور",
            "سجل الخروج",
        ),
    )


def _clean(value: str | None) -> str:
    return " ".join((value or "").lower().replace("’", "'").split())


def _join(*values: str) -> str:
    seen: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.append(value)
    return "\n".join(seen)


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


_CREATE_TERMS = (
    "creer", "cree", "créer", "create", "planifie", "planifier", "schedule", "ajoute", "ajouter", "nheb naamel",
    "أنشئ", "انشئ",
)


def _is_role_digest(text: str) -> bool:
    return _has_any(
        text,
        (
            "daily summary", "daily briefing", "show my daily", "my daily", "today's summary", "today summary",
            "what should i do today", "give me today's summary", "resume du jour", "résumé du jour",
            "resume de ma journee", "résumé de ma journée", "ma journee", "ma journée",
            "digest", "briefing", "priorites", "priorités", "que dois-je faire", "quoi faire",
            "chnowa najem naamel", "shnowa najem naamel", "achnowa naamel",
            "chnowa resume lyoum", "chnowa résumé lyoum", "quoi r sum aujourd hui",
            "donne moi resume", "aatini resume", "que dois je faire aujourd hui",
            "today's team summary", "todays team summary", "today s team summary", "team summary", "manager briefing",
            "resume equipe", "resume de mon equipe", "résumé équipe", "résumé de mon équipe",
            "ملخص", "ماذا افعل اليوم", "ماذا أفعل اليوم",
        ),
    )


def _is_forgot_checkout(text: str) -> bool:
    return _has_any(
        text,
        (
            "did i forget checkout", "did i forget to check out", "forgot checkout", "forgot to check out",
            "oublie de pointer la sortie", "oublié de pointer la sortie", "oublie la sortie", "ai je oublie",
            "ai-je oublie", "j ai oublie", "j'ai oublie", "nsit nkharej", "nsit el khrouj",
            "oublie de pointer", "نسيت نبوّنتي", "نسيت نبونتي", "هل نسيت تسجيل الخروج",
            "نسيت الخروج", "نسيت تسجيل الخروج",
        ),
    )


def _is_attendance(text: str) -> bool:
    if _has_any(text, ("pointage", "pointer", "pointe", "pointé", "attendance")):
        return True
    return _has_any(
        text,
        (
            "did i check in", "did i check out", "check my pointage", "check my attendance",
            "am i checked in", "have i checked in", "je viens d'arriver", "je viens d arriver",
            "viens d'arriver", "viens d arriver", "check me in", "check in", "check out",
            "npointi", "nheb npointi", "pointit ou nn", "statut pointage", "rani jit", "rani khrajt",
            "سجل الحضور", "سجل الخروج",
            "chkoun ma pointach", "شكون ما بوّنتاش",
            "هل سجلت الحضور", "سجلت الحضور", "تسجيل الحضور", "دخول", "خروج",
        ),
    )


def _is_attendance_status_question(text: str) -> bool:
    return _has_any(
        text,
        (
            "est ce que jai pointe", "est ce que j ai pointe", "est ce que je suis pointe",
            "suis je pointe", "suis-je pointe", "did i check in", "did i check out",
            "have i checked in", "have i checked out", "am i checked in", "am i checked out",
            "pointit ou nn", "statut pointage", "هل سجلت الحضور", "هل سجلت الحضور اليوم",
            "هل سجلت الحضور", "هل سجلت الخروج", "سجلت الحضور", "حالة الحضور",
        ),
    )


def _is_rh_presence(text: str) -> bool:
    return _has_any(
        text,
        (
            "presence aujourd", "présence aujourd", "presence today", "company presence",
            "presence rh", "global presence", "presence entreprise",
            "qui n a pas pointe", "qui n'a pas pointe", "qui na pas pointe",
            "qui ma pointach", "ma pointach", "chkoun ma pointach",
            "retards aujourd", "retard aujourd", "late today", "presence du jour",
            "n a pas pointe", "n'ont pas pointe", "n ont pas pointe",
        ),
    )


def _is_meeting_or_planning(text: str) -> bool:
    if _has_any(text, ("reunion", "réunion", "reunions", "meeting", "meetings")):
        return True
    if _has_any(text, ("planning", "agenda", "horaire", "horaires", "schedule", "calendar", "calendrier")):
        return True
    if _has_any(text, ("j ai meeting", "il y a reunion", "fama reunion", "famma reunion", "quoi planningi", "mes reunions")):
        return True
    return _has_any(text, ("aandi meeting", "3andi meeting", "andi meeting", "عندي اجتماع", "اجتماع", "جدول"))


def _is_document(text: str) -> bool:
    return _has_any(
        text,
        (
            "document", "documents", "demande de document", "attestation", "certificat", "certificate",
            "bulletin", "fiche de paie", "payslip", "contrat", "contract", "war9a khidma",
            "attestation de travail", "وثيقة", "وثيقه", "مستند", "شهادة", "شهاده", "كشف الراتب",
        ),
    )


def _is_authorization(text: str) -> bool:
    return _has_any(
        text,
        (
            "autorisation", "autorisations", "authorization", "authorisation", "permission",
            "c quoi les autorisations", "types d'autorisation", "what authorizations", "dispo",
            "rendez vous", "rendez-vous", "rdv", "nokhrej", "sortie anticipee", "sortie anticipée",
            "إذن", "اذن",
        ),
    )


def _is_telework(text: str) -> bool:
    return _has_any(
        text,
        (
            "teletravail", "télétravail", "telework", "remote", "remote work", "work from home", "wfh",
            "travail a distance", "travail à distance", "nkhdem remote", "عن بعد", "تليترافاي",
        ),
    )


def _is_leave(text: str) -> bool:
    if _has_any(text, ("comment declarer", "comment déclarer", "how to declare", "politique", "policy", "faq")):
        return False
    return _has_any(
        text,
        (
            "conge", "congé", "conges", "congés", "leave", "vacation", "holiday", "time off",
            "absence", "malade", "maladie", "sick", "nheb conge", "repos", "mazeli conge",
            "combien reste conge", "كونجي", "عطلة", "عطله", "اجازة", "اجازه",
        ),
    )


def _is_communication(text: str) -> bool:
    return _has_any(
        text,
        (
            "channel", "channels", "canal", "canaux", "message", "messages", "chat", "conversation",
            "envoie un message", "send message", "previens", "préviens", "notify", "mention",
            "رسالة", "قناة",
        ),
    )


def _is_policy(text: str) -> bool:
    if _is_live_data_request(text):
        return False
    return _has_any(
        text,
        (
            "politique", "policy", "regle", "règle", "faq", "comment fonctionne", "comment declarer",
            "comment déclarer", "jours feries", "jours fériés", "maternite", "maternité", "remboursement",
            "سياسة", "قانون", "كيف",
        ),
    )


def _is_live_data_request(text: str) -> bool:
    if _has_any(text, ("politique", "policy", "regle", "règle", "faq", "comment declarer", "comment déclarer")):
        return False
    return _has_any(
        text,
        (
            "leave balance", "solde conge", "combien me reste", "combien il me reste", "jours restants",
            "pointage", "attendance status", "did i check", "checked in", "presence aujourd",
            "pending approvals", "approvals", "validations", "rh backlog",
            "system health", "provider status", "redis status", "braintrust status", "chroma status",
            "users", "utilisateurs", "entreprises", "حالة النظام", "المستخدمين", "الحضور", "كم بقي",
        ),
    )


def _is_manager_workflow(text: str) -> bool:
    return _has_any(
        text,
        (
            "pending approvals", "approvals", "approbations", "validation", "validations", "en attente",
            "approuve", "approve", "valide", "refuse", "reject", "rejette", "accepte", "accept",
            "montre demandes", "demandes en attente", "qui attend validation", "attend validation",
            "pending validations", "equipe", "team",
        ),
    )


def _is_manager_decision(text: str) -> bool:
    return _has_any(text, ("approuve", "approve", "valide", "refuse", "reject", "rejette", "accepte", "accept"))


def _unsupported_manager_capability(text: str, role: str) -> str | None:
    if role != "MANAGER":
        return None
    if _has_any(text, ("rapport equipe", "rapport d equipe", "team report", "genere rapport", "génère rapport", "generer rapport", "générer rapport")):
        return "manager.reports"
    if _has_any(text, ("qui est disponible", "who is available", "team availability", "disponibilite equipe", "disponibilité équipe")):
        return "manager.availability"
    if _has_any(text, ("assigner mission", "assigne mission", "assign mission", "missions ouvertes", "qui travaille sur quoi", "who works on what")):
        return "manager.missions"
    if _has_any(text, ("team analytics", "analytics equipe", "statistiques avancees equipe", "ml anomalies")):
        return "manager.analytics"
    return None


def _is_rh_workflow(text: str) -> bool:
    return _has_any(
        text,
        (
            "rh backlog", "hr backlog", "backlog", "pending validations", "validations en attente",
            "rh stats", "stats rh", "statistiques rh", "document workload", "charge documents",
            "presence aujourd", "présence aujourd", "creer un nouveau user", "créer un nouveau user",
            "create user", "nouveau user", "nouvel employe", "nouvel employé",
            "pending rh", "hr pending", "demandes rh", "demandes en attente rh",
            "demandes en attente",
            "documents en attente", "documents rh", "taux absenteisme", "absenteisme",
            "generer document", "genere document", "creer attestation", "créer attestation",
            "document attestation", "attestation travail", "attestation de travail",
            "شنوه الطلبات المستنيه", "الطلبات المستنيه",
        ),
    )


def _unsupported_rh_capability(text: str, role: str) -> str | None:
    if role != "RH":
        return None
    if _has_any(text, ("contrats expirent", "contrat expire", "contrats finissant", "date expiration contrats", "contract expiry", "expiring contracts")):
        return "rh.contracts"
    if _has_any(text, ("signature electronique", "signature électronique", "signer electroniquement", "e-signature", "electronic signature")):
        return "rh.e_signature"
    if _has_any(text, ("recrutement", "candidat", "entretien", "formation", "training", "candidate")):
        return "rh.recruitment_training"
    if _has_any(text, ("predictif", "prédictif", "prediction", "risque eleve", "risque élevé", "a risque", "à risque", "risk prediction")):
        return "rh.predictive_analytics"
    return None


def _is_rh_platform_user_creation(text: str) -> bool:
    has_create = _has_any(text, ("creer", "créer", "create", "nouveau", "nouvelle", "new", "nzid", "zid"))
    has_user = _has_any(text, ("user", "utilisateur", "compte", "account"))
    return has_create and has_user


def _is_rh_organisation_assignment(text: str) -> bool:
    action = _has_any(text, ("affecter", "affecte", "assign", "assigner", "changer manager", "change manager", "designer manager", "désigner manager"))
    target = _has_any(text, ("user", "utilisateur", "employe", "employé", "salarie", "salarié", "manager", "equipe", "équipe", "team", "departement", "département"))
    create_structure = _has_any(text, ("creer equipe", "créer equipe", "create team", "creer departement", "créer departement", "create department"))
    return action and target and not create_structure


def _is_admin_workflow(text: str) -> bool:
    return _has_any(
        text,
        (
            "system health", "sante systeme", "santé système", "etat systeme", "etat backend", "backend status",
            "ai provider", "provider status", "ollama status", "fournisseur ia",
            "redis", "braintrust", "chroma", "rag status", "chroma status",
            "users", "utilisateurs", "lister utilisateurs", "liste utilisateurs",
            "entreprises", "companies", "lister entreprises",
            "tenant configuration", "configuration tenant", "tenant configuration issues", "configuration issues",
            "donne role", "donne rôle", "changer role", "changer rôle", "create user", "creer utilisateur",
            "créer utilisateur", "assigner manager", "assign manager", "affecte rh", "assign rh",
            "حالة النظام", "حاله النظام", "المستخدمين", "الشركات",
        ),
    )


def _unsupported_admin_capability(text: str, role: str) -> str | None:
    if role != "ADMIN":
        return None
    if _has_any(text, ("redemarrer service", "redémarrer service", "restart service", "deconnecte utilisateur", "disconnect user")):
        return "admin.service_control"
    if _has_any(text, ("backup", "sauvegarde", "restore", "restauration", "base de donnees", "base de données", "database backup", "database restore")):
        return "admin.database_operations"
    if (
        _has_any(text, ("creer entreprise", "créer entreprise", "create enterprise", "create company", "nouvelle entreprise"))
        and not _has_any(text, ("utilisateur", "user"))
    ):
        return "admin.enterprise_creation"
    if _has_any(text, ("changer modele", "changer modèle", "change model", "switch model", "switch provider", "passe sur", "anthropic", "openai", "activer memoire", "activer mémoire", "enable memory", "activer stt", "disable ollama", "provider mutation")):
        return "admin.ai_config_mutation"
    if _has_any(text, ("reconstruire index", "rebuild index", "reindex", "réindex", "reindexer", "réindexer", "supprimer document rag", "supprimer documents rag", "delete rag", "ajouter pdf", "add pdf", "ajoute reglement rh", "ajoute règlement rh")):
        return "admin.rag_mutation"
    return None


def _unsupported_capability(text: str, role: str) -> str | None:
    if _has_any(text, ("redemarrer service", "redémarrer service", "restart service", "deconnecte utilisateur", "disconnect user")):
        return "admin.service_control"
    if _has_any(text, ("backup", "sauvegarde", "restore", "restauration", "base de donnees", "base de données")):
        return "admin.database_operations"
    if _has_any(text, ("recrutement", "candidat", "entretien", "formation", "training", "candidate")):
        return "rh.recruitment_training"
    if _has_any(text, ("predictif", "prédictif", "prediction", "risque eleve", "risque élevé", "a risque", "à risque")):
        return "rh.predictive_analytics"
    if _has_any(text, ("rapport pdf", "generer pdf", "générer pdf", "weekly report", "rapport hebdomadaire")):
        return "reports.generation"
    if role == "EMPLOYEE" and _has_any(text, ("ajoute une note", "add note", "creer une tache", "créer une tâche", "create task", "rappelle moi", "reminder")):
        return "personal_tasks"
    return None
