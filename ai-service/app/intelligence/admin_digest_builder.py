from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import ToolCallRecord

from .admin_diagnostics import AdminDiagnostics, collect_admin_runtime_status
from .digest_builder import (
    RoleDigest,
    RoleDigestBuilder,
    RoleDigestSection,
    ToolReadPlan,
    _dedupe,
    _dedupe_citations,
)
from .priority_engine import PriorityEngine, PriorityItem
from .role_context import RoleIntelligenceContext


class AdminDigestBuilder(RoleDigestBuilder):
    """Read-only operational diagnostics digest for verified admins."""

    def __init__(
        self,
        executor: Any,
        priority_engine: PriorityEngine | None = None,
        admin_diagnostics: AdminDiagnostics | None = None,
        runtime_status: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(executor, priority_engine=priority_engine)
        self.admin_diagnostics = admin_diagnostics or AdminDiagnostics()
        self.runtime_status = runtime_status

    async def build_digest(
        self,
        context: CurrentUserContext,
        *,
        period: str = "today",
        policy_query: str | None = None,
    ) -> RoleDigest:
        role_context = RoleIntelligenceContext.from_current_user(context)
        if role_context.role != "ADMIN" or not role_context.verified:
            return RoleDigest(
                role=role_context.role,
                tenant_id=role_context.tenant_id,
                period=period,
                sections=[],
                priorities=[],
                reminders=[],
                warnings=["admin_intelligence_requires_verified_admin"],
                tool_calls=[],
                citations=[],
            )

        plans = list(_admin_plans())
        if policy_query:
            plans.append(
                ToolReadPlan(
                    title="Guide politique admin",
                    tool_name="policy.search",
                    payload={
                        "query": policy_query,
                        "language": role_context.language if role_context.language in {"fr", "en", "ar"} else "fr",
                        "limit": 3,
                    },
                )
            )

        sections: list[RoleDigestSection] = []
        calls: list[ToolCallRecord] = []
        warnings: list[str] = []
        citations: list[dict[str, Any]] = []
        for plan in plans:
            section, call, section_warnings = await self._read_section(plan, context)
            sections.append(section)
            calls.append(call)
            warnings.extend(section_warnings)
            citations.extend(section.citations)

        section_dicts = [section.to_dict() for section in sections]
        runtime_status = self.runtime_status or collect_admin_runtime_status()
        diagnostics = self.admin_diagnostics.build_admin_diagnostics(section_dicts, runtime_status=runtime_status)
        diagnostic_priorities = self.admin_diagnostics.diagnostics_to_priorities(diagnostics)
        base_priorities = self.priority_engine.prioritize(role=role_context.role, sections=section_dicts)
        priorities = _dedupe_priorities([*diagnostic_priorities, *base_priorities])

        return RoleDigest(
            role=role_context.role,
            tenant_id=role_context.tenant_id,
            period=period,
            sections=sections,
            priorities=priorities,
            reminders=[item.to_dict() for item in diagnostics],
            warnings=_dedupe(warnings),
            tool_calls=calls,
            citations=_dedupe_citations(citations),
        )


def _admin_plans() -> tuple[ToolReadPlan, ...]:
    return (
        ToolReadPlan("Sante systeme", "admin.system_health"),
        ToolReadPlan("Utilisateurs mal configures", "admin.misconfigured_users"),
        ToolReadPlan("Utilisateurs", "admin.list_users"),
        ToolReadPlan("Entreprises", "admin.list_enterprises"),
    )


def _dedupe_priorities(values: list[PriorityItem]) -> list[PriorityItem]:
    seen: set[str] = set()
    output: list[PriorityItem] = []
    for item in values:
        if item.id in seen:
            continue
        seen.add(item.id)
        output.append(item)
    return output
