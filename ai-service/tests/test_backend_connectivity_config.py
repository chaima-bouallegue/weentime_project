from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
import pytest
from pydantic import BaseModel

from config import Settings
from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition
from app.tools.backend_client import BackendClient
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult


class EmptyInput(BaseModel):
    pass


def context(language: str = "en") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role="EMPLOYEE",
        entreprise_id=9,
        permissions={"attendance:read:self"},
        token="token",
        language=language,
        metadata={"jwt_verified": True, "original_text": "Check my pointage", "response_language": language},
    )


def test_backend_base_url_default_is_gateway_8322(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BACKEND_BASE_URL", raising=False)

    assert Settings().backend_base_url == "http://localhost:8322/api/v1"


def test_backend_base_url_uses_env_and_normalizes_api_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BACKEND_BASE_URL", "http://localhost:8322")

    assert BackendClient().base_url == "http://localhost:8322/api/v1"


def test_no_runtime_hardcoded_8222_remains() -> None:
    root = Path(__file__).resolve().parents[1]
    runtime_roots = [root / "app", root / "tools", root / "config.py", root / "main.py"]
    legacy_port = "localhost:" + "8222"
    offenders: list[str] = []
    for runtime_root in runtime_roots:
        files = [runtime_root] if runtime_root.is_file() else runtime_root.rglob("*.py")
        for path in files:
            if legacy_port in path.read_text(encoding="utf-8", errors="ignore"):
                offenders.append(str(path.relative_to(root)))

    assert offenders == []


@pytest.mark.asyncio
async def test_backend_client_connection_error_returns_clean_structured_message(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _request(self: Any, method: str, url: str, **kwargs: Any) -> Any:
        _ = self, kwargs
        raise httpx.ConnectError("All connection attempts failed", request=httpx.Request(method, url))

    monkeypatch.setattr(httpx.AsyncClient, "request", _request)

    result = await BackendClient(base_url="http://localhost:8322/api/v1").get(
        "/presence/me/today",
        context=context("en"),
        tool_name="attendance.status",
    )

    assert result.success is False
    assert result.error_code == "backend_unavailable"
    assert result.module == "presence"
    assert result.user_message == "The backend service is temporarily unavailable."
    assert "All connection attempts failed" not in (result.error_message or "")
    assert result.data["module"] == "presence"
    assert result.data["user_message"] == "The backend service is temporarily unavailable."


@pytest.mark.asyncio
async def test_gateway_health_200_marks_backend_available(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _get(self: Any, url: str, **kwargs: Any) -> httpx.Response:
        _ = self, kwargs
        assert url == "http://localhost:8322/actuator/health"
        return httpx.Response(200, json={"status": "UP"}, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", _get)

    result = await BackendClient(base_url="http://localhost:8322/api/v1").preflight(context("en"))

    assert result.success is True
    assert result.status_code == 200


@pytest.mark.asyncio
async def test_preflight_fallback_401_is_reachable_not_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    async def _get(self: Any, url: str, **kwargs: Any) -> httpx.Response:
        _ = self, kwargs
        calls.append(url)
        if url.endswith("/actuator/health"):
            return httpx.Response(404, text="Not Found", request=httpx.Request("GET", url))
        return httpx.Response(401, text="Missing Authorization header", request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", _get)

    result = await BackendClient(base_url="http://localhost:8322/api/v1").preflight(context("en"))

    assert result.success is True
    assert result.status_code == 401
    assert calls == [
        "http://localhost:8322/actuator/health",
        "http://localhost:8322/api/v1/users/me",
    ]


@pytest.mark.asyncio
async def test_backend_client_401_returns_auth_required_not_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _request(self: Any, method: str, url: str, **kwargs: Any) -> httpx.Response:
        _ = self, method, kwargs
        return httpx.Response(401, text="Missing Authorization header", request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "request", _request)

    result = await BackendClient(base_url="http://localhost:8322/api/v1").get(
        "/presence/me/today",
        context=context("en"),
        tool_name="attendance.status",
    )

    assert result.success is False
    assert result.error_code == "auth_required"
    assert result.status_code == 401
    assert result.module == "presence"
    assert result.user_message == "Your session is expired. Please log in again."
    assert result.error_code != "backend_unavailable"


@pytest.mark.asyncio
async def test_backend_client_403_returns_access_denied_not_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _request(self: Any, method: str, url: str, **kwargs: Any) -> httpx.Response:
        _ = self, method, kwargs
        return httpx.Response(403, json={"message": "Forbidden"}, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "request", _request)

    result = await BackendClient(base_url="http://localhost:8322/api/v1").get(
        "/rh/statistics",
        context=context("en"),
        tool_name="rh.stats",
    )

    assert result.success is False
    assert result.error_code == "access_denied"
    assert result.status_code == 403
    assert result.module == "rh"
    assert result.user_message == "Access denied. You do not have permission for this action."
    assert result.error_code != "backend_unavailable"


@pytest.mark.asyncio
async def test_backend_client_forwards_authorization_and_tenant_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    seen_headers: dict[str, str] = {}

    async def _request(self: Any, method: str, url: str, **kwargs: Any) -> httpx.Response:
        _ = self, method
        seen_headers.update(dict(kwargs["headers"]))
        return httpx.Response(200, json={"ok": True}, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "request", _request)

    await BackendClient(base_url="http://localhost:8322/api/v1").get(
        "/presence/me/today",
        context=context("en"),
        tool_name="attendance.status",
    )

    assert seen_headers["Authorization"] == "Bearer token"
    assert seen_headers["X-Entreprise-Id"] == "9"
    assert seen_headers["X-Company-Id"] == "9"
    assert seen_headers["X-User-Role"] == "EMPLOYEE"


@pytest.mark.asyncio
async def test_executor_preflight_stops_repeated_backend_calls_when_gateway_is_down() -> None:
    calls = {"handler": 0}

    async def handler(_: BaseModel, __: CurrentUserContext) -> ToolResult:
        calls["handler"] += 1
        return ToolResult.ok({"unexpected": True})

    class DownBackend:
        preflight_calls = 0

        async def preflight(self, ctx: CurrentUserContext, *, tool_name: str | None = None) -> ToolResult:
            _ = ctx, tool_name
            self.preflight_calls += 1
            return ToolResult.fail(
                "backend_unavailable",
                "The backend service is temporarily unavailable.",
                status_code=503,
                module="presence",
                user_message="The backend service is temporarily unavailable.",
            )

    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            name="get_pointage_status",
            description="Read current user attendance.",
            input_model=EmptyInput,
            output_model=None,
            type="read",
            allowed_roles={"EMPLOYEE"},
        ),
        handler,
    )
    backend = DownBackend()
    executor = ToolExecutor(registry, backend_client=backend)
    ctx = context("en")

    first = await executor.execute("get_pointage_status", {}, ctx)
    second = await executor.execute("get_pointage_status", {}, ctx)

    assert backend.preflight_calls == 1
    assert calls["handler"] == 0
    assert first.error_code == "backend_unavailable"
    assert second.error_code == "backend_unavailable"
    assert first.data["read_result"]["error"]["module"] == "presence"
    assert first.data["read_result"]["count"] == 0
    assert "All connection attempts failed" not in first.data["read_result"]["summary"]


@pytest.mark.asyncio
async def test_executor_wraps_auth_required_read_result_without_retryable_backend_code() -> None:
    async def handler(_: BaseModel, __: CurrentUserContext) -> ToolResult:
        return ToolResult.fail(
            "auth_required",
            "Your session is expired. Please log in again.",
            status_code=401,
            module="presence",
            user_message="Your session is expired. Please log in again.",
        )

    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            name="get_pointage_status",
            description="Read current user attendance.",
            input_model=EmptyInput,
            output_model=None,
            type="read",
            allowed_roles={"EMPLOYEE"},
        ),
        handler,
    )
    executor = ToolExecutor(registry)
    result = await executor.execute("get_pointage_status", {}, context("en"))

    assert result.error_code == "auth_required"
    assert result.status_code == 401
    assert result.data["read_result"]["error"]["code"] == "auth_required"
    assert result.data["read_result"]["backendStatus"] == 401
