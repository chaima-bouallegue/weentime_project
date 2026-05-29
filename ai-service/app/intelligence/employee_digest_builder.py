from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import ToolCallRecord
from app.tools.result import ToolResult

from .digest_builder import (
    RoleDigest,
    RoleDigestBuilder,
    RoleDigestSection,
    ToolReadPlan,
    _dedupe,
    _dedupe_citations,
)
from .priority_engine import PriorityEngine, PriorityItem
from .reminder_engine import ReminderEngine
from .role_context import RoleIntelligenceContext


class EmployeeDigestBuilder(RoleDigestBuilder):
    """Contextual employee digest composed from read-only modern tools."""

    def __init__(
        self,
        executor: Any,
        priority_engine: PriorityEngine | None = None,
        reminder_engine: ReminderEngine | None = None,
    ) -> None:
        super().__init__(executor, priority_engine=priority_engine)
        self.reminder_engine = reminder_engine or ReminderEngine()

    async def build_digest(
        self,
        context: CurrentUserContext,
        *,
        period: str = "today",
        policy_query: str | None = None,
    ) -> RoleDigest:
        role_context = RoleIntelligenceContext.from_current_user(context)
        plans = list(_employee_plans())
        if policy_query:
            plans.append(
                ToolReadPlan(
                    title="Guide politique RH",
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
            preflight = context.metadata.get("_backend_gateway_preflight")
            if isinstance(preflight, ToolResult) and not preflight.success:
                break

        section_dicts = [section.to_dict() for section in sections]
        reminders = self.reminder_engine.build_employee_reminders(section_dicts)
        reminder_priorities = self.reminder_engine.reminders_to_priorities(reminders)
        base_priorities = self.priority_engine.prioritize(role=role_context.role, sections=section_dicts)
        priorities = _dedupe_priorities([*reminder_priorities, *base_priorities])

        return RoleDigest(
            role=role_context.role,
            tenant_id=role_context.tenant_id,
            period=period,
            sections=sections,
            priorities=priorities,
            reminders=[item.to_dict() for item in reminders],
            warnings=_dedupe(warnings),
            tool_calls=calls,
            citations=_dedupe_citations(citations),
        )


def _employee_plans() -> tuple[ToolReadPlan, ...]:
    return (
        ToolReadPlan("Pointage", "get_pointage_status"),
        ToolReadPlan("Heures semaine", "get_week_hours"),
        ToolReadPlan("Solde conges", "leave.get_balance"),
        ToolReadPlan("Demandes conges", "leave.list_my_requests"),
        ToolReadPlan("Teletravail", "telework.list_my_requests"),
        ToolReadPlan("Autorisations", "authorization.list_my_requests"),
        ToolReadPlan("Documents", "document.list_my_requests"),
        ToolReadPlan("Communication", "communication.list_channels", {"limit": 10}),
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
