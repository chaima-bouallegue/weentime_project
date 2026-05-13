from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

from pydantic import BaseModel

from app.context.current_user import CurrentUserContext
from app.context.jwt_parser import BUSINESS_ROLES, normalize_role
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
        self._validate_definition(definition)
        if definition.name in self._tools:
            raise ValueError(f"duplicate_tool: {definition.name}")
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

        context_error = self._validate_context(definition, context)
        if context_error:
            return context_error

        context_role = normalize_role(context.role)
        allowed_roles = {role.upper().replace("ROLE_", "") for role in definition.allowed_roles}
        if allowed_roles and context_role not in allowed_roles:
            return ToolResult.fail("role_not_allowed", "Votre role ne permet pas cette action.", status_code=403)
        missing_permissions = definition.required_permissions - context.permissions
        if missing_permissions:
            return ToolResult.fail("permission_denied", "Permission insuffisante.", status_code=403)
        return None

    def validate_input(self, name: str, payload: dict) -> BaseModel:
        return self.get(name).definition.input_model(**(payload or {}))

    @staticmethod
    def _validate_definition(definition: ToolDefinition) -> None:
        if not definition.name or not definition.name.strip():
            raise ValueError("tool_name_required")
        if not definition.allowed_roles:
            raise ValueError(f"allowed_roles_required: {definition.name}")

        normalized_roles = {role.upper().replace("ROLE_", "") for role in definition.allowed_roles}
        invalid_roles = normalized_roles - BUSINESS_ROLES
        if invalid_roles:
            raise ValueError(f"invalid_role: {definition.name}: {', '.join(sorted(invalid_roles))}")

        if definition.type == "write":
            if not definition.requires_confirmation:
                raise ValueError(f"confirmation_required: {definition.name}")
            if not definition.idempotency_required and not definition.idempotency_safe_exception:
                raise ValueError(f"idempotency_required: {definition.name}")

    @staticmethod
    def _validate_context(definition: ToolDefinition, context: CurrentUserContext) -> ToolResult | None:
        try:
            user_id = int(getattr(context, "user_id", 0) or 0)
        except (TypeError, ValueError):
            user_id = 0
        if context is None or user_id <= 0:
            return ToolResult.fail("missing_user", "Utilisateur authentifie manquant.", status_code=401)

        role = normalize_role(getattr(context, "role", None))
        if not role:
            return ToolResult.fail("invalid_role", "Role authentifie invalide.", status_code=403)

        if not getattr(context, "is_verified", False):
            return ToolResult.fail("unverified_context", "Contexte utilisateur non verifie.", status_code=401)

        if definition.tenant_scoped and role != "ADMIN" and context.tenant_id is None:
            return ToolResult.fail("missing_tenant", "Entreprise authentifiee manquante.", status_code=403)

        return None
