from __future__ import annotations

import pytest

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from pydantic import BaseModel


class EmptyInput(BaseModel):
    pass


async def ok_handler(payload: BaseModel, context: CurrentUserContext) -> ToolResult:
    return ToolResult.ok({"ok": True})


def make_context(role: str = "EMPLOYEE") -> CurrentUserContext:
    permissions = {"attendance:read:self", "attendance:write:self"} if role == "EMPLOYEE" else {"attendance:read:team"}
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, permissions=permissions, token="token")


@pytest.mark.asyncio
async def test_registry_denies_unauthorized_role() -> None:
    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            name="manager_only",
            description="manager tool",
            input_model=EmptyInput,
            output_model=None,
            type="read",
            allowed_roles={"MANAGER"},
        ),
        ok_handler,
    )
    executor = ToolExecutor(registry)

    result = await executor.execute("manager_only", {}, make_context("EMPLOYEE"))

    assert not result.success
    assert result.status_code == 403
    assert result.error_code == "forbidden_role"


@pytest.mark.asyncio
async def test_write_tool_requires_confirmation() -> None:
    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            name="check_in",
            description="check in",
            input_model=EmptyInput,
            output_model=None,
            type="write",
            allowed_roles={"EMPLOYEE"},
            required_permissions={"attendance:write:self"},
            requires_confirmation=True,
        ),
        ok_handler,
    )
    executor = ToolExecutor(registry)

    result = await executor.execute("check_in", {}, make_context("EMPLOYEE"))

    assert not result.success
    assert result.error_code == "confirmation_required"
