"""POST /v2/chat/reset clears the pending slot-fill flow + the per-user
confirmation queue + the last-error breadcrumb for a chatbot session.

Why this exists: a slot-fill ask response (e.g. "Pour quelle date ...")
parks a PendingConversationFlow in the orchestrator's
ConversationStateStore. If the user closes the tab and reopens it later,
the next message they type gets eaten by that still-pending flow before
the router has a chance to re-interpret it. The chat widget now ships a
"Effacer la conversation" button that calls this endpoint to drop that
state cleanly without forcing the user to type "annuler".
"""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

import main
from app.api import chat_v2 as chat_v2_module
from app.context.context_builder import ContextBuilder
from app.context.current_user import CurrentUserContext
from app.core.conversation_state import ConversationStateStore, PendingConversationFlow
from app.tools.result import ToolResult
from app.workflows.session_state import SessionState
from jwt_test_utils import TEST_JWT_SECRET


class _FakeBackend:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": context.role, "entrepriseId": context.entreprise_id or 1})
        return ToolResult.ok({})

    async def post(self, *args, **kwargs):
        return ToolResult.ok({})


def _prepare_public_mode(client: TestClient, monkeypatch) -> None:
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
        "copilot_conversation_store",
        "copilot_session_store",
    ):
        if hasattr(client.app.state, attr):
            delattr(client.app.state, attr)


def _public_payload(message: str = "", session_id: str = "session-1") -> dict:
    return {
        "message": message,
        "user_id": 7,
        "session_id": session_id,
        "metadata": {"role": "EMPLOYEE", "userId": 7, "entrepriseId": 3, "channel": "chat", "language": "fr"},
    }


def test_reset_session_helper_drops_flow_and_last_error() -> None:
    store = ConversationStateStore()
    ctx = CurrentUserContext(user_id=1, role="EMPLOYEE", entreprise_id=1, metadata={"chatbot_public_context": True})
    store.save(ctx, PendingConversationFlow(intent="leave.create", agent="leave"))
    store.record_last_error(ctx, "something broke")

    result = store.reset_session(ctx)
    assert result == {"flow": True, "lastError": True}
    assert store.get(ctx) is None
    assert store.get_last_error(ctx) is None


def test_reset_session_returns_false_flags_when_nothing_was_pending() -> None:
    store = ConversationStateStore()
    ctx = CurrentUserContext(user_id=1, role="EMPLOYEE", entreprise_id=1, metadata={"chatbot_public_context": True})
    assert store.reset_session(ctx) == {"flow": False, "lastError": False}


def test_reset_endpoint_clears_pending_flow_in_public_mode(monkeypatch) -> None:
    with TestClient(main.app) as client:
        _prepare_public_mode(client, monkeypatch)
        # Stand a pending flow in the orchestrator's store. We reach in via the
        # services dict the endpoint will look at.
        from app.core.copilot_engine import ensure_copilot_services
        services = ensure_copilot_services(client.app.state)
        ctx = CurrentUserContext(user_id=7, role="EMPLOYEE", entreprise_id=3, metadata={"chatbot_public_context": True})
        services["conversation_store"].save(ctx, PendingConversationFlow(intent="leave.create", agent="leave"), session_id="session-1")
        services["conversation_store"].record_last_error(ctx, "stuck", session_id="session-1")

        response = client.post("/v2/chat/reset", json=_public_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["cleared"] == {"flow": True, "lastError": True}


def test_reset_endpoint_clears_persisted_session_flow_in_public_mode(monkeypatch) -> None:
    with TestClient(main.app) as client:
        _prepare_public_mode(client, monkeypatch)
        from app.core.copilot_engine import ensure_copilot_services
        services = ensure_copilot_services(client.app.state)
        ctx = CurrentUserContext(
            user_id=7,
            role="EMPLOYEE",
            entreprise_id=3,
            language="fr",
            metadata={"chatbot_public_context": True, "channel": "chat"},
        )
        session = SessionState.from_context(
            request_id="req-reset",
            session_id="session-1",
            context=ctx,
            channel="chat",
            language="fr",
        )
        session.intent = "leave.create"

        asyncio.run(services["session_store"].save(session))
        response = client.post("/v2/chat/reset", json=_public_payload())
        loaded = asyncio.run(
            services["session_store"].load(
                user_id=7,
                tenant_id=3,
                channel="chat",
                session_id="session-1",
                role="EMPLOYEE",
            )
        )

    assert response.status_code == 200
    assert loaded is None


def test_reset_endpoint_no_op_returns_false_flags(monkeypatch) -> None:
    with TestClient(main.app) as client:
        _prepare_public_mode(client, monkeypatch)
        response = client.post("/v2/chat/reset", json=_public_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["cleared"] == {"flow": False, "lastError": False}


def test_reset_endpoint_without_jwt_and_without_public_mode_is_401(monkeypatch) -> None:
    # Public mode off + no Authorization header → must refuse, not silently
    # clear nothing for an anonymous caller.
    monkeypatch.setattr(chat_v2_module, "_public_chatbot_mode_enabled", lambda: False)
    with TestClient(main.app) as client:
        response = client.post("/v2/chat/reset", json=_public_payload())

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "missing_jwt"
