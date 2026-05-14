from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.context.current_user import CurrentUserContext
from app.insights import InsightEngine, InsightReport
from app.insights.summary_builder import build_report_text
from app.models.tool_models import ToolDefinition
from app.observability.tracing import log_event, start_span

from .executor import ToolExecutor
from .registry import ToolRegistry
from .result import ToolResult, build_read_result

ALL_ROLES = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}


class InsightInput(BaseModel):
    period: str = "today"


class InsightTools:
    def __init__(self, executor: ToolExecutor, engine: InsightEngine | None = None) -> None:
        self.executor = executor
        self.engine = engine or InsightEngine()

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="insights.employee_daily",
                description="Produit un rapport intelligent personnel read-only.",
                input_model=InsightInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_ROLES,
            ),
            self.employee_daily,
        )
        registry.register(
            ToolDefinition(
                name="insights.manager_team",
                description="Produit un rapport intelligent read-only pour l'equipe manager.",
                input_model=InsightInput,
                output_model=None,
                type="read",
                allowed_roles={"MANAGER"},
            ),
            self.manager_team,
        )
        registry.register(
            ToolDefinition(
                name="insights.rh_daily",
                description="Produit un rapport intelligent read-only RH.",
                input_model=InsightInput,
                output_model=None,
                type="read",
                allowed_roles={"RH"},
            ),
            self.rh_daily,
        )
        registry.register(
            ToolDefinition(
                name="insights.admin_system",
                description="Produit un rapport intelligent read-only admin/systeme.",
                input_model=InsightInput,
                output_model=None,
                type="read",
                allowed_roles={"ADMIN"},
            ),
            self.admin_system,
        )

    async def employee_daily(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        period = str(getattr(payload, "period", "today") or "today")
        results = await self._collect(
            context,
            (
                ("get_pointage_status", {}),
                ("get_week_hours", {}),
                ("get_presence_history", {"size": 30}),
                ("leave.get_balance", {}),
                ("leave.list_my_requests", {}),
            ),
        )
        report = self.engine.employee_daily(context, results, period=period)
        return self._report_result("insights.employee_daily", report)

    async def manager_team(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        period = str(getattr(payload, "period", "today") or "today")
        results = await self._collect(
            context,
            (
                ("legacy.get_pending_validations", {}),
                ("legacy.get_team_requests", {}),
                ("get_team_presence", {}),
            ),
        )
        report = self.engine.manager_team(context, results, period=period)
        return self._report_result("insights.manager_team", report)

    async def rh_daily(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        period = str(getattr(payload, "period", "today") or "today")
        results = await self._collect(context, (("rh.get_stats", {}), ("legacy.get_all_requests", {})))
        report = self.engine.rh_daily(context, results, period=period)
        return self._report_result("insights.rh_daily", report)

    async def admin_system(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        period = str(getattr(payload, "period", "today") or "today")
        results = await self._collect(
            context,
            (("admin.system_health", {}), ("admin.misconfigured_users", {}), ("admin.list_users", {}), ("admin.list_enterprises", {})),
        )
        if not any(result.success for result in results.values()):
            message = "Les outils admin necessaires au rapport intelligent sont indisponibles."
            return ToolResult.fail(
                "capability_unavailable",
                message,
                status_code=503,
                data={
                    "read_result": build_read_result(
                        tool_name="insights.admin_system",
                        summary=message,
                        items=[],
                        count=0,
                        data={"kind": "insight_report", "insights": [], "warnings": [message]},
                        error={"code": "capability_unavailable", "message": message},
                        backend_status=503,
                        empty=True,
                    )
                },
            )
        report = self.engine.admin_system(context, results, period=period)
        return self._report_result("insights.admin_system", report)

    async def _collect(self, context: CurrentUserContext, tool_plan: tuple[tuple[str, dict[str, Any]], ...]) -> dict[str, ToolResult]:
        results: dict[str, ToolResult] = {}
        with start_span("insights.tool_collect", {"role": context.role, "tenant_id": context.tenant_id, "tool_count": len(tool_plan)}):
            for tool_name, payload in tool_plan:
                result = await self.executor.execute(tool_name, payload, context)
                results[tool_name] = result
        return results

    def _report_result(self, tool_name: str, report: InsightReport) -> ToolResult:
        data = report.to_dict()
        text = build_report_text(report)
        log_event(
            "insights.report",
            output={"insight_count": len(report.insights), "warning_count": len(report.warnings)},
            metadata={"role": report.role, "tenant_id": report.tenant_id, "period": report.period},
        )
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=text,
                    items=data["insights"],
                    count=len(data["insights"]),
                    data=data,
                    empty=not data["insights"],
                )
            },
            warnings=report.warnings,
            status_code=200,
        )


def register_insight_tools(registry: ToolRegistry, executor: ToolExecutor, engine: InsightEngine | None = None) -> InsightTools:
    tools = InsightTools(executor, engine)
    tools.register(registry)
    return tools
