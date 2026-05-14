from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.tools.executor import ToolExecutor
from app.tools.leave_tools import register_leave_tools
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role=role, entreprise_id=9, token="token")


class FakeBackendClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params))
        if path == "/rh/solde-conges/me/all":
            return ToolResult.ok(
                [
                    {"id": 1, "typeCongeId": 7, "joursRestants": 8.5},
                    {"id": 2, "typeCongeId": 8, "joursRestants": 3.5},
                ],
                status_code=200,
            )
        if path == "/rh/conges/me":
            return ToolResult.ok(
                [{"id": 41, "statut": "EN_ATTENTE_MANAGER"}, {"id": 42, "statut": "APPROUVEE"}],
                status_code=200,
            )
        if path == "/rh/conges/manager":
            return ToolResult.ok(
                [{"id": 43, "statut": "EN_ATTENTE_MANAGER", "utilisateurId": 21}],
                status_code=200,
            )
        if path == "/rh/conges/rh/pending":
            return ToolResult.ok(
                [{"id": 44, "statut": "EN_ATTENTE_RH", "utilisateurId": 22}],
                status_code=200,
            )
        if path == "/rh/conges/41":
            return ToolResult.ok({"id": 41, "statut": "EN_ATTENTE_MANAGER"}, status_code=200)
        if path == "/rh/type-conges":
            return ToolResult.ok([{"id": 7, "libelle": "Conge annuel"}], status_code=200)
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
        return ToolResult.ok({"id": 43, "statut": "APPROUVEE", **(json or {})}, status_code=200)


def executor_with_backend(backend: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_leave_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry)


@pytest.mark.asyncio
async def test_leave_get_balance_uses_personal_solde_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("leave.get_balance", {}, context())

    read_result = result.data["read_result"]
    assert result.success is True
    assert backend.calls[0][1] == "/rh/solde-conges/me/all"
    assert read_result["summary"] == "Il vous reste 12 jours de conge."
    assert read_result["count"] == 2


@pytest.mark.asyncio
async def test_leave_list_my_requests_uses_personal_conge_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("leave.list_my_requests", {}, context())

    read_result = result.data["read_result"]
    assert result.success is True
    assert backend.calls[0][1] == "/rh/conges/me"
    assert read_result["count"] == 2
    assert "Vous avez 2 demande(s) de conge" in read_result["summary"]


@pytest.mark.asyncio
async def test_leave_get_request_status_uses_detail_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("leave.get_request_status", {"request_id": 41}, context())

    assert result.success is True
    assert backend.calls[0][1] == "/rh/conges/41"
    assert result.data["read_result"]["summary"] == "Demande de conge 41: EN_ATTENTE_MANAGER."


@pytest.mark.asyncio
async def test_leave_create_request_resolves_type_and_never_sends_user_id() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "leave.create_request",
        {
            "start_date": "2026-05-07",
            "end_date": "2026-05-07",
            "reason": "repos",
            "leave_type_label": "Conge annuel",
        },
        context(),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls[0][1] == "/rh/type-conges"
    assert backend.calls[1][0] == "POST"
    assert backend.calls[1][1] == "/rh/conges"
    posted = backend.calls[1][2]
    assert posted == {
        "dateDebut": "2026-05-07",
        "dateFin": "2026-05-07",
        "motif": "repos",
        "commentaire": "repos",
        "typeCongeId": 7,
    }
    assert "utilisateurId" not in posted


@pytest.mark.asyncio
async def test_leave_create_request_requires_employee_role() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "leave.create_request",
        {
            "start_date": "2026-05-07",
            "end_date": "2026-05-07",
            "reason": "repos",
            "leave_type_label": "Conge annuel",
        },
        context("MANAGER"),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "role_not_allowed"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_leave_manager_list_uses_manager_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("leave.list_manager_requests", {}, context("MANAGER"))

    assert result.success is True
    assert backend.calls[0][1] == "/rh/conges/manager"
    assert result.data["read_result"]["count"] == 1


@pytest.mark.asyncio
async def test_leave_rh_pending_uses_rh_pending_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("leave.list_rh_pending", {}, context("RH"))

    assert result.success is True
    assert backend.calls[0][1] == "/rh/conges/rh/pending"
    assert result.data["read_result"]["count"] == 1


@pytest.mark.asyncio
async def test_leave_manager_decide_calls_manager_validation_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "leave.manager_decide",
        {"request_id": 43, "decision": "APPROVE"},
        context("MANAGER"),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls == [("PATCH", "/rh/conges/43/valider", None)]


@pytest.mark.asyncio
async def test_leave_rh_reject_calls_reject_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "leave.rh_decide",
        {"request_id": 44, "decision": "REJECT", "comment": "incomplet"},
        context("RH"),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls == [("PATCH", "/rh/conges/44/refuser", {"commentaire": "incomplet"})]


@pytest.mark.asyncio
async def test_employee_cannot_execute_leave_manager_decision() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "leave.manager_decide",
        {"request_id": 43, "decision": "APPROVE"},
        context("EMPLOYEE"),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "role_not_allowed"
    assert backend.calls == []
