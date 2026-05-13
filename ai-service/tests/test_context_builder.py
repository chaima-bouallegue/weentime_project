from __future__ import annotations

import pytest

from app.context.context_builder import ContextBuilder, ContextError
from app.tools.result import ToolResult
from jwt_test_utils import TEST_JWT_SECRET, make_token, make_unsigned_token


class FakeBackendClient:
    def __init__(self, profile: dict | None = None, *, success: bool = True) -> None:
        self.profile = profile
        self.success = success

    async def get(self, path, *, context, params=None):
        if not self.success:
            return ToolResult.fail("backend_unavailable", "Backend unavailable", status_code=503)
        return ToolResult.ok(
            self.profile
            or {
                "id": context.user_id,
                "email": "employee@weentime.com",
                "role": "EMPLOYEE",
                "entrepriseId": 7,
            }
        )


def builder(profile: dict | None = None, *, success: bool = True) -> ContextBuilder:
    return ContextBuilder(FakeBackendClient(profile, success=success), jwt_secret=TEST_JWT_SECRET)


@pytest.mark.asyncio
async def test_context_builder_rejects_user_id_mismatch() -> None:
    token = make_token({"userId": 10, "role": "EMPLOYEE", "entrepriseId": 7})

    with pytest.raises(ContextError) as exc_info:
        await builder().build(f"Bearer {token}", payload_user_id=11)

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "user_context_mismatch"


@pytest.mark.asyncio
async def test_context_builder_requires_jwt() -> None:
    with pytest.raises(ContextError) as exc_info:
        await builder().build(None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.code == "missing_jwt"


@pytest.mark.asyncio
async def test_context_builder_builds_from_verified_jwt_and_backend_profile() -> None:
    token = make_token({"userId": 10, "role": "ROLE_EMPLOYEE", "entrepriseId": 7})

    context = await builder().build(f"Bearer {token}", payload_user_id=10)

    assert context.user_id == 10
    assert context.role == "EMPLOYEE"
    assert context.entreprise_id == 7
    assert context.email == "employee@weentime.com"
    assert context.metadata["jwt_verified"] is True


@pytest.mark.asyncio
async def test_context_builder_rejects_invalid_signature() -> None:
    token = make_token({"userId": 10, "role": "EMPLOYEE", "entrepriseId": 7}, secret="wrong-secret")

    with pytest.raises(ContextError) as exc_info:
        await builder().build(f"Bearer {token}")

    assert exc_info.value.status_code == 401
    assert exc_info.value.code == "invalid_jwt_signature"


@pytest.mark.asyncio
async def test_context_builder_rejects_unsigned_token_in_strict_mode() -> None:
    token = make_unsigned_token({"userId": 10, "role": "EMPLOYEE", "entrepriseId": 7})

    with pytest.raises(ContextError) as exc_info:
        await builder().build(f"Bearer {token}")

    assert exc_info.value.status_code == 401
    assert exc_info.value.code == "invalid_jwt_signature"


@pytest.mark.asyncio
async def test_context_builder_rejects_backend_profile_user_mismatch() -> None:
    token = make_token({"userId": 10, "role": "EMPLOYEE", "entrepriseId": 7})

    with pytest.raises(ContextError) as exc_info:
        await builder({"id": 99, "role": "EMPLOYEE", "entrepriseId": 7}).build(f"Bearer {token}")

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "user_context_mismatch"


@pytest.mark.asyncio
async def test_context_builder_rejects_backend_role_mismatch() -> None:
    token = make_token({"userId": 10, "role": "MANAGER", "entrepriseId": 7})

    with pytest.raises(ContextError) as exc_info:
        await builder({"id": 10, "role": "EMPLOYEE", "entrepriseId": 7}).build(f"Bearer {token}")

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "role_context_mismatch"


@pytest.mark.asyncio
async def test_context_builder_rejects_backend_tenant_mismatch() -> None:
    token = make_token({"userId": 10, "role": "EMPLOYEE", "entrepriseId": 7})

    with pytest.raises(ContextError) as exc_info:
        await builder({"id": 10, "role": "EMPLOYEE", "entrepriseId": 8}).build(f"Bearer {token}")

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "tenant_context_mismatch"


@pytest.mark.asyncio
async def test_context_builder_accepts_backend_canonical_single_role_for_multi_role_token() -> None:
    token = make_token({"userId": 10, "roles": ["ROLE_EMPLOYEE", "ROLE_MANAGER"], "entrepriseId": 7})

    context = await builder({"id": 10, "role": "EMPLOYEE", "entrepriseId": 7}).build(f"Bearer {token}")

    assert context.role == "EMPLOYEE"


@pytest.mark.asyncio
async def test_context_builder_rejects_multi_role_token_without_backend_canonical_role() -> None:
    token = make_token({"userId": 10, "roles": ["ROLE_EMPLOYEE", "ROLE_MANAGER"], "entrepriseId": 7})

    with pytest.raises(ContextError) as exc_info:
        await ContextBuilder(None, jwt_secret=TEST_JWT_SECRET).build(f"Bearer {token}")

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "invalid_role_state"


@pytest.mark.asyncio
async def test_context_builder_accepts_tenantless_admin() -> None:
    token = make_token({"userId": 1, "role": "ADMIN"})

    context = await builder({"id": 1, "role": "ADMIN"}).build(f"Bearer {token}")

    assert context.role == "ADMIN"
    assert context.entreprise_id is None


@pytest.mark.asyncio
async def test_context_builder_rejects_non_admin_without_tenant() -> None:
    token = make_token({"userId": 10, "role": "EMPLOYEE"})

    with pytest.raises(ContextError) as exc_info:
        await builder({"id": 10, "role": "EMPLOYEE"}).build(f"Bearer {token}")

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "missing_tenant"

