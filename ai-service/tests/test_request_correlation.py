from __future__ import annotations

import base64
import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

import main
from app.context.current_user import CurrentUserContext
from app.core.copilot_engine import ensure_copilot_services
from app.models.agent_models import AgentResponse
from app.models.tool_models import ToolDefinition
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceProcessorResult
from voice.stt import VoiceProcessingResult


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": "EMPLOYEE", "entrepriseId": 9})
        if path == "/presence/me/today":
            return ToolResult.ok({"status": "ACTIVE", "checkIn": "09:00"})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.ok({"status": "ACTIVE"})


class EmptyInput(BaseModel):
    pass


def make_token(claims: dict) -> str:
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode("utf-8")).decode("ascii").rstrip("=")
    return f"header.{payload}.signature"


def token_header(user_id: int = 12, role: str = "EMPLOYEE", request_id: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {make_token({'userId': user_id, 'role': role, 'entrepriseId': 9})}"}
    if request_id:
        headers["X-Request-ID"] = request_id
    return headers


def prepare_v2_state(client: TestClient) -> None:
    client.app.state.copilot_ready = False
    client.app.state.copilot_backend_client = FakeBackendClient()
    for attr in (
        "copilot_context_builder",
        "copilot_tool_registry",
        "copilot_tool_executor",
        "copilot_confirmation_store",
        "copilot_router_agent",
        "copilot_attendance_agent",
    ):
        if hasattr(client.app.state, attr):
            delattr(client.app.state, attr)


def fake_voice_result(tmp_path: Path, text: str = "Est-ce que je suis pointe ?") -> VoiceProcessorResult:
    stored = StoredAudio(path=tmp_path / "input.webm", directory=tmp_path, size_bytes=100)
    return VoiceProcessorResult(
        stt=VoiceProcessingResult(status="success", cleaned_text=text, language="fr", language_confidence=0.9),
        stored_audio=stored,
        detected_language="fr",
    )


def test_chat_v2_preserves_x_request_id() -> None:
    request_id = "req-chat-123"
    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/chat",
            headers=token_header(request_id=request_id),
            json={"message": "Est-ce que je suis pointe ?", "user_id": 12},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["request_id"] == request_id
    assert body["data"]["requestId"] == request_id


def test_voice_v2_preserves_x_request_id(monkeypatch, tmp_path: Path) -> None:
    request_id = "req-voice-456"
    monkeypatch.setattr(
        "app.api.voice_v2.VoiceRequestProcessor.process_upload",
        AsyncMock(return_value=fake_voice_result(tmp_path)),
    )
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.cleanup", lambda self, stored: None)
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "app.api.voice_v2.process_copilot_message",
        AsyncMock(return_value=AgentResponse(type="answer", text="Vous etes pointe.", intent="attendance.status", confidence=0.9)),
    )

    with TestClient(main.app) as client:
        response = client.post(
            "/v2/voice",
            headers=token_header(request_id=request_id),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    data = response.json()["data"]
    assert response.status_code == 200
    assert data["request_id"] == request_id
    assert data["requestId"] == request_id


async def _ok_handler(_payload: EmptyInput, _context: CurrentUserContext) -> ToolResult:
    return ToolResult.ok({"ok": True}, status_code=200)


@pytest.mark.asyncio
async def test_tool_spans_include_request_id(monkeypatch) -> None:
    events: list[dict] = []

    def fake_log_event(name, *, input=None, output=None, metadata=None):  # noqa: ANN001
        events.append({"name": name, "metadata": metadata or {}})

    monkeypatch.setattr("app.tools.executor.log_event", fake_log_event)
    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            name="test.read",
            description="Test read tool",
            input_model=EmptyInput,
            type="read",
            allowed_roles={"EMPLOYEE"},
        ),
        _ok_handler,
    )
    executor = ToolExecutor(registry)
    context = CurrentUserContext(user_id=12, role="EMPLOYEE", entreprise_id=9, token="token")

    result = await executor.execute("test.read", {}, context, request_id="req-tool-789")

    assert result.success is True
    assert any(event["name"] == "tool.result.normalized" and event["metadata"].get("request_id") == "req-tool-789" for event in events)
