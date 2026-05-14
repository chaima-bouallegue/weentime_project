from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from app.tools.rh_tools import register_rh_tools


def context(role: str = "RH", *, tenant_id: int | None = 9) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role=role,
        entreprise_id=tenant_id,
        token="verified-token",
        metadata={"jwt_verified": True, "request_id": "req-rh-stats"},
    )


class FakeBackendClient:
    def __init__(self, *, response: ToolResult | None = None) -> None:
        self.response = response
        self.calls: list[tuple[str, str, CurrentUserContext, dict[str, Any] | None]] = []

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, context, params))
        if self.response is not None:
            return self.response
        return ToolResult.ok(
            {
                "totalEmployees": 12,
                "presentToday": 9,
                "absentToday": 3,
                "pendingRequests": 4,
                "attendanceRate": 75.0,
            },
            status_code=200,
        )


def executor_with_backend(backend: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_rh_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry)


@pytest.mark.asyncio
async def test_rh_get_stats_uses_verified_backend_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("rh.get_stats", {}, context("RH"))

    assert result.success is True
    assert backend.calls[0][0] == "GET"
    assert backend.calls[0][1] == "/rh/stats"
    assert backend.calls[0][2].token == "verified-token"
    assert backend.calls[0][2].tenant_id == 9
    read_result = result.data["read_result"]
    assert read_result["toolName"] == "rh.get_stats"
    assert read_result["count"] == 5
    assert "12 employe(s)" in read_result["summary"]
    assert "4 demande(s) en attente" in read_result["summary"]


@pytest.mark.asyncio
async def test_admin_can_execute_rh_get_stats_when_backend_allows_it() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("rh.get_stats", {}, context("ADMIN", tenant_id=None))

    assert result.success is True
    assert backend.calls[0][1] == "/rh/stats"


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["EMPLOYEE", "MANAGER"])
async def test_employee_and_manager_cannot_execute_rh_get_stats(role: str) -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("rh.get_stats", {}, context(role))

    assert result.success is False
    assert result.error_code == "role_not_allowed"
    assert backend.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "expected"),
    [
        (ToolResult.fail("http_403", "Forbidden", status_code=403), "Votre role ne permet pas"),
        (ToolResult.fail("http_404", "Not found", status_code=404), "pas encore disponibles"),
        (ToolResult.fail("backend_unreachable", "offline", status_code=503), "momentanement indisponible"),
    ],
)
async def test_rh_get_stats_failures_return_clean_unavailable_read_result(failure: ToolResult, expected: str) -> None:
    backend = FakeBackendClient(response=failure)
    result = await executor_with_backend(backend).execute("rh.get_stats", {}, context("RH"))

    assert result.success is False
    read_result = result.data["read_result"]
    assert read_result["toolName"] == "rh.get_stats"
    assert read_result["count"] == 0
    assert expected in read_result["summary"]


@pytest.mark.asyncio
async def test_rh_get_stats_does_not_invent_metrics_when_backend_returns_empty_payload() -> None:
    backend = FakeBackendClient(response=ToolResult.ok({}, status_code=200))
    result = await executor_with_backend(backend).execute("rh.get_stats", {}, context("RH"))

    assert result.success is True
    read_result = result.data["read_result"]
    assert read_result["items"] == []
    assert read_result["count"] == 0
    assert read_result["summary"] == "Aucune statistique RH disponible depuis le backend."


def test_rh_get_stats_is_registered_as_read_only_without_confirmation() -> None:
    registry = ToolRegistry()
    register_rh_tools(registry, FakeBackendClient())  # type: ignore[arg-type]

    definition = registry.get("rh.get_stats").definition
    assert definition.type == "read"
    assert definition.allowed_roles == {"RH", "ADMIN"}
    assert definition.requires_confirmation is False
