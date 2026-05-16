from __future__ import annotations

import re
from abc import ABC, abstractmethod
from typing import Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse

from .guard_result import GuardResult

GUARD_CATEGORIES = {
    "hallucinated_hr_value",
    "unsupported_status",
    "unsupported_tool_claim",
    "fake_confirmation",
    "missing_citation",
    "secret_leak",
    "unsafe_role_claim",
    "unsafe_tenant_claim",
}

SUPPORTED_STATUSES = {
    "ACTIVE", "INACTIVE", "SUSPENDED", "ACTIF", "INACTIF",
    "EN_ATTENTE", "EN_ATTENTE_MANAGER", "EN_ATTENTE_RH", "EN_ATTENTE_VALIDATION",
    "PENDING", "APPROUVEE", "APPROUVE", "APPROVED",
    "VALIDEE", "VALIDE", "VALIDATED",
    "REFUSEE", "REFUSE", "REJECTED", "REJETEE", "REJETE",
    "PRET", "READY", "EN_COURS", "IN_PROGRESS",
    "BROUILLON", "DRAFT", "ANNULEE", "ANNULE", "CANCELLED",
    "SUCCESS", "FAILED", "BUSINESS_CONFLICT", "WARNING", "UNAVAILABLE", "OK",
    "CHECKED_IN", "CHECKED_OUT", "CLOSED", "PRESENT", "ABSENT", "RETARD", "LATE",
    # Presence session-state values produced by /presence/me/today (Spring
    # PresenceController). Real backend payloads include both a `status`
    # (ABSENT/PRESENT/LATE) AND a `state` (NOT_STARTED, COMPLETED, PAUSED, ...).
    "NOT_STARTED", "COMPLETED", "PAUSED", "OPEN", "EXPIRED",
    # Deterministic local component statuses returned by admin.system_health,
    # admin.provider_status, admin.redis_status, admin.braintrust_status,
    # admin.rag_status — these come from Settings, never from LLM output.
    "REACHABLE", "UNREACHABLE",
    "CONFIGURED", "DISABLED", "ENABLED",
    "CHROMA", "LOCAL_KEYWORD", "NOOP", "INMEMORY",
    "DEGRADED", "OFFLINE", "ONLINE",
    # Lookup-result statuses emitted by ManagerAgent / RHAgent approval flows
    # (kind=approval_lookup) — these are deterministic resolution states from
    # the agent, not LLM-invented business statuses.
    "NOT_FOUND", "AMBIGUOUS",
}

UNAVAILABLE_POLICY_TEXT = "Je n'ai pas trouve de source RH approuvee"

SAFE_NO_EVIDENCE_INTENTS = {
    "greeting",
    "system.greeting",
    "fallback.unknown",
    "chat",
    "leave.cancelled",
    "leave.create.cancelled",
    "authorization.create.cancelled",
    "authorization.cancelled",
    "telework.create.cancelled",
    "telework.cancelled",
    "conversation.explain_last_error",
    # Capability-unavailable answers carry deterministic text + a
    # capability_unavailable action; they must never be downgraded to an
    # unsafe fallback even when their text mentions HR-flavoured terms
    # ("aucune reunion disponible", "non disponible pour votre role", ...).
    "capability.unavailable",
    "planning.unavailable",
    "planning_horaires.unavailable",
    "meeting.unavailable",
    "meetings.unavailable",
    "reunion.unavailable",
    "rh.create_user_unavailable",
    "rh.organisation_assignment_unavailable",
    "admin.create_user_unavailable",
    "admin.assign_user_unavailable",
    "authorization.info",
    "authorization.types",
    # Slot-filling asks (the agent is collecting missing fields, not making
    # claims). Text comes from a templated "what date / what time?" prompt,
    # never from LLM-invented HR values. Origins: authorization_agent,
    # leave_agent, telework_agent, document_agent slot-filling paths.
    "authorization.create.ask",
    "leave.create.ask",
    "telework.create.ask",
    "document.create.ask",
    # Manager safe reads. Text summarises tool output deterministically, OR
    # returns a capability_unavailable card when the wrapped backend endpoint
    # has no AI tool yet (see docs/superpowers/specs/2026-05-16-backend-
    # capability-map.md). Never carries free-form LLM HR claims.
    "manager.pending_approvals",
    "manager.team_requests",
    "manager.team_schedule",
    "manager.team_presence",
    "manager.team_attendance",
    # Planning / meetings list success-path intents. Their *.unavailable
    # siblings are already allowlisted above; allowlisting the success path
    # too prevents guard_rejected when a real list is returned with a
    # template wrapper.
    "planning.list",
    "meetings.list",
}


