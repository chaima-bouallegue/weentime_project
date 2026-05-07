from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.tools.authorization_tools import register_authorization_tools
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult


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
        if path == "/rh/parametres/types-autorisations":
            return ToolResult.ok(
                [
                    {"id": 7, "libelle": "SORTIE_ANTICIPEE"},
                    {"id": 8, "libelle": "ABSENCE_TEMPORAIRE"},
                    {"id": 9, "libelle": "AUTRE"},
                ],
                status_code=200,
            )
        if path == "/rh/autorisations/me":
            return ToolResult.ok(
                {"content": [{"id": 41, "statut": "EN_ATTENTE_MANAGER"}], "totalElements": 1, "number": 0, "size": 20},
                status_code=200,
            )
        if path == "/rh/autorisations/41":
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
        if self.fail is not None:
            return self.fail
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
        return ToolResult.ok({"id": 41, "statut": "APPROUVE", **(json or {})}, status_code=200)


def executor_with_backend(backend: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_authorization_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry)


@pytest.mark.asyncio
async def test_authorization_create_resolves_type_and_posts_verified_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "authorization.create_request",
        {
            "request_date": "2026-05-08",
            "time_start": "10:00:00",
            "time_end": "12:00:00",
            "authorization_type": "SORTIE_ANTICIPEE",
            "reason": "rendez-vous",
        },
        context(),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls[0] == ("GET", "/rh/parametres/types-autorisations", None)
    assert backend.calls[1][0] == "POST"
    assert backend.calls[1][1] == "/autorisations"
    posted = backend.calls[1][2]
    assert posted["typeAutorisation"] == {"id": 7}
    assert posted["dateAutorisation"] == "2026-05-08"
    assert "utilisateurId" not in posted


@pytest.mark.asyncio
async def test_authorization_list_returns_read_result() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("authorization.list_my_requests", {}, context())

    assert result.success is True
    assert backend.calls[0] == ("GET", "/rh/autorisations/me", {"page": 0, "size": 20})
    assert result.data["read_result"]["count"] == 1


@pytest.mark.asyncio
async def test_authorization_get_status_uses_detail_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("authorization.get_status", {"request_id": 41}, context())

    assert result.success is True
    assert backend.calls[0][1] == "/rh/autorisations/41"
    assert "en attente manager" in result.data["read_result"]["summary"]


@pytest.mark.asyncio
async def test_employee_cannot_approve_or_reject_authorization() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "authorization.manager_decide",
        {"request_id": 41, "decision": "APPROVE"},
        context("EMPLOYEE"),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "forbidden_role"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_authorization_manager_decide_calls_manager_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "authorization.manager_decide",
        {"request_id": 41, "decision": "APPROVE"},
        context("MANAGER"),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls == [("PATCH", "/rh/autorisations/41/manager/validate", None)]


@pytest.mark.asyncio
async def test_authorization_rh_reject_calls_reject_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "authorization.rh_decide",
        {"request_id": 41, "decision": "REJECT", "comment": "incomplet"},
        context("RH"),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls == [("PATCH", "/rh/autorisations/41/reject", {"commentaire": "incomplet"})]


@pytest.mark.asyncio
async def test_authorization_unsupported_decision_returns_capability_unavailable() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "authorization.rh_decide",
        {"request_id": 41, "decision": "ESCALATE"},
        context("RH"),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "capability_unavailable"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_authorization_create_requires_employee_role() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "authorization.create_request",
        {
            "request_date": "2026-05-08",
            "time_start": "10:00:00",
            "time_end": "12:00:00",
            "authorization_type": "SORTIE_ANTICIPEE",
        },
        context("MANAGER"),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "forbidden_role"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_authorization_create_404_returns_capability_unavailable() -> None:
    backend = FakeBackendClient(fail=ToolResult.fail("not_found", "Not found", status_code=404))
    result = await executor_with_backend(backend).execute(
        "authorization.create_request",
        {
            "request_date": "2026-05-08",
            "time_start": "10:00:00",
            "time_end": "12:00:00",
            "authorization_type": "SORTIE_ANTICIPEE",
            "reason": "rendez-vous",
        },
        context(),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "capability_unavailable"
    assert "introuvable" in result.error_message or "indisponible" in result.error_message


@pytest.mark.asyncio
async def test_authorization_backend_unavailable_returns_clean_message() -> None:
    backend = FakeBackendClient(fail=ToolResult.fail("backend_unreachable", "connect ECONNREFUSED", status_code=503))
    result = await executor_with_backend(backend).execute("authorization.list_my_requests", {}, context())

    assert result.success is False
    assert "momentanement indisponible" in result.data["read_result"]["summary"]
    assert "ECONNREFUSED" not in result.data["read_result"]["summary"]
