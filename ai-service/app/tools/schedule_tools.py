from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition
from app.tools.backend_client import BackendClient
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult, build_read_result


class ScheduleListInput(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=20, ge=1, le=100)


class ScheduleTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="schedule.list",
                description="List RH/admin work schedules from the verified horaires backend.",
                input_model=ScheduleListInput,
                type="read",
                allowed_roles={"RH", "ADMIN"},
                requires_confirmation=False,
                tenant_scoped=True,
            ),
            self.list_schedules,
        )

    async def list_schedules(self, payload: ScheduleListInput, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get(
            "/horaires",
            context=context,
            params={"page": payload.page, "size": payload.size},
        )
        if not result.success:
            return result
        items = _items(result.data)
        count = _count(result.data, items)
        summary = "Horaires recuperes depuis le backend." if count else "Aucun horaire disponible."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="schedule.list",
                    summary=summary,
                    items=items,
                    data=result.data,
                    count=count,
                    empty=count == 0,
                    backend_status=result.status_code,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )


def register_schedule_tools(registry: ToolRegistry, backend_client: BackendClient) -> None:
    ScheduleTools(backend_client).register(registry)


def _items(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("content", "items", "horaires", "data"):
            value = data.get(key)
            if isinstance(value, list):
                return value
        nested = data.get("read_result")
        if isinstance(nested, dict) and isinstance(nested.get("items"), list):
            return nested["items"]
    return []


def _count(data: Any, items: list[Any]) -> int:
    if isinstance(data, dict):
        for key in ("totalElements", "total", "count"):
            value = data.get(key)
            if isinstance(value, int):
                return value
    return len(items)

