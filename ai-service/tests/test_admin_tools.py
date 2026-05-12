from __future__ import annotations

import asyncio
from typing import Any

from app.context.current_user import CurrentUserContext
from app.tools.admin_tools import register_admin_tools
from app.tools.audit import ToolAuditLogger
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult


class FakeBackendClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None, dict[str, Any] | None]] = []
        self.responses: dict[tuple[str, str], ToolResult] = {}

    async def get(self, path, *, context, params=None):
        self.calls.append(("GET", path, params, None))
        return self.responses.get(("GET", path), self._default_get(path))

    async def post(self, path, *, context, json=None, headers=None):
        self.calls.append(("POST", path, None, json))
        return self.responses.get(("POST", path), ToolResult.ok({"id": 10}, status_code=201))

    async def request(self, method, path, *, context, params=None, json=None, headers=None):
        self.calls.append((method.upper(), path, params, json))
        return self.responses.get((method.upper(), path), ToolResult.ok({"id": 10}, status_code=200))

    @staticmethod
    def _default_get(path: str) -> ToolResult:
        if path == "/users":
            return ToolResult.ok({"content": [{"id": 1, "email": "a@ween.tn", "role": "ADMIN", "status": "ACTIVE", "company": {"id": 1}}], "totalElements": 1}, status_code=200)
        if path == "/organisations/entreprises":
            return ToolResult.ok({"content": [{"id": 1, "nom": "Acme", "estActive": True}], "totalElements": 1}, status_code=200)
        if path == "/organisations/users":
            return ToolResult.ok({"content": [{"id": 2, "email": "broken@ween.tn", "role": "", "roles": [], "statut": "ACTIF"}], "totalElements": 1}, status_code=200)
        if path == "/users/me":
            return ToolResult.ok({"id": 99, "role": "ADMIN"}, status_code=200)
        if path == "/organisations/users/7":
            return ToolResult.ok(
                {
                    "id": 7,
                    "nom": "User",
                    "prenom": "Test",
                    "email": "test@ween.tn",
                    "statut": "ACTIF",
                    "entrepriseId": 3,
                    "role": "EMPLOYEE",
                    "roles": [{"id": 4, "nom": "ROLE_EMPLOYEE"}],
                },
                status_code=200,
            )
        return ToolResult.fail("not_found", "missing", status_code=404)


def context(role: str = "ADMIN") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=1, token="token")


def executor_with_backend(backend: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_admin_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry, ToolAuditLogger())


def test_admin_list_users_returns_read_result() -> None:
    backend = FakeBackendClient()
    executor = executor_with_backend(backend)

    result = asyncio.run(executor.execute("admin.list_users", {}, context()))

    assert result.success is True
    assert result.data["read_result"]["kind"] == "read_result"
    assert result.data["read_result"]["count"] == 1
    assert backend.calls[0][0:2] == ("GET", "/users")


def test_admin_list_enterprises_returns_read_result() -> None:
    backend = FakeBackendClient()
    executor = executor_with_backend(backend)

    result = asyncio.run(executor.execute("admin.list_enterprises", {}, context()))

    assert result.success is True
    assert "entreprise" in result.data["read_result"]["summary"]
    assert backend.calls[0][0:2] == ("GET", "/organisations/entreprises")


def test_admin_misconfigured_users_computes_from_safe_read_endpoint() -> None:
    backend = FakeBackendClient()
    executor = executor_with_backend(backend)

    result = asyncio.run(executor.execute("admin.misconfigured_users", {}, context()))

    assert result.success is True
    read_result = result.data["read_result"]
    assert read_result["kind"] == "read_result"
    assert read_result["count"] == 1
    assert read_result["items"][0]["issues"]
    assert backend.calls[0][0:2] == ("GET", "/organisations/users")


def test_admin_create_user_requires_confirmation() -> None:
    executor = executor_with_backend(FakeBackendClient())

    result = asyncio.run(
        executor.execute(
            "admin.create_user",
            {
                "first_name": "Sarah",
                "last_name": "Ben",
                "email": "sarah@ween.tn",
                "password": "Password123",
                "role": "EMPLOYEE",
                "company_id": 1,
            },
            context(),
        )
    )

    assert result.success is False
    assert result.error_code == "confirmation_required"


def test_admin_update_role_requires_confirmation_and_preserves_single_role_payload() -> None:
    backend = FakeBackendClient()
    executor = executor_with_backend(backend)

    pending = asyncio.run(executor.execute("admin.update_user_role", {"user_id": 7, "role": "RH"}, context()))
    assert pending.error_code == "confirmation_required"

    result = asyncio.run(executor.execute("admin.update_user_role", {"user_id": 7, "role": "RH"}, context(), confirmed=True))

    assert result.success is True
    assert backend.calls[0][0:2] == ("GET", "/organisations/users/7")
    assert backend.calls[1][0:2] == ("PATCH", "/organisations/users/7")
    body = backend.calls[1][3]
    assert body["role"] == "RH"
    assert body["roleIds"] == []


def test_admin_assign_manager_requires_confirmation() -> None:
    executor = executor_with_backend(FakeBackendClient())

    result = asyncio.run(executor.execute("admin.assign_manager", {"user_id": 9, "manager_id": 3}, context()))

    assert result.success is False
    assert result.error_code == "confirmation_required"


def test_admin_assign_rh_owner_requires_confirmation() -> None:
    executor = executor_with_backend(FakeBackendClient())

    result = asyncio.run(executor.execute("admin.assign_rh_owner", {"rh_user_id": 4, "entreprise_id": 2}, context()))

    assert result.success is False
    assert result.error_code == "confirmation_required"


def test_non_admin_roles_cannot_use_admin_tools() -> None:
    executor = executor_with_backend(FakeBackendClient())

    for role in ("EMPLOYEE", "MANAGER", "RH"):
        result = asyncio.run(executor.execute("admin.list_users", {}, context(role)))
        assert result.success is False
        assert result.error_code == "forbidden_role"


def test_missing_backend_endpoint_returns_capability_style_unavailable() -> None:
    backend = FakeBackendClient()
    backend.responses[("GET", "/users/me")] = ToolResult.fail("not_found", "missing", status_code=404)
    executor = executor_with_backend(backend)

    result = asyncio.run(executor.execute("admin.system_health", {}, context()))

    assert result.success is False
    assert result.data["read_result"]["kind"] == "read_result"
    assert result.data["read_result"]["empty"] is True
