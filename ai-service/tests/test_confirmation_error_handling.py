from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

import main
from app.context.context_builder import ContextBuilder
from app.context.current_user import CurrentUserContext
from app.core.copilot_engine import ensure_copilot_services
from app.tools.result import ToolResult
from jwt_test_utils import TEST_JWT_SECRET, make_token


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": "EMPLOYEE", "entrepriseId": 9}, status_code=200)
        return ToolResult.ok({}, status_code=200)

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.fail("not_found", "Not found", status_code=404)


def reset_state(client: TestClient) -> None:
    state = client.app.state
    for name in list(vars(state).get("_state", {}).keys()):
        if name.startswith("copilot_"):
            delattr(state, name)
    state.copilot_ready = False
    state.copilot_backend_client = FakeBackendClient()
    state.copilot_context_builder = ContextBuilder(FakeBackendClient(), jwt_secret=TEST_JWT_SECRET)
    state.settings = SimpleNamespace(backend_timeout_seconds=1, backend_base_url="http://localhost:8222/api/v1")


def test_missing_confirmation_returns_controlled_envelope_not_http_404() -> None:
    auth = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        reset_state(client)
        response = client.post(
            "/v2/chat/confirm",
            headers={"Authorization": f"Bearer {auth}"},
            json={"confirmation_id": "missing", "approved": True},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is False
    assert body["data"]["text"] == "Confirmation introuvable ou expiree."


def test_duplicate_confirmation_returns_already_treated_message() -> None:
    auth = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        reset_state(client)
        services = ensure_copilot_services(client.app.state)
        context = CurrentUserContext(user_id=12, role="EMPLOYEE", entreprise_id=9, token="token")
        record = services["confirmation_store"].create(context, "leave.create_request", {"start_date": "2026-05-08"})
        services["confirmation_store"].consume(record.confirmation_id)

        response = client.post(
            "/v2/chat/confirm",
            headers={"Authorization": f"Bearer {auth}"},
            json={"confirmation_id": record.confirmation_id, "approved": True},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["text"] == "Cette action a deja ete traitee."


def test_confirm_backend_404_returns_clean_response_payload() -> None:
    auth = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
    with TestClient(main.app) as client:
        reset_state(client)
        services = ensure_copilot_services(client.app.state)
        context = CurrentUserContext(user_id=12, role="EMPLOYEE", entreprise_id=9, token="token")
        record = services["confirmation_store"].create(
            context,
            "authorization.create_request",
            {
                "request_date": "2026-05-08",
                "time_start": "10:00:00",
                "time_end": "11:00:00",
                "authorization_type": "AUTRE",
                "reason": "test",
            },
        )

        response = client.post(
            "/v2/chat/confirm",
            headers={"Authorization": f"Bearer {auth}"},
            json={"confirmation_id": record.confirmation_id, "approved": True},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["type"] == "error"
    assert "indisponible" in body["data"]["text"] or "introuvable" in body["data"]["text"]
