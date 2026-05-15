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


def test_chat_continue_replays_pending_confirmation() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        prepare_workflow_state(client)
        first = client.post(
            "/v2/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "pointer mon entree", "user_id": 12, "session_id": "sess-confirm"},
        )
        confirmation_id = first.json()["data"]["confirmationId"]

        response = client.post(
            "/v2/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "continue", "user_id": 12, "session_id": "sess-confirm"},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["type"] == "confirm_action"
    assert body["data"]["confirmationId"] == confirmation_id


def test_chat_approval_message_executes_recovered_confirmation() -> None:
    token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        prepare_workflow_state(client)
        first = client.post(
            "/v2/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "pointer mon entree", "user_id": 12, "session_id": "sess-approve"},
        )
        confirmation_id = first.json()["data"]["confirmationId"]
        services = ensure_copilot_services(client.app.state)
        services["executor"].execute = AsyncMock(return_value=ToolResult.ok({"id": 1}, status_code=201))

        response = client.post(
            "/v2/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": "approve", "user_id": 12, "session_id": "sess-approve"},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["type"] == "execute_action"
    assert body["data"]["confirmationId"] == confirmation_id
    assert services["executor"].execute.await_count == 1