class GuardRule(ABC):
    category: str

    @abstractmethod
    def evaluate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        raise NotImplementedError


def _intent(response: AgentResponse) -> str:
    return (response.intent or "").strip().lower()


def _is_safe_no_evidence_response(response: AgentResponse) -> bool:
    return _intent(response) in SAFE_NO_EVIDENCE_INTENTS


class SecretLeakRule(GuardRule):
    category = "secret_leak"

    _patterns = (
        re.compile(r"authorization\s*:\s*bearer\s+", re.IGNORECASE),
        re.compile(r"bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", re.IGNORECASE),
        re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
        re.compile(r"\b(?:JWT_SECRET|AI_JWT_SECRET|BRAINTRUST_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|DATABASE_URL)\s*[:=]", re.IGNORECASE),
        re.compile(r"\b(?:sk-[A-Za-z0-9_-]{16,}|bt_[A-Za-z0-9_-]{16,})\b"),
        re.compile(r"\b(?:postgresql|postgres|mysql|mongodb|redis)://[^\s]+", re.IGNORECASE),
        re.compile(r"jdbc:postgresql://[^\s]+", re.IGNORECASE),
    )

    def evaluate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        scan = _response_scan_text(response)
        for pattern in self._patterns:
            if pattern.search(scan):
                return GuardResult.reject(self.category, "Response may expose a secret or credential.")
        return GuardResult.allow()


class PolicyCitationRule(GuardRule):
    category = "missing_citation"

    def evaluate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        intent = _intent(response)
        action = response.actionResult if isinstance(response.actionResult, dict) else {}
        if not intent.startswith("policy") and action.get("kind") != "policy_answer":
            return GuardResult.allow()

        citations = _citations_from_action(action)
        policy_available = action.get("policyAvailable")
        unavailable_text = UNAVAILABLE_POLICY_TEXT.lower() in (response.text or "").lower()
        if policy_available is False or unavailable_text:
            return GuardResult.allow()
        if not citations:
            return GuardResult.reject(self.category, "Policy response has no approved source citations.")
        return GuardResult.allow()


class FakeConfirmationRule(GuardRule):
    category = "fake_confirmation"

    _success_words = (
        "action confirmee", "action confirmée",
        "demande creee", "demande créée",
        "a ete creee", "a été créée",
        "a ete approuvee", "a été approuvée",
        "a ete refusee", "a été refusée",
        "pointage confirme", "pointage confirmé",
        "checked in", "checked out",
        "approved", "rejected",
        "created successfully",
    )

    def evaluate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        if _is_safe_no_evidence_response(response):
            return GuardResult.allow()
        if response.requiresConfirmation or response.type == "confirm_action":
            return GuardResult.allow()
        if response.type == "execute_action" and not _has_successful_action_evidence(response):
            return GuardResult.reject(self.category, "Response claims execution without successful tool evidence.")
        if _looks_like_write_success(response.text) and not _has_any_tool_evidence(response):
            return GuardResult.reject(self.category, "Response claims a write action succeeded without tool evidence.")
        # Backend failure must never render as success. If the text reads as a
        # write-success but the action result / tool calls indicate failure or
        # error, reject — otherwise the user sees "Action approved" on a
        # backend 4xx/5xx.
        if _looks_like_write_success(response.text) and _has_failure_evidence(response):
            return GuardResult.reject(self.category, "Response claims success while tool evidence indicates failure.")
        return GuardResult.allow()


def _looks_like_write_success(text: str | None) -> bool:
    lowered = (text or "").lower()
    return any(word in lowered for word in FakeConfirmationRule._success_words)


class UnsupportedToolClaimRule(GuardRule):
    category = "unsupported_tool_claim"

    _tool_like = re.compile(
        r"\b(?:admin|leave|document|telework|authorization|attendance|communication|legacy|policy|insights)\.[a-z_]+",
        re.IGNORECASE,
    )
    _claim_words = ("execute", "executed", "appele", "appelé", "called", "success", "succes", "succès")

    def evaluate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        if _is_safe_no_evidence_response(response):
            return GuardResult.allow()
        if response.requiresConfirmation or response.type == "confirm_action":
            return GuardResult.allow()

        lowered = (response.text or "").lower()
        if self._tool_like.search(lowered) and any(word in lowered for word in self._claim_words) and not response.toolCalls:
            return GuardResult.reject(self.category, "Response claims an unsupported tool execution.")

        for call in response.toolCalls:
            if call.status and call.status not in {"success", "failed", "pending", "business_conflict", "denied"}:
                return GuardResult.reject(self.category, "Response contains an unsupported tool call status.")
        return GuardResult.allow()


