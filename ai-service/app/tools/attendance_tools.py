from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult

ALL_BUSINESS_ROLES = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}


class EmptyToolInput(BaseModel):
    pass


class HistoryInput(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=30, ge=1, le=100)


class TeamPresenceInput(BaseModel):
    team_id: int | None = None


class AttendanceTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="get_pointage_status",
                description="Retourne le pointage du jour de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:read:self"},
            ),
            self.get_pointage_status,
        )
        registry.register(
            ToolDefinition(
                name="check_in",
                description="Pointe l'entree de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="write",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:write:self"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.check_in,
        )
        registry.register(
            ToolDefinition(
                name="check_out",
                description="Pointe la sortie de l'utilisateur authentifie.",
                input_model=EmptyToolInput,
                output_model=None,
                type="write",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:write:self"},
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.check_out,
        )
        registry.register(
            ToolDefinition(
                name="get_presence_history",
                description="Retourne l'historique personnel de presence.",
                input_model=HistoryInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:read:self"},
            ),
            self.get_presence_history,
        )
        registry.register(
            ToolDefinition(
                name="get_week_hours",
                description="Retourne les statistiques personnelles de presence.",
                input_model=EmptyToolInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
                required_permissions={"attendance:read:self"},
            ),
            self.get_week_hours,
        )
        registry.register(
            ToolDefinition(
                name="get_team_presence",
                description="Retourne la presence equipe quand l'API backend l'autorise.",
                input_model=TeamPresenceInput,
                output_model=None,
                type="read",
                allowed_roles={"MANAGER", "RH", "ADMIN"},
                required_permissions={"attendance:read:team"},
            ),
            self.get_team_presence,
        )

    async def get_pointage_status(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.backend_client.get("/presence/me/today", context=context)

    async def check_in(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.backend_client.post("/presence/me/check-in", context=context, json={})

    async def check_out(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.backend_client.post("/presence/me/check-out", context=context, json={})

    async def get_presence_history(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        data = payload.model_dump()
        return await self.backend_client.get("/presence/me/history", context=context, params=data)

    async def get_week_hours(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.backend_client.get("/presence/me/stats", context=context)

    async def get_team_presence(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        params: dict[str, Any] = {}
        team_id = getattr(payload, "team_id", None)
        if team_id is not None:
            params["teamId"] = team_id
        return await self.backend_client.get("/presence/team/today", context=context, params=params or None)


def register_attendance_tools(registry: ToolRegistry, backend_client: BackendClient) -> AttendanceTools:
    tools = AttendanceTools(backend_client)
    tools.register(registry)
    return tools
