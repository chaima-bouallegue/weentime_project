"""AI-FE-MASTER-CHATBOT-01 — public chatbot context (no JWT) coverage.

The chatbot endpoints (/v2/chat, /v2/chat/confirm, /v2/voice) accept requests
without a verified Authorization header when CHATBOT_PUBLIC_MODE=True. They
must:
  * Build a CurrentUserContext from request metadata (role/userId/entreprise).
  * Tag the context with chatbot_public_context=True, jwt_verified=False,
    role_verified_from_ui=True, source="chatbot_metadata".
  * Make CurrentUserContext.is_verified return True so ToolRegistry accepts
    role-permission-gated tool calls.
  * Fall back to EMPLOYEE / user 1 / entreprise 1 when metadata is missing
    or invalid.
  * Run the full RouterAgent pipeline — public mode MUST NOT short-circuit
    to a "demo placeholder" reply.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

import main
from app.api import chat_v2 as chat_v2_module
from app.context.anonymous_context import (
    DEFAULT_ENTREPRISE_ID,
    DEFAULT_ROLE,
    DEFAULT_USER_ID,
    build_chatbot_context_from_metadata,
)
from app.context.context_builder import ContextBuilder
from app.tools.result import ToolResult
from jwt_test_utils import TEST_JWT_SECRET


def test_metadata_builds_role_context_with_public_flags() -> None:
    context = build_chatbot_context_from_metadata(
        {"role": "RH", "userId": 42, "entrepriseId": 7, "language": "fr"}
    )
    assert context.role == "RH"
    assert context.user_id == 42
    assert context.entreprise_id == 7
    assert context.language == "fr"
    # Spec-mandated metadata flags — frontend and backend rely on these names.
    assert context.metadata["chatbot_public_context"] is True
    assert context.metadata["jwt_verified"] is False
    assert context.metadata["role_verified_from_ui"] is True
    assert context.metadata["source"] == "chatbot_metadata"
    assert context.metadata["chatbot_public_mode"] is True


def test_is_verified_true_for_chatbot_public_context() -> None:
    context = build_chatbot_context_from_metadata({"role": "EMPLOYEE", "userId": 5})
    # ToolRegistry.validate_access requires is_verified for tool calls; without
    # this the chatbot would 401 every tool. jwt_verified must remain False so
    # downstream code can tell the JWT was NOT actually parsed.
    assert context.is_verified is True
    assert context.metadata["jwt_verified"] is False


def test_invalid_role_falls_back_to_employee() -> None:
    context = build_chatbot_context_from_metadata({"role": "SUPERADMIN", "userId": 1})
    assert context.role == DEFAULT_ROLE == "EMPLOYEE"


def test_missing_metadata_uses_defaults() -> None:
    context = build_chatbot_context_from_metadata(None)
    assert context.role == DEFAULT_ROLE
    assert context.user_id == DEFAULT_USER_ID
    assert context.entreprise_id == DEFAULT_ENTREPRISE_ID


def test_role_aliases_accepted() -> None:
    for hint in ("ROLE_ADMIN", "admin", "Admin"):
        context = build_chatbot_context_from_metadata({"role": hint, "userId": 1})
        assert context.role == "ADMIN", hint


class _FakeBackend:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": context.role, "entrepriseId": context.entreprise_id or 1})
        if path == "/presence/me/today":
            return ToolResult.ok({"status": "ACTIVE", "checkIn": "09:00"})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.ok({"status": "ACTIVE"})


def _prepare_public_mode(client: TestClient, monkeypatch) -> None:
    # Force public mode on for the duration of the test; resetting copilot
    # state guarantees a fresh ToolExecutor sees the FakeBackend.
    monkeypatch.setattr(chat_v2_module, "_public_chatbot_mode_enabled", lambda: True)
    client.app.state.ai_v2_ready = False
    client.app.state.ai_v2_backend_client = _FakeBackend()
    client.app.state.copilot_ready = False
    client.app.state.copilot_backend_client = _FakeBackend()
    client.app.state.copilot_context_builder = ContextBuilder(_FakeBackend(), jwt_secret=TEST_JWT_SECRET)
    for attr in (
        "ai_v2_context_builder", "ai_v2_tool_registry", "ai_v2_tool_executor",
        "ai_v2_confirmation_store", "ai_v2_router_agent", "ai_v2_attendance_agent",
        "copilot_tool_registry", "copilot_tool_executor",
        "copilot_confirmation_store", "copilot_router_agent", "copilot_attendance_agent",
    ):
        if hasattr(client.app.state, attr):
            delattr(client.app.state, attr)


def test_chat_v2_without_jwt_returns_real_router_response(monkeypatch) -> None:
    # Regression: enabling public mode used to surface a frontend "Mode demo
    # public actif" placeholder because the backend 401'd. With the public
    # context wired through, the full RouterAgent must run and return a real
    # attendance.status response — no placeholder, no fallback.
    with TestClient(main.app) as client:
        _prepare_public_mode(client, monkeypatch)
        response = client.post(
            "/v2/chat",
            json={
                "message": "est ce que jai pointe ?",
                "user_id": 12,
                "metadata": {"role": "EMPLOYEE", "userId": 12, "entrepriseId": 9, "channel": "chat", "language": "fr"},
            },
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True

    data = body["data"]
    text = (data.get("text") or "").lower()
    # The placeholder text must never reach the user under public mode.
    assert "mode demo public" not in text
    assert "continuez votre conversation" not in text
    # Real router path must take over: attendance intent for this prompt.
    assert data.get("intent", "").startswith("attendance.")
    assert not data.get("intent", "").startswith("fallback.")


def test_chat_v2_without_jwt_greeting_returns_real_greeting(monkeypatch) -> None:
    with TestClient(main.app) as client:
        _prepare_public_mode(client, monkeypatch)
        response = client.post(
            "/v2/chat",
            json={
                "message": "bonjour",
                "user_id": 1,
                "metadata": {"role": "EMPLOYEE", "userId": 1, "entrepriseId": 1, "channel": "chat", "language": "fr"},
            },
        )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["intent"] == "system.greeting"
    text = (data.get("text") or "").lower()
    assert "mode demo" not in text
