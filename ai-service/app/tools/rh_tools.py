from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result

RH_STATS_ROLES = {"RH", "ADMIN"}


class EmptyRHInput(BaseModel):
    pass


class RHTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="rh.dashboard",
                description="Retourne le tableau de bord RH tenant-scoped depuis le backend.",
                input_model=EmptyRHInput,
                output_model=None,
                type="read",
                allowed_roles=RH_STATS_ROLES,
            ),
            self.get_dashboard,
        )
        registry.register(
            ToolDefinition(
                name="rh.stats",
                description="Retourne les statistiques RH tenant-scoped depuis le backend.",
                input_model=EmptyRHInput,
                output_model=None,
                type="read",
                allowed_roles=RH_STATS_ROLES,
            ),
            self.get_stats_alias,
        )
        registry.register(
            ToolDefinition(
                name="rh.analytics",
                description="Retourne les analytics RH agregees depuis le backend.",
                input_model=EmptyRHInput,
                output_model=None,
                type="read",
                allowed_roles=RH_STATS_ROLES,
            ),
            self.get_analytics,
        )
        registry.register(
            ToolDefinition(
                name="rh.get_stats",
                description="Retourne les statistiques RH tenant-scoped depuis le backend.",
                input_model=EmptyRHInput,
                output_model=None,
                type="read",
                allowed_roles=RH_STATS_ROLES,
            ),
            self.get_stats,
        )

    async def get_dashboard(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/dashboard", context=context)
        if not result.success:
            return _read_failure("rh.dashboard", result)
        data = result.data if isinstance(result.data, dict) else {}
        items = _metric_items(data)
        summary = "Tableau de bord RH disponible depuis le backend."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="rh.dashboard",
                    summary=summary,
                    items=items,
                    count=len(items),
                    data=data,
                    backend_status=result.status_code,
                    empty=not items,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def get_stats(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/stats", context=context)
        if not result.success:
            return _read_failure("rh.get_stats", result)

        data = result.data if isinstance(result.data, dict) else {}
        items = _metric_items(data)
        summary = _stats_summary(data)
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="rh.get_stats",
                    summary=summary,
                    items=items,
                    count=len(items),
                    data=data,
                    backend_status=result.status_code,
                    empty=not items,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def get_stats_alias(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.get_stats(_, context)
        return _rename_read_tool(result, "rh.stats")

    async def get_analytics(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        stats = await self.backend_client.get("/rh/stats", context=context)
        if not stats.success:
            return _read_failure("rh.analytics", stats)
        evolution = await self.backend_client.get("/rh/stats/evolution-mensuelle", context=context)
        by_type = await self.backend_client.get("/rh/stats/demandes-par-type", context=context)
        data = {
            "overview": stats.data if isinstance(stats.data, dict) else {"value": stats.data},
            "monthlyEvolution": evolution.data if evolution.success else None,
            "requestTypeDistribution": by_type.data if by_type.success else None,
        }
        items = _metric_items(data["overview"] if isinstance(data["overview"], dict) else {})
        summary = "Analytics RH disponibles depuis le backend."
        warnings = list(stats.warnings)
        if not evolution.success:
            warnings.append(evolution.error_message or "evolution mensuelle indisponible")
        if not by_type.success:
            warnings.append(by_type.error_message or "distribution par type indisponible")
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="rh.analytics",
                    summary=summary,
                    items=items,
                    count=len(items),
                    data=data,
                    backend_status=stats.status_code,
                    empty=not items,
                )
            },
            warnings=warnings,
            status_code=stats.status_code,
        )


def register_rh_tools(registry: ToolRegistry, backend_client: BackendClient) -> RHTools:
    tools = RHTools(backend_client)
    tools.register(registry)
    return tools


def _metric_items(data: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for key, value in data.items():
        if isinstance(value, (int, float, str, bool)) or value is None:
            items.append({"metric": key, "value": value})
    return items


def _stats_summary(data: dict[str, Any]) -> str:
    if not data:
        return "Aucune statistique RH disponible depuis le backend."

    parts: list[str] = []
    if isinstance(data.get("totalEmployees"), (int, float)):
        parts.append(f"{int(data['totalEmployees'])} employe(s)")
    if isinstance(data.get("pendingRequests"), (int, float)):
        parts.append(f"{int(data['pendingRequests'])} demande(s) en attente")
    if isinstance(data.get("presentToday"), (int, float)) and isinstance(data.get("absentToday"), (int, float)):
        parts.append(f"{int(data['presentToday'])} present(s), {int(data['absentToday'])} absent(s)")
    if isinstance(data.get("attendanceRate"), (int, float)):
        parts.append(f"taux de presence {float(data['attendanceRate']):.1f}%")

    if parts:
        return "Statistiques RH: " + ", ".join(parts) + "."
    return "Statistiques RH disponibles depuis le backend."


def _read_failure(tool_name: str, result: ToolResult) -> ToolResult:
    message = _clean_error(result)
    code = "capability_unavailable" if result.status_code == 404 else (result.error_code or "backend_error")
    return ToolResult.fail(
        code,
        message,
        status_code=result.status_code,
        data={
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=message,
                items=[],
                count=0,
                data=result.data if isinstance(result.data, dict) else {},
                error={"code": code, "message": message},
                backend_status=result.status_code,
                empty=True,
            )
        },
        warnings=result.warnings,
    )


def _clean_error(result: ToolResult) -> str:
    if result.status_code in (401, 403):
        return "Votre role ne permet pas de consulter les statistiques RH."
    if result.status_code == 404:
        return "Les statistiques RH ne sont pas encore disponibles dans le backend."
    if result.status_code is None or result.status_code >= 500:
        return "Le service statistiques RH est momentanement indisponible. Reessayez dans quelques instants."
    return result.error_message or "Impossible de recuperer les statistiques RH."


def _rename_read_tool(result: ToolResult, tool_name: str) -> ToolResult:
    if not isinstance(result.data, dict):
        return result
    read_result = result.data.get("read_result")
    if not isinstance(read_result, dict):
        return result
    cloned = dict(read_result)
    cloned["toolName"] = tool_name
    return ToolResult(
        success=result.success,
        data={"read_result": cloned},
        warnings=result.warnings,
        error_code=result.error_code,
        error_message=result.error_message,
        status_code=result.status_code,
    )
