from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from app.tools.telework_tools import register_telework_tools


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role=role, entreprise_id=9, token="token")


class FakeBackendClient:
    def __init__(self, *, fail: ToolResult | None = None) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []
        self.fail = fail

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params))
        if self.fail is not None:
            return self.fail
        if path == "/rh/teletravail/mes-demandes":
            return ToolResult.ok(
                [
                    {"id": 41, "statut": "EN_ATTENTE_MANAGER", "dateDebut": "2026-05-08", "dateFin": "2026-05-08"},
                    {"id": 42, "statut": "APPROUVE", "dateDebut": "2026-05-09", "dateFin": "2026-05-09"},
                ],
                status_code=200,
            )
        if path == "/rh/teletravail/41":
            return ToolResult.ok({"id": 41, "statut": "EN_ATTENTE_MANAGER"}, status_code=200)
        return ToolResult.fail("not_found", "Not found", status_code=404)

    async def post(
        self,
        path: str,
        *,
        context: CurrentUserContext,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ToolResult:
        _ = headers
        self.calls.append(("POST", path, json))
        return ToolResult.ok({"id": 99, **(json or {})}, status_code=201)

    async def request(
        self,
        method: str,
        path: str,
        *,
        context: CurrentUserContext,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ToolResult:
        _ = params, headers
        self.calls.append((method.upper(), path, json))
        return ToolResult.ok({"id": 41, "statut": "EN_ATTENTE_RH", **(json or {})}, status_code=200)


def executor_with_backend(backend: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_telework_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry)


@pytest.mark.asyncio
async def test_telework_create_uses_verified_endpoint_without_user_id() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "telework.create_request",
        {"start_date": "2026-05-08", "end_date": "2026-05-08", "telework_type": "JOURNEE_COMPLETE"},
        context(),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls == [("POST", "/rh/teletravail", {"type": "JOURNEE_COMPLETE", "dateDebut": "2026-05-08", "dateFin": "2026-05-08"})]
    assert "utilisateurId" not in backend.calls[0][2]


@pytest.mark.asyncio
async def test_telework_list_returns_read_result() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("telework.list_my_requests", {}, context())

    assert result.success is True
    assert backend.calls[0][1] == "/rh/teletravail/mes-demandes"
    assert result.data["read_result"]["count"] == 2


@pytest.mark.asyncio
async def test_telework_get_status_uses_detail_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("telework.get_status", {"request_id": 41}, context())

    assert result.success is True
    assert backend.calls[0][1] == "/rh/teletravail/41"
    assert "en attente manager" in result.data["read_result"]["summary"]


@pytest.mark.asyncio
async def test_telework_manager_decide_requires_manager_role() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "telework.manager_decide",
        {"request_id": 41, "decision": "APPROVE"},
        context("EMPLOYEE"),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "role_not_allowed"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_telework_manager_decide_calls_manager_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "telework.manager_decide",
        {"request_id": 41, "decision": "APPROVE", "comment": "ok"},
        context("MANAGER"),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls == [("PATCH", "/rh/teletravail/41/valider-manager", {"commentaire": "ok"})]


@pytest.mark.asyncio
async def test_telework_rh_decide_calls_rh_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "telework.rh_decide",
        {"request_id": 41, "decision": "REJECT"},
        context("RH"),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls == [("PATCH", "/rh/teletravail/41/rejeter-rh", {})]


@pytest.mark.asyncio
async def test_telework_unsupported_decision_returns_capability_unavailable() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "telework.manager_decide",
        {"request_id": 41, "decision": "ESCALATE"},
        context("MANAGER"),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "capability_unavailable"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_telework_backend_unavailable_returns_clean_message() -> None:
    backend = FakeBackendClient(fail=ToolResult.fail("backend_unreachable", "connect ECONNREFUSED", status_code=503))
    result = await executor_with_backend(backend).execute("telework.list_my_requests", {}, context())

    assert result.success is False
    assert "momentanement indisponible" in result.data["read_result"]["summary"]
    assert "ECONNREFUSED" not in result.data["read_result"]["summary"]
