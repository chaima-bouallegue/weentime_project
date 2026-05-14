from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import main
from app.context.context_builder import ContextBuilder
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.result import ToolResult
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceProcessorResult
from voice.stt import VoiceProcessingResult
from jwt_test_utils import TEST_JWT_SECRET, make_token


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": context.role or "EMPLOYEE", "entrepriseId": 9})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.ok({})


def token_header(user_id: int = 12, role: str = "EMPLOYEE") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token({'userId': user_id, 'role': role, 'entrepriseId': 9})}"}


def prepare_v2_state(client: TestClient) -> None:
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


def fake_voice_result(tmp_path: Path, text: str = "Est-ce que je suis pointe ?") -> VoiceProcessorResult:
    stored = StoredAudio(path=tmp_path / "input.webm", directory=tmp_path, size_bytes=100)
    return VoiceProcessorResult(
        stt=VoiceProcessingResult(status="success", cleaned_text=text, language="fr", language_confidence=0.9),
        stored_audio=stored,
        detected_language="fr",
    )


def patch_voice_processor(monkeypatch, tmp_path: Path, text: str = "Est-ce que je suis pointe ?") -> None:
    monkeypatch.setattr(
        "app.api.voice_v2.VoiceRequestProcessor.process_upload",
        AsyncMock(return_value=fake_voice_result(tmp_path, text)),
    )
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.cleanup", lambda self, stored: None)


def test_voice_v2_returns_transcript_and_text_aliases(monkeypatch, tmp_path: Path) -> None:
    patch_voice_processor(monkeypatch, tmp_path)
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "app.api.voice_v2.process_copilot_message",
        AsyncMock(
            return_value=AgentResponse(
                type="answer",
                text="Vous etes pointe.",
                intent="attendance.status",
                confidence=0.9,
                actionResult={"success": True, "data": {"status": "ACTIVE"}},
            )
        ),
    )

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/voice",
            headers=token_header(),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["transcript"] == "Est-ce que je suis pointe ?"
    assert data["transcription"] == "Est-ce que je suis pointe ?"
    assert data["text"] == "Vous etes pointe."
    assert data["response"] == "Vous etes pointe."
    assert data["message"] == "Vous etes pointe."


def test_voice_v2_invalid_audio_returns_controlled_envelope() -> None:
    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/voice",
            headers=token_header(),
            files={"audio_file": ("audio.webm", b"1", "audio/webm")},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is False
    assert body["error"]["code"] in {"short_audio", "empty_audio", "no_voice_detected", "audio_processing_failed"}


def test_voice_v2_preserves_confirmation_metadata(monkeypatch, tmp_path: Path) -> None:
    patch_voice_processor(monkeypatch, tmp_path, "Pointer mon entree")
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "app.api.voice_v2.process_copilot_message",
        AsyncMock(
            return_value=AgentResponse(
                type="confirm_action",
                text="Confirmez-vous cette action ?",
                intent="attendance.check_in",
                confidence=0.95,
                requiresConfirmation=True,
                confirmationId="confirm-123",
                toolCalls=[ToolCallRecord(name="check_in", arguments={}, status="pending")],
                actionResult={"pending": True},
            )
        ),
    )

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/voice",
            headers=token_header(),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    data = response.json()["data"]
    assert data["requiresConfirmation"] is True
    assert data["confirmationId"] == "confirm-123"
    assert data["confirmation_id"] == "confirm-123"
    assert data["toolCalls"][0]["name"] == "check_in"
    assert data["tool_calls"][0]["name"] == "check_in"
    assert data["actionResult"] == {"pending": True}
    assert data["action_result"] == {"pending": True}


def test_voice_v2_returns_audio_url_aliases_when_tts_generates_audio(monkeypatch, tmp_path: Path) -> None:
    patch_voice_processor(monkeypatch, tmp_path)
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value="http://audio/reply.wav"))
    monkeypatch.setattr(
        "app.api.voice_v2.process_copilot_message",
        AsyncMock(return_value=AgentResponse(type="answer", text="Bonjour.", intent="general.greeting", confidence=0.9)),
    )

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/voice",
            headers=token_header(),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    data = response.json()["data"]
    assert data["audioUrl"] == "http://audio/reply.wav"
    assert data["audio_url"] == "http://audio/reply.wav"
