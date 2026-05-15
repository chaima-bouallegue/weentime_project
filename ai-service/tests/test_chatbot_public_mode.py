"""Tests for the CHATBOT_PUBLIC_MODE demo flag.

Verifies that the AI chatbot endpoints (/v2/chat, /v2/chat/confirm, /v2/voice)
fall back to an anonymous CurrentUserContext when no Authorization header is
present and the flag is enabled, while keeping the same endpoints fully
JWT-protected when the flag is off.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import main  # noqa: E402
from app.context.anonymous_context import (  # noqa: E402
    DEFAULT_ROLE,
    build_chatbot_context_from_metadata,
    resolve_anonymous_role,
)
from app.context.context_builder import ContextBuilder  # noqa: E402
from app.tools.result import ToolResult  # noqa: E402
from config import get_settings  # noqa: E402
from jwt_test_utils import TEST_JWT_SECRET  # noqa: E402


@pytest.fixture(autouse=True)
def restore_public_mode_env():
    original = os.environ.get("CHATBOT_PUBLIC_MODE")
    yield
    if original is None:
        os.environ.pop("CHATBOT_PUBLIC_MODE", None)
    else:
        os.environ["CHATBOT_PUBLIC_MODE"] = original
    get_settings.cache_clear()
    get_settings()


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": context.role or "EMPLOYEE", "entrepriseId": context.entreprise_id or 1})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.ok({})


def _prepare_state(client: TestClient, *, public_mode: bool) -> None:
    get_settings.cache_clear()
    os.environ["CHATBOT_PUBLIC_MODE"] = "true" if public_mode else "false"
    settings = get_settings()
    settings.chatbot_public_mode = public_mode
    client.app.state.settings = settings
    client.app.state.copilot_ready = False
    client.app.state.copilot_backend_client = FakeBackendClient()
    client.app.state.copilot_context_builder = ContextBuilder(FakeBackendClient(), jwt_secret=TEST_JWT_SECRET)
    for attr in (
        "copilot_tool_registry",
        "copilot_tool_executor",
        "copilot_confirmation_store",
        "copilot_router_agent",
        "copilot_attendance_agent",
    ):
        if hasattr(client.app.state, attr):
            delattr(client.app.state, attr)


def test_resolve_anonymous_role_defaults_employee() -> None:
    assert resolve_anonymous_role(None) == DEFAULT_ROLE
    assert resolve_anonymous_role("") == DEFAULT_ROLE
    assert resolve_anonymous_role("not-a-role") == DEFAULT_ROLE


def test_resolve_anonymous_role_normalizes_known_roles() -> None:
    assert resolve_anonymous_role("admin") == "ADMIN"
    assert resolve_anonymous_role("ROLE_RH") == "RH"
    assert resolve_anonymous_role("Manager") == "MANAGER"
    assert resolve_anonymous_role("EMPLOYEE") == "EMPLOYEE"


def test_build_chatbot_context_uses_metadata_values() -> None:
    context = build_chatbot_context_from_metadata(
        {"role": "ADMIN", "userId": 42, "entrepriseId": 7, "language": "en"}
    )
    assert context.role == "ADMIN"
    assert context.user_id == 42
    assert context.entreprise_id == 7
    assert context.language == "en"
    assert context.is_verified is True
    assert context.metadata.get("anonymous_chatbot") is True
    assert context.metadata.get("source") == "anonymous_chatbot_demo"


def test_build_chatbot_context_falls_back_when_metadata_missing() -> None:
    context = build_chatbot_context_from_metadata(None)
    assert context.role == "EMPLOYEE"
    assert context.user_id == 1
    assert context.entreprise_id == 1
    assert context.language == "fr"
    assert context.is_verified is True


def test_build_chatbot_context_invalid_role_falls_back() -> None:
    context = build_chatbot_context_from_metadata({"role": "DEVELOPER"})
    assert context.role == "EMPLOYEE"


def test_chat_v2_without_jwt_fails_when_public_mode_disabled() -> None:
    with TestClient(main.app) as client:
        _prepare_state(client, public_mode=False)
        response = client.post(
            "/v2/chat",
            json={"message": "bonjour", "user_id": 1, "metadata": {"role": "EMPLOYEE"}},
        )
    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "missing_jwt"


def test_chat_v2_without_jwt_succeeds_when_public_mode_enabled() -> None:
    with TestClient(main.app) as client:
        _prepare_state(client, public_mode=True)
        response = client.post(
            "/v2/chat",
            json={
                "message": "bonjour",
                "user_id": 1,
                "metadata": {
                    "channel": "chat",
                    "role": "EMPLOYEE",
                    "userId": 1,
                    "entrepriseId": 1,
                    "language": "fr",
                },
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["request_id"]


def test_chat_v2_public_mode_admin_metadata_creates_admin_context() -> None:
    with TestClient(main.app) as client:
        _prepare_state(client, public_mode=True)
        with patch("app.api.chat_v2.process_copilot_message") as mocked:
            async def _fake(*_args, **kwargs):
                ctx = kwargs.get("context")
                assert ctx is not None
                assert ctx.role == "ADMIN"
                from app.models.agent_models import AgentResponse
                return AgentResponse(type="answer", text="ok", intent="health.check", confidence=1.0)

            mocked.side_effect = _fake
            response = client.post(
                "/v2/chat",
                json={
                    "message": "system health",
                    "user_id": 1,
                    "metadata": {
                        "channel": "chat",
                        "role": "ADMIN",
                        "userId": 1,
                        "entrepriseId": 1,
                        "language": "fr",
                    },
                },
            )
    assert response.status_code == 200


def test_chat_v2_public_mode_invalid_role_defaults_employee() -> None:
    with TestClient(main.app) as client:
        _prepare_state(client, public_mode=True)
        with patch("app.api.chat_v2.process_copilot_message") as mocked:
            captured = {}

            async def _fake(*_args, **kwargs):
                ctx = kwargs.get("context")
                captured["role"] = ctx.role if ctx else None
                from app.models.agent_models import AgentResponse
                return AgentResponse(type="answer", text="ok", intent="chat.greeting", confidence=1.0)

            mocked.side_effect = _fake
            response = client.post(
                "/v2/chat",
                json={
                    "message": "bonjour",
                    "user_id": 1,
                    "metadata": {"role": "developer", "userId": 1, "entrepriseId": 1},
                },
            )
    assert response.status_code == 200
    assert captured["role"] == "EMPLOYEE"


def test_confirm_without_jwt_fails_when_public_mode_disabled() -> None:
    with TestClient(main.app) as client:
        _prepare_state(client, public_mode=False)
        response = client.post(
            "/v2/chat/confirm",
            json={"confirmation_id": "cf-1", "approved": True},
        )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "missing_jwt"


def test_chat_history_endpoint_is_public_to_chatbot() -> None:
    """chat_history is documented as public-only-when-public-mode usage; the
    FastAPI endpoint itself does not require auth (the gateway gate is what
    blocks it in normal mode)."""
    with TestClient(main.app) as client:
        _prepare_state(client, public_mode=True)
        response = client.get("/chat/history/1")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "items" in body
