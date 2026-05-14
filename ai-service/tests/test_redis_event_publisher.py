from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
from app.events.publisher import RedisEventPublisher, build_ai_event, get_event_publisher, get_redis_event_status
from config import get_settings


class FakeRedisClient:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.published: list[tuple[str, str]] = []
        self.set_calls: list[tuple] = []

    async def publish(self, channel: str, payload: str) -> int:
        if self.fail:
            raise ConnectionError("redis unavailable")
        self.published.append((channel, payload))
        return 1

    async def set(self, *args, **kwargs) -> None:  # pragma: no cover - should never be called
        self.set_calls.append((args, kwargs))


def settings(**overrides):
    values = {
        "redis_enabled": False,
        "redis_url": "redis://localhost:6379",
        "redis_ai_events_channel": "ai.events.generated",
        "redis_default_ttl_seconds": 300,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.fixture(autouse=True)
def clear_settings_cache():
    yield
    get_settings.cache_clear()


def test_event_publisher_disabled_mode_is_noop() -> None:
    publisher = get_event_publisher(settings(redis_enabled=False))
    event = build_ai_event("ai.events.generated", payload={"message": "safe"})

    result = asyncio.run(publisher.publish_event(event))

    assert result.success is True
    assert result.enabled is False
    assert result.fallback == "redis_disabled"


@pytest.mark.asyncio
async def test_redis_publish_formats_valid_event_envelope() -> None:
    client = FakeRedisClient()
    publisher = RedisEventPublisher(redis_url="redis://localhost:6379", channel="ai.events.generated", redis_client=client)
    event = build_ai_event(
        "ai.events.generated",
        payload={"summary": "created"},
        tenant_id=9,
        actor_user_id=12,
        target_user_ids=[13],
        aggregate_type="AI_EVENT",
        aggregate_id="req-1",
        trace_id="req-1",
    )

    result = await publisher.publish_event(event)

    assert result.success is True
    assert client.published
    channel, payload = client.published[0]
    assert channel == "ai.events.generated"
    assert '"eventType": "ai.events.generated"' in payload
    assert '"tenantId": 9' in payload
    assert '"sourceService": "ai-service"' in payload


@pytest.mark.asyncio
async def test_redis_unavailable_returns_no_crash_fallback() -> None:
    client = FakeRedisClient(fail=True)
    publisher = RedisEventPublisher(redis_url="redis://localhost:6379", channel="ai.events.generated", redis_client=client)
    event = build_ai_event("ai.events.generated", payload={"message": "safe"})

    result = await publisher.publish_event(event)

    assert result.success is False
    assert result.enabled is True
    assert result.fallback == "redis_unavailable"


@pytest.mark.asyncio
async def test_no_permanent_business_state_is_written_to_redis() -> None:
    client = FakeRedisClient()
    publisher = RedisEventPublisher(redis_url="redis://localhost:6379", channel="ai.events.generated", redis_client=client)
    event = build_ai_event("communication.typing.started", payload={"typing": True}, tenant_id=9, actor_user_id=12)

    await publisher.publish_event(event)

    assert len(client.published) == 1
    assert client.set_calls == []


def test_redis_status_disabled_is_safe() -> None:
    status = get_redis_event_status(settings(redis_enabled=False))

    assert status["enabled"] is False
    assert status["mode"] == "noop"
    assert status["channel"] == "ai.events.generated"


def test_health_deep_includes_redis_event_status(monkeypatch) -> None:
    monkeypatch.setenv("REDIS_ENABLED", "false")
    get_settings.cache_clear()

    with TestClient(main.app) as client:
        response = client.get("/health/deep")

    body = response.json()
    assert response.status_code == 200
    assert "redis_events" in body["data"]
    assert body["data"]["redis_events"]["enabled"] is False
