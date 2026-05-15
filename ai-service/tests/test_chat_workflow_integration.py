from __future__ import annotations

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import main
from app.context.context_builder import ContextBuilder
from app.core.copilot_engine import ensure_copilot_services
from app.tools.result import ToolResult
from jwt_test_utils import TEST_JWT_SECRET, make_token


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": "EMPLOYEE", "entrepriseId": 9})
        if path == "/presence/me/today":
            return ToolResult.ok({"status": "ACTIVE", "checkIn": "09:00"})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        raise AssertionError("write backend should not be called before confirmation")


def prepare_workflow_state(client: TestClient) -> None:
    client.app.state.copilot_ready = False
    client.app.state.copilot_backend_client = FakeBackendClient()
    client.app.state.copilot_context_builder = ContextBuilder(FakeBackendClient(), jwt_secret=TEST_JWT_SECRET)


def test_chat_read_workflow_returns_authoritative_response() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        prepare_workflow_state(client)
        response = client.post(
            "/v2/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "Est-ce que je suis pointe ?", "user_id": 12},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["intent"] == "attendance.status"


def test_chat_write_workflow_creates_confirmation() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        prepare_workflow_state(client)
        response = client.post(
            "/v2/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "pointer mon entree", "user_id": 12},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["type"] == "confirm_action"
    assert body["data"]["requiresConfirmation"] is True
    assert body["data"]["confirmationId"]


def test_confirmed_workflow_executes_tool() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        prepare_workflow_state(client)
        first = client.post(
            "/v2/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "pointer mon entree", "user_id": 12},
        )
        confirmation_id = first.json()["data"]["confirmationId"]
        services = ensure_copilot_services(client.app.state)
        services["executor"].execute = AsyncMock(return_value=ToolResult.ok({"id": 1}, status_code=201))

        response = client.post(
            "/v2/chat/confirm",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmation_id": confirmation_id, "approved": True},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["type"] == "execute_action"
    assert body["data"]["text"] == "Pointage d'entree confirme."
    assert services["executor"].execute.await_count == 1
