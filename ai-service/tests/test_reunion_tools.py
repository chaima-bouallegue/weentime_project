from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from app.tools.reunion_tools import register_reunion_tools


def _context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role=role, entreprise_id=9, token="token")


class FakeBackendClient:
    def __init__(self, responses: dict[str, ToolResult] | None = None) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []
        self.responses = responses or {}

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params))
        if path in self.responses:
            return self.responses[path]
        if path == "/rh/reunions/mes-reunions":
            return ToolResult.ok(
                [
                    {"uuid": "abc-1", "titre": "Daily IA", "dateHeure": "2026-05-16T09:00:00"},
                    {"uuid": "abc-2", "titre": "Sprint planning", "dateHeure": "2026-05-17T14:00:00"},
                ],
                status_code=200,
            )
        if path == "/rh/reunions/prochaine":
            return ToolResult.ok(
                {"uuid": "abc-1", "titre": "Daily IA", "dateHeure": "2026-05-16T09:00:00"},
                status_code=200,
            )
        if path.startswith("/rh/reunions/"):
            uuid = path.rsplit("/", 1)[-1]
            return ToolResult.ok(
                {"uuid": uuid, "titre": "Detail reunion", "participants": []},
                status_code=200,
            )
        return ToolResult.fail("not_found", "Not found", status_code=404)

    async def post(self, *args: Any, **kwargs: Any) -> ToolResult:
        raise AssertionError("reunion_tools must not POST in read-only flows")

    async def request(self, *args: Any, **kwargs: Any) -> ToolResult:
        raise AssertionError("reunion_tools must not use request() in read-only flows")


def _executor(backend: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_reunion_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry)


@pytest.mark.asyncio
async def test_list_mine_employee_can_read() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute("reunion.list_mine", {}, _context("EMPLOYEE"))

    assert result.success is True
    assert backend.calls == [("GET", "/rh/reunions/mes-reunions", None)]
    read = result.data["read_result"]
    assert read["count"] == 2
    assert read["empty"] is False
    assert read["items"][0]["titre"] == "Daily IA"


@pytest.mark.asyncio
async def test_list_mine_truncates_to_limit() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute("reunion.list_mine", {"limit": 1}, _context("EMPLOYEE"))

    assert result.success is True
    assert result.data["read_result"]["count"] == 1


@pytest.mark.asyncio
async def test_next_reunion_returns_single_item() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute("reunion.next", {}, _context("MANAGER"))

    assert result.success is True
    assert backend.calls == [("GET", "/rh/reunions/prochaine", None)]
    read = result.data["read_result"]
    assert read["count"] == 1
    assert read["empty"] is False
    assert "Daily IA" in read["summary"]


@pytest.mark.asyncio
async def test_next_reunion_404_is_safe_empty_not_error() -> None:
    backend = FakeBackendClient(
        responses={"/rh/reunions/prochaine": ToolResult.fail("not_found", "Not found", status_code=404)}
    )
    result = await _executor(backend).execute("reunion.next", {}, _context("EMPLOYEE"))

    # No upcoming reunion is a normal state, not a tool failure.
    assert result.success is True
    read = result.data["read_result"]
    assert read["count"] == 0
    assert read["empty"] is True
    assert "Aucune reunion" in read["summary"]


@pytest.mark.asyncio
async def test_next_reunion_empty_body_is_safe_empty() -> None:
    backend = FakeBackendClient(responses={"/rh/reunions/prochaine": ToolResult.ok(None, status_code=200)})
    result = await _executor(backend).execute("reunion.next", {}, _context("EMPLOYEE"))

    assert result.success is True
    assert result.data["read_result"]["empty"] is True


@pytest.mark.asyncio
async def test_get_detail_hits_uuid_path() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute(
        "reunion.get_detail",
        {"uuid": "abc-1"},
        _context("EMPLOYEE"),
    )

    assert result.success is True
    assert backend.calls == [("GET", "/rh/reunions/abc-1", None)]
    assert result.data["read_result"]["count"] == 1


@pytest.mark.asyncio
async def test_all_business_roles_allowed_for_list_mine() -> None:
    backend = FakeBackendClient()
    for role in ("EMPLOYEE", "MANAGER", "RH", "ADMIN"):
        result = await _executor(FakeBackendClient()).execute("reunion.list_mine", {}, _context(role))
        assert result.success is True, f"role {role} unexpectedly denied"
    _ = backend  # silence unused-var
