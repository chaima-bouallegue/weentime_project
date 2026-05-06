from __future__ import annotations

import base64
import json
import pytest

from app.context.context_builder import ContextBuilder, ContextError
from app.tools.result import ToolResult


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        return ToolResult.ok({
            "id": context.user_id,
            "email": "employee@weentime.com",
            "role": "EMPLOYEE",
            "entrepriseId": 7,
        })


def make_token(claims: dict) -> str:
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode("utf-8")).decode("ascii").rstrip("=")
    return f"header.{payload}.signature"


@pytest.mark.asyncio
async def test_context_builder_rejects_user_id_mismatch() -> None:
    builder = ContextBuilder(FakeBackendClient())
    token = make_token({"userId": 10, "role": "EMPLOYEE", "entrepriseId": 7})

    with pytest.raises(ContextError) as exc_info:
        await builder.build(f"Bearer {token}", payload_user_id=11)

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "user_context_mismatch"


@pytest.mark.asyncio
async def test_context_builder_requires_jwt() -> None:
    builder = ContextBuilder(FakeBackendClient())

    with pytest.raises(ContextError) as exc_info:
        await builder.build(None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.code == "missing_jwt"


@pytest.mark.asyncio
async def test_context_builder_builds_from_jwt_and_backend_profile() -> None:
    builder = ContextBuilder(FakeBackendClient())
    token = make_token({"userId": 10, "role": "ROLE_MANAGER", "entrepriseId": 3})

    context = await builder.build(f"Bearer {token}", payload_user_id=10)

    assert context.user_id == 10
    assert context.role == "EMPLOYEE"
    assert context.entreprise_id == 7
    assert context.email == "employee@weentime.com"
