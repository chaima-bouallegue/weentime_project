from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.agents.communication_agent import CommunicationAgent
from app.agents.legacy_agent import LegacyAgent
from app.agents.router_agent import RouterAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.communication_tools import register_communication_tools
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult

CHANNEL_ID = "11111111-1111-4111-8111-111111111111"


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role=role,
        entreprise_id=9,
        token="token",
        metadata={"jwt_verified": True, "request_id": "req-1"},
    )


class FakeBackendClient:
    def __init__(self, *, fail: ToolResult | None = None, messages: list[dict[str, Any]] | None = None) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None, dict[str, Any] | None]] = []
        self.fail = fail
        self.messages = messages

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params, None))
        if self.fail is not None:
            return self.fail
        if path == "/communication/channels":
            return ToolResult.ok(
                [
                    {
                        "id": CHANNEL_ID,
                        "name": "General",
                        "type": "COMPANY",
                        "unreadCount": 2,
                        "permissions": {"canRead": True},
                    }
                ],
                status_code=200,
            )
        if path == f"/communication/channels/{CHANNEL_ID}/messages":
            return ToolResult.ok(
                {
                    "items": self.messages
                    if self.messages is not None
                    else [
                        {
                            "id": "22222222-2222-4222-8222-222222222222",
                            "channelId": CHANNEL_ID,
                            "sender": {"resolvedFullName": "Amin Dupont"},
                            "body": "Bonjour equipe",
                            "status": "ACTIVE",
                            "createdAt": "2026-05-14T08:00:00Z",
                        }
                    ],
                    "nextCursor": None,
                    "hasMore": False,
                },
                status_code=200,
            )
        return ToolResult.fail("not_found", "Not found", status_code=404)

    async def post(
        self,
        path: str,
        *,
        context: CurrentUserContext,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ToolResult:
        self.calls.append(("POST", path, None, json))
        return ToolResult.ok({"id": "33333333-3333-4333-8333-333333333333", **(json or {})}, status_code=201)


def executor_with_backend(backend: FakeBackendClient) -> ToolExecutor:
    registry = ToolRegistry()
    register_communication_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry)


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any], bool]] = []

    async def execute(self, tool_name, payload, context, *, confirmed=False, **kwargs):
        self.calls.append((tool_name, payload or {}, confirmed))
        if tool_name == "communication.summarize_channel":
            return ToolResult.ok(
                {
                    "read_result": {
                        "kind": "read_result",
                        "summary": "Resume du canal: 1 message visible.",
                        "items": [{"excerpt": "Bonjour"}],
                        "count": 1,
                    }
                },
                status_code=200,
            )
        return ToolResult.ok(
            {
                "read_result": {
                    "kind": "read_result",
                    "summary": f"ok:{tool_name}",
                    "items": [],
                    "count": 0,
                }
            },
            status_code=200,
        )


class FakeAttendance:
    name = "attendance"

    def can_handle(self, message, context):
        return 0.0

    async def handle(self, message, context):
        return AgentResponse(type="answer", text="attendance", intent="attendance.status", confidence=1.0)


@pytest.mark.asyncio
async def test_list_channels_tool_calls_verified_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute("communication.list_channels", {}, context())

    assert result.success is True
    assert backend.calls == [("GET", "/communication/channels", None, None)]
    assert result.data["read_result"]["count"] == 1
    assert "canal" in result.data["read_result"]["summary"]


@pytest.mark.asyncio
async def test_get_channel_messages_calls_modern_tool_endpoint() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "communication.get_channel_messages",
        {"channel_id": CHANNEL_ID, "limit": 10},
        context(),
    )

    assert result.success is True
    assert backend.calls[0] == ("GET", f"/communication/channels/{CHANNEL_ID}/messages", {"limit": 10}, None)
    assert result.data["read_result"]["count"] == 1


@pytest.mark.asyncio
async def test_summarize_channel_uses_visible_messages_only() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "communication.summarize_channel",
        {"channel_id": CHANNEL_ID, "limit": 5},
        context(),
    )

    read_result = result.data["read_result"]
    assert result.success is True
    assert read_result["toolName"] == "communication.summarize_channel"
    assert read_result["data"]["kind"] == "communication_summary"
    assert read_result["data"]["messageCount"] == 1


