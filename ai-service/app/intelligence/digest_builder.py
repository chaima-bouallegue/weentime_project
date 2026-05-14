from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import ToolCallRecord
from app.tools.result import ToolResult, get_read_result

from .priority_engine import PriorityEngine, PriorityItem
from .role_context import RoleIntelligenceContext


@dataclass(frozen=True, slots=True)
class ToolReadPlan:
    title: str
    tool_name: str
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class RoleDigestSection:
    title: str
    summary: str
    status: str
    tool_name: str
    count: int = 0
    items: list[Any] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "summary": self.summary,
            "status": self.status,
            "toolName": self.tool_name,
            "count": self.count,
            "items": self.items,
            "citations": self.citations,
        }


@dataclass(frozen=True, slots=True)
class RoleDigest:
    role: str
    tenant_id: int | None
    period: str
    sections: list[RoleDigestSection]
    priorities: list[PriorityItem]
    warnings: list[str]
    tool_calls: list[ToolCallRecord]
    citations: list[dict[str, Any]] = field(default_factory=list)
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def summary(self) -> str:
        available = sum(1 for section in self.sections if section.status == "ok")
        if self.priorities:
            return f"Digest {self.role}: {len(self.priorities)} priorite(s), {available} section(s) disponible(s)."
        if self.warnings:
            return f"Digest {self.role}: aucune priorite fiable; donnees partielles."
        return f"Digest {self.role}: aucune priorite urgente detectee avec les donnees disponibles."

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "role_intelligence_digest",
            "role": self.role,
            "tenantId": self.tenant_id,
            "period": self.period,
            "generatedAt": self.generated_at.isoformat(),
            "summary": self.summary,
            "sections": [section.to_dict() for section in self.sections],
            "priorities": [priority.to_dict() for priority in self.priorities],
            "warnings": self.warnings,
            "citations": self.citations,
            "requiresConfirmation": False,
        }


