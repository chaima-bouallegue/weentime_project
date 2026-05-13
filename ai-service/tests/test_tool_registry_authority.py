from __future__ import annotations

from typing import Any

import pytest
from pydantic import BaseModel

from app.context.current_user import CurrentUserContext
from app.context.permissions import permissions_for_role
from app.models.tool_models import ToolDefinition
from app.tools.admin_tools import register_admin_tools
from app.tools.attendance_tools import register_attendance_tools
from app.tools.authorization_tools import register_authorization_tools
from app.tools.document_tools import register_document_tools
from app.tools.executor import ToolExecutor
from app.tools.insight_tools import register_insight_tools
from app.tools.leave_tools import register_leave_tools
from app.tools.legacy_adapter import register_legacy_hr_tools
from app.tools.policy_tools import register_policy_tools
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from app.tools.telework_tools import register_telework_tools


class EmptyInput(BaseModel):
    pass


class FakeBackendClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []

    async def get(self, path, *, context, params=None):
        self.calls.append(("GET", path, params))
        return ToolResult.ok({"path": path}, status_code=200)

    async def post(self, path, *, context, json=None, headers=None):
        self.calls.append(("POST", path, json))
        return ToolResult.ok({"path": path}, status_code=201)

    async def request(self, method, path, *, context, params=None, json=None, headers=None):
        self.calls.append((method.upper(), path, json or params))
        return ToolResult.ok({"path": path}, status_code=200)


def context(
    role: str = "EMPLOYEE",
    *,
    user_id: int = 1,
    tenant_id: int | None = 10,
    token: str | None = "token",
    jwt_verified: bool | None = None,
    permissions: set[str] | None = None,
) -> CurrentUserContext:
    metadata: dict[str, object] = {"request_id": "req-test"}
    if jwt_verified is not None:
        metadata["jwt_verified"] = jwt_verified
    return CurrentUserContext(
        user_id=user_id,
        role=role,
        entreprise_id=tenant_id,
        permissions=permissions if permissions is not None else permissions_for_role(role),
        token=token,
        metadata=metadata,
    )


def build_full_registry() -> ToolRegistry:
    backend = FakeBackendClient()
    registry = ToolRegistry()
    register_attendance_tools(registry, backend)  # type: ignore[arg-type]
    register_leave_tools(registry, backend)  # type: ignore[arg-type]
    register_document_tools(registry, backend)  # type: ignore[arg-type]
    register_telework_tools(registry, backend)  # type: ignore[arg-type]
    register_authorization_tools(registry, backend)  # type: ignore[arg-type]
    register_admin_tools(registry, backend)  # type: ignore[arg-type]
    register_policy_tools(registry)
    register_legacy_hr_tools(registry, None)
    executor = ToolExecutor(registry)
    register_insight_tools(registry, executor)
    return registry


async def ok_handler(payload: BaseModel, user_context: CurrentUserContext) -> ToolResult:
    return ToolResult.ok({"token": user_context.token, "request_id": user_context.metadata.get("request_id")})


def test_every_registered_write_tool_requires_confirmation_and_idempotency_policy() -> None:
    registry = build_full_registry()
    write_tools = [definition for definition in registry.list_tools() if definition.type == "write"]

    assert write_tools
    for definition in write_tools:
        assert definition.requires_confirmation is True, definition.name
        assert definition.idempotency_required or definition.idempotency_safe_exception, definition.name


def test_registered_tools_use_only_valid_roles() -> None:
    registry = build_full_registry()
    valid_roles = {"ADMIN", "RH", "MANAGER", "EMPLOYEE"}

    for definition in registry.list_tools():
        assert definition.allowed_roles, definition.name
        assert {role.upper().replace("ROLE_", "") for role in definition.allowed_roles} <= valid_roles, definition.name


def test_registry_rejects_write_tool_without_confirmation() -> None:
    registry = ToolRegistry()

    with pytest.raises(ValueError, match="confirmation_required"):
        registry.register(
            ToolDefinition(
                name="unsafe.write",
                description="unsafe write",
                input_model=EmptyInput,
                output_model=None,
                type="write",
                allowed_roles={"EMPLOYEE"},
                idempotency_required=True,
            ),
            ok_handler,
        )