class HallucinatedHrValueRule(GuardRule):
    category = "hallucinated_hr_value"

    _leave_balance = re.compile(r"\b(?:reste|remaining|left)\s+\d+(?:[,.]\d+)?\s+(?:jours?|days?)\b", re.IGNORECASE)
    _attendance_status = re.compile(r"\b(?:vous\s+etes\s+(?:pointe|pointé|present|présent|absent)|you\s+are\s+(?:checked\s+in|present|absent))\b", re.IGNORECASE)
    _request_status = re.compile(r"\b(?:demande|request)\b.{0,80}\b(?:approuvee|approuvée|approved|refusee|refusée|rejected|en attente|pending)\b", re.IGNORECASE)
    _users_count = re.compile(r"\b\d+\s+(?:utilisateurs?|users?|employes|employés|employees?)\b", re.IGNORECASE)

    def evaluate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        if _is_safe_no_evidence_response(response):
            return GuardResult.allow()
        if _has_authoritative_data(response):
            return GuardResult.allow()

        text = response.text or ""
        if (
            self._leave_balance.search(text)
            or self._attendance_status.search(text)
            or self._request_status.search(text)
            or self._users_count.search(text)
        ):
            return GuardResult.reject(self.category, "Response contains HR data without authoritative tool evidence.")
        return GuardResult.allow()


class UnsupportedStatusRule(GuardRule):
    category = "unsupported_status"

    def evaluate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        if response.requiresConfirmation or response.type == "confirm_action":
            return GuardResult.allow()

        values = []
        if isinstance(response.actionResult, dict):
            values.extend(_status_values(response.actionResult))
        for call in response.toolCalls:
            if call.status:
                values.append(call.status)

        for value in values:
            normalized = str(value or "").strip().upper().replace(" ", "_")
            if normalized and normalized not in SUPPORTED_STATUSES:
                return GuardResult.reject(
                    self.category,
                    "Response contains an unsupported business status.",
                    details={"status": normalized},
                )
        return GuardResult.allow()


class UnsafeRoleClaimRule(GuardRule):
    category = "unsafe_role_claim"

    def evaluate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        if context is None:
            return GuardResult.allow()

        text = (response.text or "").lower()
        role = (context.role or "").upper().replace("ROLE_", "")
        claims = {
            "ADMIN": ("votre role est admin", "vous etes admin", "you are admin"),
            "RH": ("votre role est rh", "vous etes rh", "you are hr"),
            "MANAGER": ("votre role est manager", "vous etes manager", "you are manager"),
            "EMPLOYEE": ("votre role est employee", "votre role est employe", "you are employee"),
        }
        for claimed_role, markers in claims.items():
            if claimed_role != role and any(marker in text for marker in markers):
                return GuardResult.reject(self.category, "Response claims an unsafe role.")
        return GuardResult.allow()


class UnsafeTenantClaimRule(GuardRule):
    category = "unsafe_tenant_claim"

    def evaluate(self, response: AgentResponse, context: CurrentUserContext | None = None) -> GuardResult:
        if context is None or not isinstance(response.actionResult, dict):
            return GuardResult.allow()
        if (context.role or "").upper().replace("ROLE_", "") == "ADMIN":
            return GuardResult.allow()

        for value in _tenant_values(response.actionResult):
            try:
                tenant_value = int(value)
            except (TypeError, ValueError):
                continue
            if context.tenant_id is not None and tenant_value != context.tenant_id:
                return GuardResult.reject(self.category, "Response contains data for another tenant.")
        return GuardResult.allow()


def default_guard_rules() -> list[GuardRule]:
    return [
        SecretLeakRule(),
        PolicyCitationRule(),
        FakeConfirmationRule(),
        UnsupportedToolClaimRule(),
        HallucinatedHrValueRule(),
        UnsupportedStatusRule(),
        UnsafeRoleClaimRule(),
        UnsafeTenantClaimRule(),
    ]


def _response_scan_text(response: AgentResponse) -> str:
    parts = [response.text or "", response.intent or ""]
    if isinstance(response.actionResult, dict):
        parts.append(str(response.actionResult))
    for call in response.toolCalls:
        parts.append(str(call.model_dump(mode="json")))
    return "\n".join(parts)


