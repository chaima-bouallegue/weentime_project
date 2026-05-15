from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.tools.executor import ToolExecutor
from app.tools.organisation_structure_tools import register_organisation_structure_tools
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult


def _context(role: str = "RH", *, tenant_id: int = 9) -> CurrentUserContext:
    return CurrentUserContext(user_id=42, role=role, entreprise_id=tenant_id, token="token")


class FakeBackendClient:
    def __init__(self, *, fail: ToolResult | None = None) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []
        self.fail = fail

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params))
        if self.fail is not None:
            return self.fail
        if path == "/organisations/equipes":
            return ToolResult.ok(
                {
                    "content": [
                        {"id": 1, "nom": "IA", "departementId": 3},
                        {"id": 2, "nom": "Frontend", "departementId": 3},
                    ],
                    "totalElements": 2,
                    "number": 0,
                    "size": 50,
                },
                status_code=200,
            )
        if path == "/organisations/departements":
            return ToolResult.ok(
                {
                    "content": [{"id": 3, "nom": "Tech", "codeInterne": "TECH"}],
                    "totalElements": 1,
                },
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
        if self.fail is not None:
            return self.fail
        if path == "/organisations/equipes":
            return ToolResult.ok({"id": 99, **(json or {})}, status_code=201)
        if path == "/organisations/departements":
            return ToolResult.ok({"id": 100, **(json or {})}, status_code=201)
        return ToolResult.fail("not_found", "Not found", status_code=404)

    async def request(self, *args: Any, **kwargs: Any) -> ToolResult:
        raise AssertionError("organisation_structure_tools should not use request() for these flows")


def _executor(backend: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_organisation_structure_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry)


@pytest.mark.asyncio
async def test_list_teams_hits_verified_endpoint_for_rh() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute("organisation.list_teams", {}, _context("RH"))

    assert result.success is True
    assert backend.calls == [("GET", "/organisations/equipes", {"page": 0, "size": 50})]
    read_result = result.data["read_result"]
    assert read_result["count"] == 2
    assert read_result["empty"] is False


@pytest.mark.asyncio
async def test_list_departments_hits_verified_endpoint_for_admin() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute("organisation.list_departments", {}, _context("ADMIN"))

    assert result.success is True
    assert backend.calls == [("GET", "/organisations/departements", {"page": 0, "size": 50})]


@pytest.mark.asyncio
async def test_create_team_requires_confirmation() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute(
        "organisation.create_team",
        {"nom": "IA-NLP", "departement_id": 3, "est_active": True},
        _context("RH"),
        confirmed=False,
    )

    # without confirmed=True, executor should not call backend
    assert backend.calls == []
    # the executor returns a non-success ToolResult (confirmation required) — exact
    # representation is owned by ToolExecutor; what matters here is no side effect.
    assert result.success is False or result.data is None or "write_result" not in (result.data or {})


@pytest.mark.asyncio
async def test_create_team_posts_to_verified_endpoint_with_camelcase_payload() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute(
        "organisation.create_team",
        {
            "nom": "IA-NLP",
            "departement_id": 3,
            "description": "Equipe NLP",
            "responsable_id": 17,
            "effectif_maximum": 8,
            "est_active": True,
        },
        _context("RH"),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls[0][0] == "POST"
    assert backend.calls[0][1] == "/organisations/equipes"
    body = backend.calls[0][2]
    assert body == {
        "nom": "IA-NLP",
        "departementId": 3,
        "description": "Equipe NLP",
        "responsableId": 17,
        "effectifMaximum": 8,
        "estActive": True,
    }


@pytest.mark.asyncio
async def test_create_team_strips_none_fields() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute(
        "organisation.create_team",
        {"nom": "IA", "departement_id": 3, "est_active": True},
        _context("RH"),
        confirmed=True,
    )

    assert result.success is True
    body = backend.calls[0][2]
    assert "responsableId" not in body
    assert "effectifMaximum" not in body
    assert "description" not in body


@pytest.mark.asyncio
async def test_create_department_uses_tenant_id_when_unspecified() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute(
        "organisation.create_department",
        {"nom": "Recherche", "code_interne": "RND"},
        _context("RH", tenant_id=9),
        confirmed=True,
    )

    assert result.success is True
    body = backend.calls[0][2]
    assert body["entrepriseId"] == 9
    assert body["codeInterne"] == "RND"


@pytest.mark.asyncio
async def test_create_department_validates_code_interne_charset() -> None:
    backend = FakeBackendClient()
    # lowercase letters and a space are invalid per backend regex
    result = await _executor(backend).execute(
        "organisation.create_department",
        {"nom": "Recherche", "code_interne": "rnd@bad"},
        _context("RH"),
        confirmed=True,
    )

    assert result.success is False
    assert backend.calls == []


@pytest.mark.asyncio
async def test_create_team_denied_for_employee_role() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute(
        "organisation.create_team",
        {"nom": "IA", "departement_id": 3, "est_active": True},
        _context("EMPLOYEE"),
        confirmed=True,
    )

    assert result.success is False
    assert backend.calls == []


@pytest.mark.asyncio
async def test_list_teams_denied_for_employee_role() -> None:
    backend = FakeBackendClient()
    result = await _executor(backend).execute("organisation.list_teams", {}, _context("EMPLOYEE"))
    assert result.success is False
    assert backend.calls == []
