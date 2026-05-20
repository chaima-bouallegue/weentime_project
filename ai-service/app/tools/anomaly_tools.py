"""Attendance anomaly tools -- bridge between ai-service agents and ml-service.

Three tools are exposed:

* ``rh.anomaly_dashboard`` - company-wide today snapshot for the RH copilot
* ``manager.anomaly_dashboard`` - manager-scoped today snapshot (currently same payload as RH)
* ``rh.anomaly_employee`` - per-employee risk timeline

Multilingual intent triggers (FR/EN/Tunisian/Arabic) are declared in
``routing_priority.py`` and the agents' ``detect_intent``; this module only
owns the registry definitions and the ml-service calls.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition
from app.tools.ml_service_client import MLServiceClient
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult, build_read_result


class AnomalyDashboardInput(BaseModel):
    """No payload -- the dashboard call is purely contextual."""


class AnomalyEmployeeInput(BaseModel):
    employee_id: int = Field(gt=0)


def _format_anomaly_line(anomaly: dict[str, Any]) -> str:
    name = anomaly.get("employee_name") or f"#{anomaly.get('employee_id')}"
    risk = anomaly.get("risk") or "LOW"
    reasons = anomaly.get("reasons") or []
    first_reason = reasons[0] if reasons else "comportement atypique"
    return f"• {name}: {first_reason} — Risque {risk}"


def _summarize_dashboard(data: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    anomalies = data.get("anomalies") or []
    total = data.get("total_anomalies", len(anomalies))
    if total == 0:
        return "Aucune anomalie détectée aujourd'hui.", []
    critical = data.get("critical", 0)
    high = data.get("high", 0)
    lines = [f"{total} anomalie(s) détectée(s) aujourd'hui ({critical} critique(s), {high} élevée(s))."]
    for item in anomalies[:5]:
        lines.append(_format_anomaly_line(item))
    items = [
        {
            "title": item.get("employee_name") or f"#{item.get('employee_id')}",
            "subtitle": item.get("explanation"),
            "risk": item.get("risk"),
            "score": item.get("score"),
            "date": item.get("date"),
            "reasons": item.get("reasons") or [],
        }
        for item in anomalies
    ]
    return "\n".join(lines), items


class AnomalyTools:
    def __init__(self, ml_client: MLServiceClient) -> None:
        self.ml_client = ml_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="rh.anomaly_dashboard",
                description="Affiche le tableau de bord des anomalies de présence du jour (RH).",
                input_model=AnomalyDashboardInput,
                type="read",
                allowed_roles={"RH", "ADMIN"},
                requires_confirmation=False,
                tenant_scoped=True,
            ),
            self.rh_dashboard,
        )

        registry.register(
            ToolDefinition(
                name="manager.anomaly_dashboard",
                description="Affiche les anomalies de présence du jour pour l'équipe du manager.",
                input_model=AnomalyDashboardInput,
                type="read",
                allowed_roles={"MANAGER"},
                requires_confirmation=False,
                tenant_scoped=True,
            ),
            self.manager_dashboard,
        )

        registry.register(
            ToolDefinition(
                name="rh.anomaly_employee",
                description="Retourne le score de risque récent d'un employé.",
                input_model=AnomalyEmployeeInput,
                type="read",
                allowed_roles={"RH", "ADMIN", "MANAGER"},
                requires_confirmation=False,
                tenant_scoped=True,
            ),
            self.employee_risk,
        )

    async def rh_dashboard(
        self,
        payload: AnomalyDashboardInput,
        context: CurrentUserContext,
    ) -> ToolResult:
        _ = payload
        return await self._call_dashboard(context, tool_name="rh.anomaly_dashboard")

    async def manager_dashboard(
        self,
        payload: AnomalyDashboardInput,
        context: CurrentUserContext,
    ) -> ToolResult:
        _ = payload
        return await self._call_dashboard(context, tool_name="manager.anomaly_dashboard")

    async def employee_risk(
        self,
        payload: AnomalyEmployeeInput,
        context: CurrentUserContext,
    ) -> ToolResult:
        result = await self.ml_client.get(
            f"/api/ml/anomalies/employee/{payload.employee_id}",
            context=context,
            tool_name="rh.anomaly_employee",
        )
        if not result.success:
            return ToolResult.fail(
                result.error_code or "anomaly_unavailable",
                result.error_message or "Service ML temporairement indisponible.",
                status_code=result.status_code,
                data={
                    "read_result": build_read_result(
                        tool_name="rh.anomaly_employee",
                        summary="Anomalies indisponibles.",
                        items=[],
                        empty=True,
                        backend_status=result.status_code,
                    )
                },
            )

        data = result.data or {}
        risk = data.get("current_risk") or "LOW"
        score = data.get("score", 0)
        name = data.get("employee_name") or f"#{payload.employee_id}"
        summary = (
            f"{name}: risque actuel {risk} (score {float(score):.2f}). "
            f"Tendance: {data.get('trend', 'STABLE')}, "
            f"{data.get('anomalies_last_30_days', 0)} anomalie(s) sur 30j."
        )
        items: list[dict[str, Any]] = []
        latest = data.get("latest_anomaly")
        if isinstance(latest, dict):
            items.append(
                {
                    "title": latest.get("date") or "",
                    "subtitle": latest.get("explanation"),
                    "risk": latest.get("risk"),
                    "score": latest.get("score"),
                    "reasons": latest.get("reasons") or [],
                }
            )
        return ToolResult.ok(
            data={
                "read_result": build_read_result(
                    tool_name="rh.anomaly_employee",
                    summary=summary,
                    items=items,
                    data=data,
                    count=data.get("anomalies_last_30_days", 0),
                    empty=not items,
                )
            }
        )

    async def _call_dashboard(self, context: CurrentUserContext, *, tool_name: str) -> ToolResult:
        result = await self.ml_client.get(
            "/api/ml/anomalies/dashboard",
            context=context,
            tool_name=tool_name,
        )
        if not result.success:
            return ToolResult.fail(
                result.error_code or "anomaly_unavailable",
                result.error_message or "Service ML temporairement indisponible.",
                status_code=result.status_code,
                data={
                    "read_result": build_read_result(
                        tool_name=tool_name,
                        summary="Service ML temporairement indisponible.",
                        items=[],
                        empty=True,
                        backend_status=result.status_code,
                    )
                },
            )
        data = result.data or {}
        summary, items = _summarize_dashboard(data)
        return ToolResult.ok(
            data={
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=summary,
                    items=items,
                    data=data,
                    count=data.get("total_anomalies", len(items)),
                    empty=not items,
                )
            }
        )


def register_anomaly_tools(registry: ToolRegistry, ml_client: MLServiceClient | None = None) -> AnomalyTools:
    tools = AnomalyTools(ml_client or MLServiceClient())
    tools.register(registry)
    return tools
