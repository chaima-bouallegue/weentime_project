from __future__ import annotations

import importlib
import logging
from threading import RLock
from typing import Any

from app.observability.tracing import log_event

from .session_serializer import deserialize_session_state, serialize_session_state
from .session_state import SessionState

logger = logging.getLogger(__name__)


class SessionStore:
    def __init__(
        self,
        *,
        ttl_seconds: int = 1800,
        redis_enabled: bool = False,
        redis_url: str = "redis://localhost:6379",
        redis_client: Any | None = None,
    ) -> None:
        self.ttl_seconds = min(1800, max(900, int(ttl_seconds)))
        self.redis_enabled = bool(redis_enabled)
        self.redis_url = redis_url
        self._redis_client = redis_client
        self._memory_sessions: dict[str, SessionState] = {}
        self._memory_latest: dict[str, str] = {}
        self._memory_confirmations: dict[str, str] = {}
        self._lock = RLock()

    async def save(self, state: SessionState) -> SessionState:
        state.touch(self.ttl_seconds)
        role = _role_key(state.role)
        current_page = _page_key(state.current_page)
        conversation_id = _conversation_key(state.conversation_id, state.session_id)
        storage_key = self._session_key(
            state.user_id,
            state.tenant_id,
            state.channel,
            state.session_id,
            role=role,
            current_page=current_page,
            conversation_id=conversation_id,
        )
        legacy_storage_key = self._session_key(state.user_id, state.tenant_id, state.channel, state.session_id)
        latest_key = self._latest_key(
            state.user_id,
            state.tenant_id,
            state.channel,
            role=role,
            current_page=current_page,
            conversation_id=conversation_id,
        )
        legacy_latest_key = self._latest_key(state.user_id, state.tenant_id, state.channel)
        confirmation_key = self._confirmation_key(
            state.user_id,
            state.tenant_id,
            _pending_confirmation_id(state),
        )
        payload = serialize_session_state(state)

        with self._lock:
            self._memory_sessions[storage_key] = state
            self._memory_sessions[legacy_storage_key] = state
            self._memory_latest[latest_key] = storage_key
            self._memory_latest[legacy_latest_key] = storage_key
            if confirmation_key is not None:
                self._memory_confirmations[confirmation_key] = storage_key

        await self._write_redis(
            storage_key,
            payload,
            latest_key=latest_key,
            confirmation_key=confirmation_key,
            alias_storage_keys=[legacy_storage_key],
            alias_latest_keys=[legacy_latest_key],
        )
        return state

    async def load(
        self,
        *,
        user_id: int,
        tenant_id: int | None,
        channel: str,
        session_id: str,
        role: str | None = None,
        current_page: str | None = None,
        conversation_id: str | None = None,
    ) -> SessionState | None:
        for storage_key in self._candidate_session_keys(
            user_id,
            tenant_id,
            channel,
            session_id,
            role=role,
            current_page=current_page,
            conversation_id=conversation_id,
        ):
            state = await self._load_by_storage_key(storage_key)
            if state is not None:
                return state
        return None

    async def load_latest_for_user(
        self,
        *,
        user_id: int,
        tenant_id: int | None,
        channel: str,
        role: str | None = None,
        current_page: str | None = None,
        conversation_id: str | None = None,
    ) -> SessionState | None:
        for latest_key in self._candidate_latest_keys(
            user_id,
            tenant_id,
            channel,
            role=role,
            current_page=current_page,
            conversation_id=conversation_id,
        ):
            with self._lock:
                storage_key = self._memory_latest.get(latest_key)
            if storage_key:
                state = await self._load_by_storage_key(storage_key)
                if state is not None:
                    return state
        if not self._redis_available():
            return None
        try:
            client = await self._client()
            for latest_key in self._candidate_latest_keys(
                user_id,
                tenant_id,
                channel,
                role=role,
                current_page=current_page,
                conversation_id=conversation_id,
            ):
                storage_key = await client.get(latest_key)
                if not storage_key:
                    continue
                state = await self._load_by_storage_key(str(storage_key))
                if state is not None:
                    return state
            return None
        except Exception as exc:  # noqa: BLE001
            logger.warning("Workflow session latest lookup failed: %s", exc)
            return None

    async def load_by_confirmation(
        self,
        *,
        user_id: int,
        tenant_id: int | None,
        confirmation_id: str,
    ) -> SessionState | None:
        confirmation_key = self._confirmation_key(user_id, tenant_id, confirmation_id)
        if confirmation_key is None:
            return None
        with self._lock:
            storage_key = self._memory_confirmations.get(confirmation_key)
        if storage_key:
            state = await self._load_by_storage_key(storage_key)
            if _pending_confirmation_id(state) == confirmation_id:
                return state
        if not self._redis_available():
            return None
        try:
            client = await self._client()
            storage_key = await client.get(confirmation_key)
            if not storage_key:
                return None
            state = await self._load_by_storage_key(str(storage_key))
            if _pending_confirmation_id(state) == confirmation_id:
                return state
        except Exception as exc:  # noqa: BLE001
            logger.warning("Workflow session confirmation lookup failed: %s", exc)
        return None

    async def clear(
        self,
        *,
        user_id: int,
        tenant_id: int | None,
        channel: str,
        session_id: str,
        role: str | None = None,
        current_page: str | None = None,
        conversation_id: str | None = None,
    ) -> None:
        storage_keys = self._candidate_session_keys(
            user_id,
            tenant_id,
            channel,
            session_id,
            role=role,
            current_page=current_page,
            conversation_id=conversation_id,
        )
        latest_keys = self._candidate_latest_keys(
            user_id,
            tenant_id,
            channel,
            role=role,
            current_page=current_page,
            conversation_id=conversation_id,
        )
        with self._lock:
            for storage_key in storage_keys:
                self._memory_sessions.pop(storage_key, None)
            for latest_key in latest_keys:
                if self._memory_latest.get(latest_key) in storage_keys:
                    self._memory_latest.pop(latest_key, None)
        if not self._redis_available():
            return
        try:
            client = await self._client()
            for key in [*storage_keys, *latest_keys]:
                await client.delete(key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Workflow session delete failed: %s", exc)

    async def _load_by_storage_key(self, storage_key: str) -> SessionState | None:
        with self._lock:
            state = self._memory_sessions.get(storage_key)
        if state is not None:
            if state.is_expired():
                with self._lock:
                    self._memory_sessions.pop(storage_key, None)
                return None
            return state
        if not self._redis_available():
            return None
        try:
            client = await self._client()
            payload = await client.get(storage_key)
            state = deserialize_session_state(payload)
            if state is None or state.is_expired():
                return None
            with self._lock:
                self._memory_sessions[storage_key] = state
            return state
        except Exception as exc:  # noqa: BLE001
            logger.warning("Workflow session load failed: %s", exc)
            return None

    async def _write_redis(
        self,
        storage_key: str,
        payload: str,
        *,
        latest_key: str,
        confirmation_key: str | None,
        alias_storage_keys: list[str] | None = None,
        alias_latest_keys: list[str] | None = None,
    ) -> None:
        if not self._redis_available():
            return
        try:
            client = await self._client()
            await client.set(storage_key, payload, ex=self.ttl_seconds)
            for alias_key in alias_storage_keys or []:
                await client.set(alias_key, payload, ex=self.ttl_seconds)
            await client.set(latest_key, storage_key, ex=self.ttl_seconds)
            for alias_key in alias_latest_keys or []:
                await client.set(alias_key, storage_key, ex=self.ttl_seconds)
            if confirmation_key is not None:
                await client.set(confirmation_key, storage_key, ex=self.ttl_seconds)
            log_event(
                "workflow.session.saved",
                metadata={"storage": "redis", "session_key": storage_key, "confirmation_bound": bool(confirmation_key)},
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Workflow session redis save failed: %s", exc)

    async def _client(self) -> Any:
        if self._redis_client is not None:
            return self._redis_client
        redis_module = importlib.import_module("redis.asyncio")
        self._redis_client = redis_module.Redis.from_url(self.redis_url, decode_responses=True)
        return self._redis_client

    def _redis_available(self) -> bool:
        if not self.redis_enabled:
            return False
        if self._redis_client is not None:
            return True
        try:
            importlib.import_module("redis.asyncio")
        except Exception:  # noqa: BLE001
            return False
        return True

    @staticmethod
    def _session_key(
        user_id: int,
        tenant_id: int | None,
        channel: str,
        session_id: str,
        *,
        role: str | None = None,
        current_page: str | None = None,
        conversation_id: str | None = None,
    ) -> str:
        if role and (current_page or conversation_id):
            return (
                f"workflow:session:{tenant_id}:{user_id}:{_role_key(role)}:{_channel_key(channel)}:"
                f"{_conversation_key(conversation_id, session_id)}:{_page_key(current_page)}:{session_id}"
            )
        if role:
            return f"workflow:session:{tenant_id}:{user_id}:{_role_key(role)}:{channel}:{session_id}"
        return f"workflow:session:{tenant_id}:{user_id}:{channel}:{session_id}"

    @staticmethod
    def _latest_key(
        user_id: int,
        tenant_id: int | None,
        channel: str,
        *,
        role: str | None = None,
        current_page: str | None = None,
        conversation_id: str | None = None,
    ) -> str:
        if role and (current_page or conversation_id):
            return (
                f"workflow:latest:{tenant_id}:{user_id}:{_role_key(role)}:{_channel_key(channel)}:"
                f"{_conversation_key(conversation_id, 'default')}:{_page_key(current_page)}"
            )
        if role:
            return f"workflow:latest:{tenant_id}:{user_id}:{_role_key(role)}:{channel}"
        return f"workflow:latest:{tenant_id}:{user_id}:{channel}"

    @staticmethod
    def _confirmation_key(user_id: int, tenant_id: int | None, confirmation_id: str | None) -> str | None:
        if not confirmation_id:
            return None
        return f"workflow:confirmation:{tenant_id}:{user_id}:{confirmation_id}"

    def _candidate_session_keys(
        self,
        user_id: int,
        tenant_id: int | None,
        channel: str,
        session_id: str,
        *,
        role: str | None = None,
        current_page: str | None = None,
        conversation_id: str | None = None,
    ) -> list[str]:
        page = _page_key(current_page)
        conversation = _conversation_key(conversation_id, session_id)
        alternate_channel = "voice" if _channel_key(channel) == "chat" else "chat"
        if role:
            keys = [
                self._session_key(user_id, tenant_id, channel, session_id, role=role, current_page=page, conversation_id=conversation),
                self._session_key(user_id, tenant_id, alternate_channel, session_id, role=role, current_page=page, conversation_id=conversation),
                self._session_key(user_id, tenant_id, channel, session_id, role=role, current_page="global", conversation_id=conversation),
                self._session_key(user_id, tenant_id, alternate_channel, session_id, role=role, current_page="global", conversation_id=conversation),
                self._session_key(user_id, tenant_id, channel, session_id, role=role),
                self._session_key(user_id, tenant_id, alternate_channel, session_id, role=role),
            ]
            return list(dict.fromkeys(keys))
        keys = [self._session_key(user_id, tenant_id, channel, session_id)]
        keys.extend(
            self._session_key(user_id, tenant_id, channel, session_id, role=candidate)
            for candidate in ("EMPLOYEE", "MANAGER", "RH", "ADMIN")
        )
        return keys

    def _candidate_latest_keys(
        self,
        user_id: int,
        tenant_id: int | None,
        channel: str,
        *,
        role: str | None = None,
        current_page: str | None = None,
        conversation_id: str | None = None,
    ) -> list[str]:
        page = _page_key(current_page)
        conversation = _conversation_key(conversation_id, "default")
        alternate_channel = "voice" if _channel_key(channel) == "chat" else "chat"
        if role:
            keys = [
                self._latest_key(user_id, tenant_id, channel, role=role, current_page=page, conversation_id=conversation),
                self._latest_key(user_id, tenant_id, alternate_channel, role=role, current_page=page, conversation_id=conversation),
                self._latest_key(user_id, tenant_id, channel, role=role, current_page="global", conversation_id=conversation),
                self._latest_key(user_id, tenant_id, alternate_channel, role=role, current_page="global", conversation_id=conversation),
                self._latest_key(user_id, tenant_id, channel, role=role),
                self._latest_key(user_id, tenant_id, alternate_channel, role=role),
            ]
            return list(dict.fromkeys(keys))
        keys = [self._latest_key(user_id, tenant_id, channel)]
        keys.extend(
            self._latest_key(user_id, tenant_id, channel, role=candidate)
            for candidate in ("EMPLOYEE", "MANAGER", "RH", "ADMIN")
        )
        return keys


def _pending_confirmation_id(state: SessionState | None) -> str | None:
    if state is None or not isinstance(state.pending_confirmation, dict):
        return None
    confirmation_id = str(state.pending_confirmation.get("confirmation_id") or "").strip()
    return confirmation_id or None


def _role_key(role: str | None) -> str:
    return str(role or "EMPLOYEE").upper().replace("ROLE_", "") or "EMPLOYEE"


def _channel_key(channel: str | None) -> str:
    value = str(channel or "chat").strip().lower()
    return value if value in {"chat", "voice"} else "chat"


def _page_key(current_page: str | None) -> str:
    raw = str(current_page or "global").strip().lower() or "global"
    safe = "".join(char if char.isalnum() else "_" for char in raw)
    return safe.strip("_") or "global"


def _conversation_key(conversation_id: str | None, session_id: str) -> str:
    raw = str(conversation_id or session_id or "default").strip() or "default"
    safe = "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in raw)
    return safe.strip("_") or "default"
