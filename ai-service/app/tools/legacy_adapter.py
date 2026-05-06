from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult


class LegacyActionInput(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class LegacyHrToolsAdapter:
    TOOL_SPECS = {
        "legacy.get_leave_balance": ("get_leave_balance", "read", {"EMPLOYEE", "MANAGER", "RH"}),
        "legacy.create_leave_request": ("create_leave", "write", {"EMPLOYEE"}),
        "legacy.request_document": ("request_document", "write", {"EMPLOYEE"}),
        "legacy.open_document": ("open_document", "read", {"EMPLOYEE", "RH"}),
        "legacy.create_telework": ("create_telework", "write", {"EMPLOYEE"}),
        "legacy.create_authorization": ("create_authorization", "write", {"EMPLOYEE"}),
        "legacy.get_my_requests": ("get_my_requests", "read", {"EMPLOYEE"}),
        "legacy.get_pending_validations": ("get_pending_validations", "read", {"MANAGER"}),
        "legacy.get_team_requests": ("get_team_requests", "read", {"MANAGER"}),
        "legacy.approve_request": ("approve_request", "write", {"MANAGER"}),
        "legacy.reject_request": ("reject_request", "write", {"MANAGER"}),
        "legacy.get_rh_stats": ("get_rh_stats", "read", {"RH"}),
        "legacy.get_all_requests": ("get_all_requests", "read", {"RH"}),
        "legacy.process_request": ("process_request", "write", {"RH"}),
    }

    def __init__(self, hr_tools: Any | None) -> None:
        self.hr_tools = hr_tools

    def register(self, registry: ToolRegistry) -> None:
        for tool_name, (action, kind, roles) in self.TOOL_SPECS.items():
            is_write = kind == "write"
            registry.register(
                ToolDefinition(
                    name=tool_name,
                    description=f"Legacy HRTools bridge for {action}.",
                    input_model=LegacyActionInput,
                    output_model=None,
                    type=kind,
                    allowed_roles=set(roles),
                    required_permissions=set(),
                    requires_confirmation=is_write,
                    idempotency_required=is_write,
                ),
                self._handler(action),
            )

    def _handler(self, action: str):
        async def run(payload: BaseModel, context: CurrentUserContext) -> ToolResult:
            if self.hr_tools is None:
                return ToolResult.fail("legacy_tools_unavailable", "Legacy HR tools are unavailable.", status_code=503)
            result = await self.hr_tools.execute_action(
                action,
                getattr(payload, "payload", {}) or {},
                user_id=context.user_id,
                access_token=context.token,
                role=context.role,
            )
            return ToolResult(
                success=bool(getattr(result, "success", False)),
                data=getattr(result, "data", None),
                warnings=[],
                error_code=getattr(result, "error", None),
                error_message=getattr(result, "text", None) or getattr(result, "error", None),
                status_code=getattr(result, "status_code", None),
            )

        return run


def register_legacy_hr_tools(registry: ToolRegistry, hr_tools: Any | None) -> LegacyHrToolsAdapter:
    adapter = LegacyHrToolsAdapter(hr_tools)
    adapter.register(registry)
    return adapter
