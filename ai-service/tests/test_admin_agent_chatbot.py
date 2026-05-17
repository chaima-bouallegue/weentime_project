from __future__ import annotations

import asyncio

from chatbot_test_helpers import send_chatbot_message


def test_admin_system_health_routes_to_admin_diagnostics() -> None:
    response, _ = asyncio.run(send_chatbot_message("System health", role="ADMIN"))
    assert response.intent == "admin.system_health"
    assert any(call.name == "admin.system_health" for call in response.toolCalls)
    assert not response.intent.startswith("fallback.")


def test_admin_provider_status_is_safe_read() -> None:
    response, _ = asyncio.run(send_chatbot_message("AI provider status", role="ADMIN"))
    assert response.intent == "admin.provider_status"
    assert any(call.name == "admin.provider_status" for call in response.toolCalls)


def test_admin_redis_status_is_safe_read() -> None:
    response, _ = asyncio.run(send_chatbot_message("Redis status", role="ADMIN"))
    assert response.intent == "admin.redis_status"
    assert any(call.name == "admin.redis_status" for call in response.toolCalls)


def test_admin_create_user_requires_missing_fields_or_confirmation() -> None:
    response, _ = asyncio.run(send_chatbot_message("Create user", role="ADMIN"))
    assert response.type in {"ask", "confirm_action"}
    assert not response.intent.startswith("fallback.")