class RoleDigestBuilder:
    def __init__(self, executor: Any, priority_engine: PriorityEngine | None = None) -> None:
        self.executor = executor
        self.priority_engine = priority_engine or PriorityEngine()

    async def build_digest(
        self,
        context: CurrentUserContext,
        *,
        period: str = "today",
        policy_query: str | None = None,
    ) -> RoleDigest:
        role_context = RoleIntelligenceContext.from_current_user(context)
        plans = list(_plans_for_role(role_context.role))
        if policy_query:
            plans.append(
                ToolReadPlan(
                    title="Politique RH",
                    tool_name="policy.search",
                    payload={"query": policy_query, "language": role_context.language if role_context.language in {"fr", "en", "ar"} else "fr", "limit": 3},
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

        priorities = self.priority_engine.prioritize(role=role_context.role, sections=[section.to_dict() for section in sections])
        return RoleDigest(
            role=role_context.role,
            tenant_id=role_context.tenant_id,
            period=period,
            sections=sections,
            priorities=priorities,
            warnings=_dedupe(warnings),
            tool_calls=calls,
            citations=_dedupe_citations(citations),
        )

    async def _read_section(self, plan: ToolReadPlan, context: CurrentUserContext) -> tuple[RoleDigestSection, ToolCallRecord, list[str]]:
        if not self._tool_is_safe_read(plan.tool_name):
            section = RoleDigestSection(
                title=plan.title,
                summary="Cette capacite n'est pas disponible en lecture securisee.",
                status="unavailable",
                tool_name=plan.tool_name,
            )
            return section, ToolCallRecord(name=plan.tool_name, arguments=plan.payload, status="denied"), [section.summary]

        result = await self.executor.execute(plan.tool_name, plan.payload, context)
        section = _section_from_tool_result(plan, result)
        call = ToolCallRecord(name=plan.tool_name, arguments=plan.payload, status="success" if result.success else "failed")
        warnings = list(result.warnings or [])
        if not result.success:
            warnings.append(section.summary)
        return section, call, warnings

    def _tool_is_safe_read(self, tool_name: str) -> bool:
        registry = getattr(self.executor, "registry", None)
        if registry is None:
            return True
        try:
            registered = registry.get(tool_name)
        except Exception:
            return True
        definition = getattr(registered, "definition", None)
        return getattr(definition, "type", "read") == "read"


def _plans_for_role(role: str) -> tuple[ToolReadPlan, ...]:
    if role == "MANAGER":
        return (
            ToolReadPlan("Presence equipe", "get_team_presence"),
            ToolReadPlan("Conges equipe", "leave.list_manager_requests"),
            ToolReadPlan("Teletravail equipe", "telework.list_manager_requests"),
            ToolReadPlan("Autorisations equipe", "authorization.list_manager_requests"),
            ToolReadPlan("Communication", "communication.list_channels", {"limit": 10}),
        )
    if role == "RH":
        return (
            # No modern RH stats endpoint is registered yet; keep this legacy read fallback only.
            ToolReadPlan("Statistiques RH", "legacy.get_rh_stats"),
            ToolReadPlan("Conges RH", "leave.list_rh_pending"),
            ToolReadPlan("Teletravail RH", "telework.list_rh_pending"),
            ToolReadPlan("Autorisations RH", "authorization.list_rh_requests"),
            ToolReadPlan("Documents RH", "document.list_my_requests"),
            ToolReadPlan("Communication", "communication.list_channels", {"limit": 10}),
        )
    if role == "ADMIN":
        return (
            ToolReadPlan("Sante systeme", "admin.system_health"),
            ToolReadPlan("Utilisateurs mal configures", "admin.misconfigured_users"),
            ToolReadPlan("Utilisateurs", "admin.list_users"),
            ToolReadPlan("Entreprises", "admin.list_enterprises"),
        )
    return (
        ToolReadPlan("Pointage", "get_pointage_status"),
        ToolReadPlan("Heures semaine", "get_week_hours"),
        ToolReadPlan("Solde conges", "leave.get_balance"),
        ToolReadPlan("Demandes conges", "leave.list_my_requests"),
        ToolReadPlan("Documents", "document.list_my_requests"),
        ToolReadPlan("Communication", "communication.list_channels", {"limit": 10}),
    )


def _section_from_tool_result(plan: ToolReadPlan, result: ToolResult) -> RoleDigestSection:
    read_result = get_read_result(result.data)
    if read_result:
        items = read_result.get("items") if isinstance(read_result.get("items"), list) else []
        data = read_result.get("data") if isinstance(read_result.get("data"), dict) else {}
        citations = data.get("citations") if isinstance(data.get("citations"), list) else []
        return RoleDigestSection(
            title=plan.title,
            summary=str(read_result.get("summary") or _default_summary(result)),
            status="ok" if result.success else _failure_status(result),
            tool_name=str(read_result.get("toolName") or plan.tool_name),
            count=int(read_result.get("count") or len(items)),
            items=items,
            citations=[item for item in citations if isinstance(item, dict)],
        )
    if result.success:
        return RoleDigestSection(
            title=plan.title,
            summary=_summarize_payload(result.data),
            status="ok",
            tool_name=plan.tool_name,
        )
    return RoleDigestSection(
        title=plan.title,
        summary=_default_summary(result),
        status=_failure_status(result),
        tool_name=plan.tool_name,
    )


def _failure_status(result: ToolResult) -> str:
    if result.error_code in {"tool_not_found", "capability_unavailable", "backend_unavailable", "policy_unavailable"} or result.status_code in {404, 503}:
        return "unavailable"
    return "warning"


def _default_summary(result: ToolResult) -> str:
    if result.error_code == "role_not_allowed" or result.status_code == 403:
        return "Vous n'avez pas les droits necessaires pour cette section."
    if result.error_code == "tool_not_found":
        return "Cette capacite n'est pas encore disponible."
    return result.error_message or "Cette section est momentanement indisponible."


def _summarize_payload(data: Any) -> str:
    if isinstance(data, dict):
        for key in ("summary", "text", "message"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return "Donnees disponibles depuis le backend."
    if isinstance(data, list):
        return "Aucun element trouve." if not data else f"{len(data)} element(s) retrouve(s)."
    return "Donnees disponibles." if data not in (None, "", [], {}) else "Aucune donnee disponible."


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.add(text)
            output.append(text)
    return output


def _dedupe_citations(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for item in values:
        key = str(item.get("sourceId") or item.get("source_id") or "") + ":" + str(item.get("chunkId") or item.get("chunk_id") or item.get("location") or "")
        if key and key not in seen:
            seen.add(key)
            output.append(item)
    return output
