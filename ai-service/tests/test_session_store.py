from __future__ import annotations

import asyncio

from app.context.current_user import CurrentUserContext
from app.workflows.session_state import SessionState
from app.workflows.session_store import SessionStore


class FakeRedisClient:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.set_calls: list[tuple[str, str, int | None]] = []

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.values[key] = value
        self.set_calls.append((key, value, ex))
        return True

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def delete(self, key: str) -> int:
        self.values.pop(key, None)
        return 1


def verified_context() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role="EMPLOYEE",
        entreprise_id=9,
        token="token",
        language="fr",
        metadata={"jwt_verified": True},
    )


def role_context(role: str) -> CurrentUserContext:
    context = verified_context()
    context.role = role
    return context


def test_session_store_memory_round_trip() -> None:
    context = verified_context()
    store = SessionStore(redis_enabled=False, ttl_seconds=1200)
    session = SessionState.from_context(
        request_id="req-1",
        session_id="sess-1",
        context=context,
        channel="chat",
        language="fr",
    )
    session.intent = "attendance.status"
    session.selected_agent = "attendance"
    session.pending_confirmation = {"confirmation_id": "conf-1", "tool_name": "check_in"}
    session.last_safe_response = {"type": "answer", "text": "OK", "intent": "attendance.status", "confidence": 1.0}

    asyncio.run(store.save(session))
    loaded = asyncio.run(store.load(user_id=12, tenant_id=9, channel="chat", session_id="sess-1"))

    assert loaded is not None
    assert loaded.session_id == "sess-1"
    assert loaded.intent == "attendance.status"
    assert loaded.pending_confirmation["confirmation_id"] == "conf-1"


def test_session_store_separates_same_public_user_by_role() -> None:
    store = SessionStore(redis_enabled=False, ttl_seconds=1200)
    employee_session = SessionState.from_context(
        request_id="req-employee",
        session_id="shared",
        context=role_context("EMPLOYEE"),
        channel="chat",
        language="fr",
    )
    employee_session.intent = "telework.create"
    manager_session = SessionState.from_context(
        request_id="req-manager",
        session_id="shared",
        context=role_context("MANAGER"),
        channel="chat",
        language="fr",
    )
    manager_session.intent = "manager.pending_approvals"

    asyncio.run(store.save(employee_session))
    asyncio.run(store.save(manager_session))

    loaded_employee = asyncio.run(store.load(user_id=12, tenant_id=9, channel="chat", session_id="shared", role="EMPLOYEE"))
    loaded_manager = asyncio.run(store.load(user_id=12, tenant_id=9, channel="chat", session_id="shared", role="MANAGER"))

    assert loaded_employee is not None
    assert loaded_employee.intent == "telework.create"
    assert loaded_manager is not None
    assert loaded_manager.intent == "manager.pending_approvals"


def test_session_store_tracks_latest_and_confirmation_index_with_redis() -> None:
    context = verified_context()
    redis_client = FakeRedisClient()
    store = SessionStore(redis_enabled=True, redis_client=redis_client, ttl_seconds=1200)
    session = SessionState.from_context(
        request_id="req-2",
        session_id="sess-2",
        context=context,
        channel="voice",
        language="tn",
    )
    session.pending_confirmation = {"confirmation_id": "conf-voice", "tool_name": "check_out"}

    asyncio.run(store.save(session))
    latest = asyncio.run(store.load_latest_for_user(user_id=12, tenant_id=9, channel="voice"))
    by_confirmation = asyncio.run(
        store.load_by_confirmation(user_id=12, tenant_id=9, confirmation_id="conf-voice")
    )

    assert latest is not None
    assert latest.session_id == "sess-2"
    assert by_confirmation is not None
    assert by_confirmation.session_id == "sess-2"
    assert redis_client.set_calls
    assert all(call[2] == 1200 for call in redis_client.set_calls)