@pytest.mark.asyncio
async def test_empty_channel_returns_clean_empty_state() -> None:
    backend = FakeBackendClient(messages=[])
    result = await executor_with_backend(backend).execute(
        "communication.summarize_channel",
        {"channel_id": CHANNEL_ID},
        context(),
    )

    assert result.success is True
    assert result.data["read_result"]["empty"] is True
    assert "Aucun message" in result.data["read_result"]["summary"]


@pytest.mark.asyncio
async def test_send_message_requires_confirmation_and_does_not_execute_directly() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "communication.send_message",
        {"channel_id": CHANNEL_ID, "content": "Bonjour"},
        context(),
    )

    assert result.success is False
    assert result.error_code == "confirmation_required"
    assert backend.calls == []


@pytest.mark.asyncio
async def test_send_message_confirmed_uses_backend_membership_endpoint_without_user_id() -> None:
    backend = FakeBackendClient()
    result = await executor_with_backend(backend).execute(
        "communication.send_message",
        {"channel_id": CHANNEL_ID, "content": "Bonjour"},
        context(),
        confirmed=True,
    )

    assert result.success is True
    assert backend.calls[0][0] == "POST"
    assert backend.calls[0][1] == f"/communication/channels/{CHANNEL_ID}/messages"
    body = backend.calls[0][3]
    assert body is not None
    assert body["body"] == "Bonjour"
    assert "userId" not in body
    assert "tenantId" not in body


@pytest.mark.asyncio
async def test_employee_unauthorized_channel_returns_clean_403() -> None:
    backend = FakeBackendClient(fail=ToolResult.fail("forbidden", "Forbidden technical text", status_code=403))
    result = await executor_with_backend(backend).execute(
        "communication.get_channel_messages",
        {"channel_id": CHANNEL_ID},
        context(),
    )

    assert result.success is False
    assert result.status_code == 403
    assert "droits necessaires" in result.data["read_result"]["summary"]
    assert "Forbidden technical text" not in result.data["read_result"]["summary"]


@pytest.mark.asyncio
async def test_backend_404_returns_clean_not_found() -> None:
    backend = FakeBackendClient(fail=ToolResult.fail("not_found", "Raw 404", status_code=404))
    result = await executor_with_backend(backend).execute(
        "communication.get_channel_messages",
        {"channel_id": CHANNEL_ID},
        context(),
    )

    assert result.success is False
    assert "introuvables" in result.data["read_result"]["summary"]
    assert "Raw 404" not in result.data["read_result"]["summary"]


def test_list_channels_routes_to_communication_agent() -> None:
    executor = FakeExecutor()
    agent = CommunicationAgent(executor, ConfirmationStore())  # type: ignore[arg-type]
    router = RouterAgent(FakeAttendance(), extra_agents=[agent], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("show my channels", context()))

    assert response.intent == "communication.list_channels"
    assert executor.calls[0][0] == "communication.list_channels"


def test_get_channel_messages_agent_calls_tool() -> None:
    executor = FakeExecutor()
    agent = CommunicationAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle(f"read latest messages in channel {CHANNEL_ID}", context()))

    assert response.intent == "communication.read_messages"
    assert executor.calls[0][0] == "communication.get_channel_messages"
    assert executor.calls[0][1]["channel_id"] == CHANNEL_ID


def test_send_message_agent_creates_confirmation() -> None:
    executor = FakeExecutor()
    agent = CommunicationAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle(f"send message to channel {CHANNEL_ID}: Bonjour equipe", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "communication.send_message"
    assert response.toolCalls[0].arguments["content"] == "Bonjour equipe"
    assert executor.calls == []


def test_communication_agent_no_longer_returns_placeholder_for_supported_intents() -> None:
    executor = FakeExecutor()
    agent = CommunicationAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle(f"summarize channel {CHANNEL_ID}", context()))

    assert response.intent == "communication.summarize_channel"
    assert "pas encore active" not in response.text.lower()


def test_legacy_fallback_still_handles_unrelated_prompts() -> None:
    async def legacy_handler(request):
        return AgentResponse(type="answer", text="legacy", intent="legacy.intent", confidence=0.5)

    router = RouterAgent(
        FakeAttendance(),
        extra_agents=[CommunicationAgent(FakeExecutor(), ConfirmationStore())],  # type: ignore[arg-type]
        legacy_agent=LegacyAgent(legacy_handler),
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("question hors communication", context()))

    assert response.intent == "legacy.intent"
