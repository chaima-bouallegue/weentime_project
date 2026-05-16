from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult

ALL_BUSINESS_ROLES = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}
TEAM_PRESENCE_UNAVAILABLE = "Cette vue de presence n'est pas encore disponible pour votre role."


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
                description="Retourne la presence collective selon le role authentifie.",
                input_model=TeamPresenceInput,
                output_model=None,
                type="read",
                allowed_roles=ALL_BUSINESS_ROLES,
            ),
            self.get_team_presence,
        )

    async def get_pointage_status(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.backend_client.get("/presence/me/today", context=context)

    async def check_in(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.backend_client.post(
            "/presence/me/check-in",
            context=context,
            json=_attendance_write_body(context, action="check_in"),
        )

    async def check_out(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.backend_client.post(
            "/presence/me/check-out",
            context=context,
            json=_attendance_write_body(context, action="check_out"),
        )

    async def get_presence_history(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        data = payload.model_dump()
        return await self.backend_client.get("/presence/me/history", context=context, params=data)

    async def get_week_hours(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self.backend_client.get("/presence/me/stats", context=context)

    async def get_team_presence(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        params: dict[str, Any] = {}
        team_id = getattr(payload, "team_id", None)
        if role == "MANAGER" and team_id is not None:
            params["teamId"] = team_id
        if role == "MANAGER":
            return await self.backend_client.get("/presence/team/today", context=context, params=params or None)
        if role == "RH":
            return await self.backend_client.get("/presence/company/today", context=context)
        if role == "ADMIN":
            return await self.backend_client.get("/presence/global/analytics", context=context)
        return ToolResult.fail(
            "capability_unavailable",
            TEAM_PRESENCE_UNAVAILABLE,
            status_code=403,
        )


def register_attendance_tools(registry: ToolRegistry, backend_client: BackendClient) -> AttendanceTools:
    tools = AttendanceTools(backend_client)
    tools.register(registry)
    return tools


def _attendance_write_body(context: CurrentUserContext, *, action: str) -> dict[str, Any]:
    # Spring backend (PresenceController) requires `source` on every write —
    # missing it surfaces as "source: La source est obligatoire". Tag rows the
    # AI copilot wrote so reporting can distinguish them from manual punches.
    channel = "chat"
    if isinstance(context.metadata, dict):
        candidate = context.metadata.get("channel")
        if isinstance(candidate, str) and candidate.strip():
            channel = candidate.strip()
    return {
        "source": "AI_CHATBOT",
        "channel": channel,
        "action": action,
    }