def _citations_from_action(action: dict[str, Any]) -> list[Any]:
    citations = action.get("citations")
    if isinstance(citations, list):
        return citations

    data = action.get("data")
    if isinstance(data, dict):
        citations = data.get("citations")
        if isinstance(citations, list):
            return citations

    read_result = action.get("read_result")
    if isinstance(read_result, dict):
        data = read_result.get("data")
        if isinstance(data, dict):
            citations = data.get("citations")
            if isinstance(citations, list):
                return citations

    return []


def _has_successful_action_evidence(response: AgentResponse) -> bool:
    action = response.actionResult if isinstance(response.actionResult, dict) else {}
    if action.get("success") is True:
        return True
    if action.get("kind") == "write_result" and not action.get("error"):
        return True

    data = action.get("data")
    if isinstance(data, dict) and data.get("kind") == "write_result" and not data.get("error"):
        return True

    return any(call.status in {"success", "business_conflict"} for call in response.toolCalls)


def _has_any_tool_evidence(response: AgentResponse) -> bool:
    return bool(response.toolCalls or response.actionResult)


def _has_failure_evidence(response: AgentResponse) -> bool:
    action = response.actionResult if isinstance(response.actionResult, dict) else {}
    if action.get("success") is False:
        return True
    if action.get("error"):
        return True
    data = action.get("data")
    if isinstance(data, dict):
        if data.get("success") is False or data.get("error"):
            return True
    return any(call.status in {"failed", "denied"} for call in response.toolCalls)


def _has_authoritative_data(response: AgentResponse) -> bool:
    if not isinstance(response.actionResult, dict):
        return False

    action = response.actionResult
    if action.get("success") is True:
        return True

    if action.get("kind") in {
        "read_result",
        "write_result",
        "policy_answer",
        "role_summary",
        "role_intelligence_digest",
        "insight_report",
        # RH-specific aggregator kinds. RHAgent._read_rh_requests fans out to
        # 4 tools and folds their read_results into `sections`, which are the
        # real evidence. The wrapper kind names must be whitelisted so the
        # natural text "X demandes en attente" does not trip the regex check.
        "rh_request_summary",
        "rh_capability_unavailable",
        "approval_lookup",
        "approval_confirmation",
        "capability_unavailable",
        # Greetings + capability hints come from deterministic agents, not LLM
        # invention. Their text is template-driven, so HR-keyword false
        # positives must not produce fallback.guard_rejected.
        "greeting",
        "capability_hint",
        # Admin diagnostics — produced by AdminTools.* status tools fed by
        # local checks (Settings, ProviderRouter health, Redis/Braintrust
        # toggles). They report tool-backed status, not LLM claims.
        "system_health_report",
        "provider_status_report",
        "redis_status_report",
        "braintrust_status_report",
        "rag_status_report",
        "diagnostics_summary",
        # Slot-filling intermediate state and confirmation summaries are also
        # deterministic, not LLM-invented.
        "slot_filling",
        "confirmation_summary",
        "confirmation_result",
        # ManagerAgent._read_pending_requests fans out to leave/telework/
        # authorization list_manager_requests tools and folds the read_results
        # into `sections`. The wrapper kind name must be whitelisted so the
        # natural summary text does not trip _request_status / _users_count.
        "manager_pending_summary",
    }:
        return True

    data = action.get("data")
    if isinstance(data, dict):
        read_result = data.get("read_result")
        if isinstance(read_result, dict) and read_result.get("kind") == "read_result":
            return True

    read_result = action.get("read_result")
    return isinstance(read_result, dict) and read_result.get("kind") == "read_result"


def _status_values(value: Any) -> list[Any]:
    values: list[Any] = []
    if isinstance(value, dict):
        for key, item in value.items():
            lowered = str(key).lower()
            if lowered in {"status", "statut", "etat", "state"} and isinstance(item, str):
                values.append(item)
            values.extend(_status_values(item))
    elif isinstance(value, list):
        for item in value:
            values.extend(_status_values(item))
    return values


def _tenant_values(value: Any) -> list[Any]:
    values: list[Any] = []
    if isinstance(value, dict):
        for key, item in value.items():
            lowered = str(key).lower()
            if lowered in {"tenantid", "tenant_id", "entrepriseid", "entreprise_id", "companyid", "company_id"}:
                values.append(item)
            values.extend(_tenant_values(item))
    elif isinstance(value, list):
        for item in value:
            values.extend(_tenant_values(item))
    return values