def test_registry_rejects_write_tool_without_idempotency_policy() -> None:
    registry = ToolRegistry()

    with pytest.raises(ValueError, match="idempotency_required"):
        registry.register(
            ToolDefinition(
                name="unsafe.write",
                description="unsafe write",
                input_model=EmptyInput,
                output_model=None,
                type="write",
                allowed_roles={"EMPLOYEE"},
                requires_confirmation=True,
            ),
            ok_handler,
        )


@pytest.mark.asyncio
async def test_unverified_context_is_denied() -> None:
    registry = build_full_registry()
    result = await ToolExecutor(registry).execute("get_pointage_status", {}, context(jwt_verified=False))

    assert result.success is False
    assert result.error_code == "unverified_context"
    assert result.status_code == 401


@pytest.mark.asyncio
async def test_missing_user_is_denied() -> None:
    registry = build_full_registry()
    result = await ToolExecutor(registry).execute("get_pointage_status", {}, context(user_id=0))

    assert result.success is False
    assert result.error_code == "missing_user"
    assert result.status_code == 401


@pytest.mark.asyncio
async def test_missing_tenant_is_denied_for_tenant_scoped_non_admin_tool() -> None:
    registry = build_full_registry()
    result = await ToolExecutor(registry).execute("get_pointage_status", {}, context(tenant_id=None))

    assert result.success is False
    assert result.error_code == "missing_tenant"
    assert result.status_code == 403


@pytest.mark.asyncio
async def test_invalid_role_is_denied() -> None:
    registry = build_full_registry()
    result = await ToolExecutor(registry).execute("get_pointage_status", {}, context(role="SUPERUSER"))

    assert result.success is False
    assert result.error_code == "invalid_role"
    assert result.status_code == 403


@pytest.mark.asyncio
async def test_role_hierarchy_denials_are_stable() -> None:
    executor = ToolExecutor(build_full_registry())

    employee_manager = await executor.execute("legacy.get_pending_validations", {}, context("EMPLOYEE"))
    manager_rh = await executor.execute("legacy.get_rh_stats", {}, context("MANAGER"))
    rh_admin = await executor.execute("admin.list_users", {}, context("RH"))
    manager_admin = await executor.execute("admin.list_users", {}, context("MANAGER"))

    assert employee_manager.error_code == "role_not_allowed"
    assert manager_rh.error_code == "role_not_allowed"
    assert rh_admin.error_code == "role_not_allowed"
    assert manager_admin.error_code == "role_not_allowed"


@pytest.mark.asyncio
async def test_confirmation_required_write_does_not_execute_handler() -> None:
    called = False

    async def handler(payload: BaseModel, user_context: CurrentUserContext) -> ToolResult:
        nonlocal called
        called = True
        return ToolResult.ok({})

    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            name="safe.write",
            description="confirmed write",
            input_model=EmptyInput,
            output_model=None,
            type="write",
            allowed_roles={"EMPLOYEE"},
            requires_confirmation=True,
            idempotency_required=True,
        ),
        handler,
    )

    result = await ToolExecutor(registry).execute("safe.write", {}, context("EMPLOYEE"), confirmed=False)

    assert result.success is False
    assert result.error_code == "confirmation_required"
    assert called is False


@pytest.mark.asyncio
async def test_backend_context_token_and_request_metadata_are_forwarded_to_handler() -> None:
    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            name="safe.read",
            description="safe read",
            input_model=EmptyInput,
            output_model=None,
            type="read",
            allowed_roles={"EMPLOYEE"},
        ),
        ok_handler,
    )

    result = await ToolExecutor(registry).execute("safe.read", {}, context("EMPLOYEE", token="jwt-token"), request_id="req-test")

    assert result.success is True
    assert result.data == {"token": "jwt-token", "request_id": "req-test"}


@pytest.mark.asyncio
async def test_existing_allowed_read_tool_still_executes() -> None:
    registry = build_full_registry()
    result = await ToolExecutor(registry).execute("get_pointage_status", {}, context("EMPLOYEE"))

    assert result.success is True
    assert result.data == {"path": "/presence/me/today"}
