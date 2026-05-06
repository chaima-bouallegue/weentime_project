from __future__ import annotations

import base64
import json
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import main
from app.context.current_user import CurrentUserContext
from app.core.copilot_engine import ensure_copilot_services
from app.tools.result import ToolResult


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": "EMPLOYEE", "entrepriseId": 9})
        if path == "/presence/me/today":
            return ToolResult.ok({"status": "ACTIVE", "checkIn": "09:00"})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.ok({"status": "ACTIVE"})


def make_token(claims: dict) -> str:
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode("utf-8")).decode("ascii").rstrip("=")
    return f"header.{payload}.signature"


def prepare_v2_state(client: TestClient) -> None:
    client.app.state.ai_v2_ready = False
    client.app.state.ai_v2_backend_client = FakeBackendClient()
    for attr in ("ai_v2_context_builder", "ai_v2_tool_registry", "ai_v2_tool_executor", "ai_v2_confirmation_store", "ai_v2_router_agent", "ai_v2_attendance_agent"):
        if hasattr(client.app.state, attr):
            delattr(client.app.state, attr)


def test_chat_v2_requires_jwt() -> None:
    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post("/v2/chat", json={"message": "Est-ce que je suis pointe ?", "user_id": 12})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "missing_jwt"


def test_chat_v2_attendance_status_works() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "Est-ce que je suis pointe ?", "user_id": 12},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["intent"] == "attendance.status"


def test_chat_v2_rejects_payload_user_mismatch() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "Est-ce que je suis pointe ?", "user_id": 99},
        )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "user_context_mismatch"


def test_chat_v2_confirm_known_already_exists_returns_success() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        prepare_v2_state(client)
        services = ensure_copilot_services(client.app.state)
        context = CurrentUserContext(user_id=12, role="EMPLOYEE", entreprise_id=9, token="token")
        record = services["confirmation_store"].create(
            context,
            "legacy.create_leave_request",
            {"payload": {"start_date": "2026-05-06", "end_date": "2026-05-06"}},
        )
        services["executor"].execute = AsyncMock(
            return_value=ToolResult.fail(
                "already_exists",
                "Une demande existe deja sur cette periode.",
                status_code=409,
            )
        )

        response = client.post(
            "/v2/chat/confirm",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmation_id": record.confirmation_id, "approved": True},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["type"] == "answer"
    assert body["data"]["text"] == "Une demande existe déjà sur cette période."
