from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.tools.result import ToolResult, get_read_result

from . import anomaly_rules as rules
from .insight_models import Insight, InsightReport


class InsightEngine:
    def employee_daily(self, context: CurrentUserContext, tool_results: dict[str, ToolResult], *, period: str = "today") -> InsightReport:
        insights: list[Insight] = []
        warnings = _warnings_from(tool_results)
        _append(insights, rules.missing_checkout(_payload(tool_results.get("get_pointage_status"))))
        _append(insights, rules.late_arrival_pattern(_payload(tool_results.get("get_presence_history"))))
        _append(insights, rules.low_leave_balance(_payload(tool_results.get("leave.get_balance"))))
        return InsightReport(role=_role(context), tenant_id=context.tenant_id, period=period, insights=insights, warnings=warnings)

    def manager_team(self, context: CurrentUserContext, tool_results: dict[str, ToolResult], *, period: str = "today") -> InsightReport:
        insights: list[Insight] = []
        warnings = _warnings_from(tool_results)
        _append(insights, rules.absence_spike(_payload(tool_results.get("get_team_presence"))))
        _append(insights, rules.pending_workload(_payload(tool_results.get("legacy.get_pending_validations")), source_tool="legacy.get_pending_validations"))
        return InsightReport(role=_role(context), tenant_id=context.tenant_id, period=period, insights=insights, warnings=warnings)

    def rh_daily(self, context: CurrentUserContext, tool_results: dict[str, ToolResult], *, period: str = "today") -> InsightReport:
        insights: list[Insight] = []
        warnings = _warnings_from(tool_results)
        _append(insights, rules.pending_workload(_payload(tool_results.get("rh.get_stats")), source_tool="rh.get_stats"))
        _append(insights, rules.pending_workload(_payload(tool_results.get("legacy.get_all_requests")), source_tool="legacy.get_all_requests"))
        _append(insights, rules.document_backlog(_payload(tool_results.get("legacy.get_all_requests")), threshold=8))
        return InsightReport(role=_role(context), tenant_id=context.tenant_id, period=period, insights=insights, warnings=warnings)

    def admin_system(self, context: CurrentUserContext, tool_results: dict[str, ToolResult], *, period: str = "today") -> InsightReport:
        insights: list[Insight] = []
        warnings = _warnings_from(tool_results)
        misconfigured = _payload(tool_results.get("admin.misconfigured_users"))
        count = _read_count(misconfigured)
        if count > 0:
            insights.append(
                Insight(
                    id="admin_misconfigured_users",
                    type="admin_misconfigured_users",
                    severity="warning",
                    title="Utilisateurs mal configures",
                    summary=f"{count} utilisateur(s) necessitent une verification de configuration.",
                    evidence={"misconfiguredCount": count},
                    confidence=0.8,
                    source_tools=["admin.misconfigured_users"],
                    recommended_actions=["Verifier les roles, entreprises et managers assignes."],
                )
            )
        return InsightReport(role=_role(context), tenant_id=context.tenant_id, period=period, insights=insights, warnings=warnings)


def _payload(result: ToolResult | None) -> Any:
    if result is None:
        return None
    read_result = get_read_result(result.data)
    return read_result if read_result else result.data


def _warnings_from(tool_results: dict[str, ToolResult]) -> list[str]:
    warnings: list[str] = []
    for tool_name, result in tool_results.items():
        warnings.extend(result.warnings or [])
        if not result.success:
            warnings.append(result.error_message or f"{tool_name} indisponible")
    return _dedupe(warnings)


def _read_count(value: Any) -> int:
    if isinstance(value, dict):
        count = value.get("count")
        if isinstance(count, int):
            return count
        items = value.get("items")
        if isinstance(items, list):
            return len(items)
    return 0


def _append(items: list[Insight], insight: Insight | None) -> None:
    if insight is not None:
        items.append(insight)


def _role(context: CurrentUserContext) -> str:
    return (context.role or "EMPLOYEE").upper().replace("ROLE_", "")


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.add(text)
            output.append(text)
    return output
