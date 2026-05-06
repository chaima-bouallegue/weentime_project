from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

from pydantic import BaseModel

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .result import ToolResult

ToolHandler = Callable[[BaseModel, CurrentUserContext], Awaitable[ToolResult]]


@dataclass(slots=True)
class RegisteredTool:
    definition: ToolDefinition
    handler: ToolHandler


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, RegisteredTool] = {}

    def register(self, definition: ToolDefinition, handler: ToolHandler) -> None:
        self._tools[definition.name] = RegisteredTool(definition=definition, handler=handler)

    def get(self, name: str) -> RegisteredTool:
        if name not in self._tools:
            raise KeyError(f"Unknown tool: {name}")
        return self._tools[name]

    def list_tools(self) -> list[ToolDefinition]:
        return [registered.definition for registered in self._tools.values()]

    def validate_access(self, name: str, context: CurrentUserContext) -> ToolResult | None:
        registered = self.get(name)
        definition = registered.definition
        if definition.allowed_roles and context.role.upper() not in {role.upper() for role in definition.allowed_roles}:
            return ToolResult.fail("forbidden_role", "Votre role ne permet pas cette action.", status_code=403)
        missing_permissions = definition.required_permissions - context.permissions
        if missing_permissions:
            return ToolResult.fail("missing_permission", "Permission insuffisante.", status_code=403)
        return None

    def validate_input(self, name: str, payload: dict) -> BaseModel:
        return self.get(name).definition.input_model(**(payload or {}))
