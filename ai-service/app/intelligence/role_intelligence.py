from __future__ import annotations

from time import perf_counter
from typing import Any

from app.agents.base_domain_agent import DomainAgent
from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.observability.metrics import record_role_intelligence_event
from app.observability.tracing import log_event, start_span
from app.tools.executor import ToolExecutor

from .admin_digest_builder import AdminDigestBuilder
from .digest_builder import RoleDigestBuilder
from .employee_digest_builder import EmployeeDigestBuilder
from .manager_digest_builder import ManagerDigestBuilder
from .role_context import RoleIntelligenceContext

_INTELLIGENCE_MARKERS = (
    "digest",
    "priorite",
    "priorites",
    "priorité",
    "priorités",
    "que dois-je traiter",
    "quoi prioriser",
    "what should i focus",
    "what should i prioritize",
    "role intelligence",
    "alertes role",
    "operational digest",
    "management digest",
    "hr digest",
    "admin digest",
)
_POLICY_MARKERS = ("politique", "policy", "regle", "règle", "source rh", "faq")


class RoleIntelligenceService:
    def __init__(
        self,
        executor: ToolExecutor | Any,
        digest_builder: RoleDigestBuilder | None = None,
        employee_digest_builder: EmployeeDigestBuilder | None = None,
        manager_digest_builder: ManagerDigestBuilder | None = None,
        admin_digest_builder: AdminDigestBuilder | None = None,
    ) -> None:
        self.executor = executor
        self.digest_builder = digest_builder or RoleDigestBuilder(executor)
        self.employee_digest_builder = employee_digest_builder or EmployeeDigestBuilder(executor)
        self.manager_digest_builder = manager_digest_builder or ManagerDigestBuilder(executor)
        self.admin_digest_builder = admin_digest_builder or AdminDigestBuilder(executor)

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        role_context = RoleIntelligenceContext.from_current_user(context)
        if role_context.role not in {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}:
            return 0.0
        text = (message or "").lower()
        if any(marker in text for marker in _INTELLIGENCE_MARKERS):
            return 0.9
        return 0.0

    async def build_response(self, message: str, context: CurrentUserContext) -> AgentResponse:
        started = perf_counter()
        role_context = RoleIntelligenceContext.from_current_user(context)
        digest_type = f"{role_context.role.lower()}_digest"
        with start_span("role_intelligence.digest", {"role": role_context.role, "digest_type": digest_type}):
            if not role_context.verified:
                duration_ms = round((perf_counter() - started) * 1000, 2)
                record_role_intelligence_event(role=role_context.role, digest_type="unverified", duration_ms=duration_ms, success=False)
                return AgentResponse(
                    type="error",
                    text="Contexte utilisateur non verifie. Reconnectez-vous avant de demander un digest role.",
                    intent="role_intelligence.unverified_context",
                    confidence=0.95,
                    actionResult={
                        "kind": "role_intelligence_digest",
                        "role": role_context.role,
                        "tenantId": role_context.tenant_id,
                        "sections": [],
                        "priorities": [],
                        "warnings": ["unverified_context"],
                        "requiresConfirmation": False,
                    },
                )
            policy_query = _policy_query(message) if _has_policy_focus(message) else None
            if role_context.role == "EMPLOYEE":
                builder = self.employee_digest_builder
            elif role_context.role == "MANAGER":
                builder = self.manager_digest_builder
            elif role_context.role == "ADMIN":
                builder = self.admin_digest_builder
            else:
                builder = self.digest_builder
            digest = await builder.build_digest(context, policy_query=policy_query)
            duration_ms = round((perf_counter() - started) * 1000, 2)
            record_role_intelligence_event(role=role_context.role, digest_type=digest_type, duration_ms=duration_ms, success=True)
            log_event("role_intelligence.digest", metadata={"role": role_context.role, "digest_type": digest_type, "duration_ms": duration_ms})
            text = _digest_text(digest.to_dict(), language=role_context.language)
            return AgentResponse(
                type="answer",
                text=text,
                intent=f"role_intelligence.{role_context.role.lower()}_digest",
                confidence=0.9,
                requiresConfirmation=False,
                toolCalls=digest.tool_calls,
                actionResult=digest.to_dict(),
            )


class RoleIntelligenceAgent(DomainAgent):
    name = "role_intelligence"

    def __init__(self, executor: ToolExecutor | Any, service: RoleIntelligenceService | None = None) -> None:
        self.service = service or RoleIntelligenceService(executor)

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        return self.service.can_handle(message, context)

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        return await self.service.build_response(message, context)


def _has_policy_focus(message: str) -> bool:
    text = (message or "").lower()
    return any(marker in text for marker in _POLICY_MARKERS)


def _policy_query(message: str) -> str:
    text = " ".join((message or "").split())
    return text[:240] or "politique RH"


def _digest_text(action: dict[str, Any], *, language: str) -> str:
    summary = str(action.get("summary") or "Digest role.")
    priorities = action.get("priorities") if isinstance(action.get("priorities"), list) else []
    sections = action.get("sections") if isinstance(action.get("sections"), list) else []
    warnings = action.get("warnings") if isinstance(action.get("warnings"), list) else []
    if language == "en":
        lines = [summary]
        if priorities:
            lines.append("Priorities:")
            lines.extend(f"- {item.get('title')}: {item.get('summary')}" for item in priorities[:5] if isinstance(item, dict))
        else:
            lines.append("No urgent priority detected with available data.")
        if warnings:
            lines.append("Some data is unavailable, so this digest is partial.")
        return "\n".join(lines)
    if language == "ar":
        lines = [summary]
        if priorities:
            lines.append("الأولويات:")
            lines.extend(f"- {item.get('title')}: {item.get('summary')}" for item in priorities[:5] if isinstance(item, dict))
        else:
            lines.append("لا توجد أولوية عاجلة حسب المعطيات المتاحة.")
        if warnings:
            lines.append("بعض المعطيات غير متوفرة، لذلك الملخص جزئي.")
        return "\n".join(lines)
    lines = [summary]
    if priorities:
        lines.append("Priorites:")
        lines.extend(f"- {item.get('title')}: {item.get('summary')}" for item in priorities[:5] if isinstance(item, dict))
    else:
        lines.append("Aucune priorite urgente detectee avec les donnees disponibles.")
    if sections:
        lines.append("Sections consultees: " + ", ".join(str(item.get("title")) for item in sections[:6] if isinstance(item, dict)) + ".")
    if warnings:
        lines.append("Certaines donnees sont indisponibles; le digest reste partiel.")
    return "\n".join(lines)
