from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.tools.document_tools import register_document_tools
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
        if path == "/documents/mes-demandes":
            return ToolResult.ok(
                [
                    {
                        "id": 41,
                        "type": "ATTESTATION_TRAVAIL",
                        "label": "Attestation de travail",
                        "statut": "EN_ATTENTE",
                        "documentUrl": None,
                    },
                    {
                        "id": 42,
                        "type": "BULLETIN_PAIE",
                        "label": "Bulletin de paie",
                        "statut": "PRET",
                        "documentUrl": "C:/unsafe/storage/doc-42.pdf",
                    },
                ],
                status_code=200,
            )
        if path == "/documents/rh/demandes":
            return ToolResult.ok(
                [
                    {
                        "id": 51,
                        "type": "ATTESTATION_TRAVAIL",
                        "label": "Attestation de travail",
                        "statut": "EN_ATTENTE",
                        "employeId": 12,
                    }
                ],
                status_code=200,
            )
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
        return ToolResult.ok({"id": 51, "statut": "REFUSE", **(json or {})}, status_code=200)


def executor_with_backend(backend: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_document_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry)


@pytest.mark.asyncio
async def test_document_create_request_posts_verified_endpoint_without_user_id() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "document.create_request",
        {"document_type": "ATTESTATION_TRAVAIL", "reason": "besoin administratif"},
        context(),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls == [("POST", "/documents", {"type": "ATTESTATION_TRAVAIL", "motif": "besoin administratif"})]
    assert "utilisateurId" not in backend.calls[0][2]


@pytest.mark.asyncio
async def test_document_list_my_requests_returns_read_result() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("document.list_my_requests", {}, context())

    read_result = result.data["read_result"]
    assert result.success is True
    assert backend.calls[0][1] == "/documents/mes-demandes"
    assert read_result["kind"] == "read_result"
    assert read_result["count"] == 2
    assert "documentUrl" not in read_result["items"][1]
    assert read_result["items"][1]["hasDocument"] is True


@pytest.mark.asyncio
async def test_document_get_status_filters_accessible_documents() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("document.get_status", {"request_id": 41}, context())

    assert result.success is True
    assert backend.calls[0][1] == "/documents/mes-demandes"
    assert result.data["read_result"]["data"]["id"] == 41
    assert "en attente" in result.data["read_result"]["summary"]


@pytest.mark.asyncio
async def test_document_open_returns_safe_download_path_without_raw_storage_path() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("document.open", {"request_id": 42}, context())

    read_result = result.data["read_result"]
    assert result.success is True
    assert read_result["data"]["downloadApiPath"] == "/api/v1/documents/42/telecharger"
    serialized = str(read_result)
    assert "documentUrl" not in serialized
    assert "C:/unsafe" not in serialized


@pytest.mark.asyncio
async def test_document_open_uses_rh_file_endpoint_for_rh_context() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("document.open", {"request_id": 51}, context("RH"))

    assert result.success is True
    assert backend.calls[0][1] == "/documents/rh/demandes"
    assert result.data["read_result"]["data"].get("downloadApiPath") is None
    assert "pas encore pret" in result.data["read_result"]["summary"]


@pytest.mark.asyncio
async def test_rh_document_workload_uses_rh_document_read_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("document.rh_workload", {}, context("RH"))

    read_result = result.data["read_result"]
    assert result.success is True
    assert backend.calls[0][1] == "/documents/rh/demandes"
    assert read_result["toolName"] == "document.rh_workload"
    assert read_result["count"] == 1
    assert read_result["data"]["pendingCount"] == 1
    assert "1 demande(s)" in read_result["summary"]


@pytest.mark.asyncio
async def test_employee_cannot_execute_rh_document_workload() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("document.rh_workload", {}, context("EMPLOYEE"))

    assert result.success is False
    assert result.error_code == "role_not_allowed"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_rh_document_workload_does_not_invent_counts_for_empty_backend_data() -> None:
    backend = FakeBackendClient()

    async def empty_get(path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        backend.calls.append(("GET", path, params))
        return ToolResult.ok([], status_code=200)

    backend.get = empty_get  # type: ignore[method-assign]
    result = await executor_with_backend(backend).execute("document.rh_workload", {}, context("RH"))

    read_result = result.data["read_result"]
    assert result.success is True
    assert read_result["count"] == 0
    assert read_result["data"]["pendingCount"] == 0
    assert read_result["items"] == []
    assert read_result["summary"] == "Aucune demande de document RH en cours."


@pytest.mark.asyncio
async def test_document_create_request_requires_employee_role() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "document.create_request",
        {"document_type": "ATTESTATION_TRAVAIL"},
        context("RH"),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "role_not_allowed"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_employee_cannot_execute_rh_document_generation() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "document.rh_generate",
        {
            "type": "ATTESTATION_TRAVAIL",
            "label": "Attestation de travail",
            "employe_nom": "Doe",
            "employe_prenom": "Jane",
        },
        context("EMPLOYEE"),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "role_not_allowed"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_rh_document_generation_requires_confirmation() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "document.rh_generate",
        {
            "type": "ATTESTATION_TRAVAIL",
            "label": "Attestation de travail",
            "employe_nom": "Doe",
            "employe_prenom": "Jane",
        },
        context("RH"),
    )

    assert result.success is False
    assert result.error_code == "confirmation_required"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_backend_unavailable_returns_clean_user_facing_message() -> None:
    backend = FakeBackendClient(fail=ToolResult.fail("backend_unreachable", "connect ECONNREFUSED", status_code=503))
    result = await executor_with_backend(backend).execute("document.list_my_requests", {}, context())

    assert result.success is False
    assert "momentanement indisponible" in result.data["read_result"]["summary"]
    assert "ECONNREFUSED" not in result.data["read_result"]["summary"]


@pytest.mark.asyncio
async def test_duplicate_backend_conflict_returns_friendly_message() -> None:
    backend = FakeBackendClient()

    async def conflict_post(*args: Any, **kwargs: Any) -> ToolResult:
        backend.calls.append(("POST", args[0], kwargs.get("json")))
        return ToolResult.fail("http_409", "Une demande de ce type est deja en cours", status_code=409)

    backend.post = conflict_post  # type: ignore[method-assign]
    result = await executor_with_backend(backend).execute(
        "document.create_request",
        {"document_type": "ATTESTATION_TRAVAIL"},
        context(),
        confirmed=True,
    )

    assert result.success is False
    assert "deja en cours" in result.error_message
