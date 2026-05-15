from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import main
from app.context.context_builder import ContextBuilder
from app.context.current_user import CurrentUserContext
from app.core.copilot_engine import ensure_copilot_services
from app.models.agent_models import AgentResponse
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
    for attr in ("copilot_tool_registry", "copilot_tool_executor", "copilot_confirmation_store", "copilot_router_agent", "copilot_attendance_agent"):
        if hasattr(client.app.state, attr):
            delattr(client.app.state, attr)


def test_voice_v2_requires_jwt() -> None:
    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/voice",
            files={"audio_file": ("audio.webm", b"123", "audio/webm")},
        )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "missing_jwt"


def test_voice_v2_invalid_audio_returns_controlled_error() -> None:
    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/voice",
            headers=token_header(),
            files={"audio_file": ("audio.webm", b"1", "audio/webm")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] in {"short_audio", "empty_audio", "no_voice_detected", "audio_processing_failed"}


def test_voice_v2_valid_stt_calls_copilot(monkeypatch, tmp_path: Path) -> None:
    stored = StoredAudio(path=tmp_path / "input.webm", directory=tmp_path, size_bytes=100)
    fake_processed = VoiceProcessorResult(
        stt=VoiceProcessingResult(status="success", cleaned_text="I want a leave", language="en", language_confidence=0.9),
        stored_audio=stored,
        detected_language="en",
    )
    process_mock = AsyncMock(return_value=AgentResponse(type="ask", text="Confirm?", intent="leave.create", confidence=0.9))
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.process_upload", AsyncMock(return_value=fake_processed))
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.cleanup", lambda self, stored: None)
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value="http://audio/reply.wav"))
    monkeypatch.setattr("app.api.voice_v2.process_copilot_message", process_mock)

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/voice",
            headers=token_header(),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["transcript"] == "I want a leave"
    assert body["data"]["detectedLanguage"] == "en"
    assert body["data"]["audioUrl"] == "http://audio/reply.wav"
    assert process_mock.await_count == 1


def test_voice_v2_preserves_tunisian_language_metadata(monkeypatch, tmp_path: Path) -> None:
    stored = StoredAudio(path=tmp_path / "input.webm", directory=tmp_path, size_bytes=100)
    fake_processed = VoiceProcessorResult(
        stt=VoiceProcessingResult(status="success", cleaned_text="nheb conge ghodwa", language="fr", language_confidence=0.82),
        stored_audio=stored,
        detected_language="tn",
    )
    process_mock = AsyncMock(return_value=AgentResponse(type="ask", text="Chnowa el motif?", intent="leave.create", confidence=0.9))
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.process_upload", AsyncMock(return_value=fake_processed))
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.cleanup", lambda self, stored: None)
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value=None))
    monkeypatch.setattr("app.api.voice_v2.process_copilot_message", process_mock)

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        response = client.post(
            "/v2/voice",
            headers=token_header(),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["detectedLanguage"] == "tn"
    assert body["data"]["languageConfidence"] == 0.82
    assert body["data"]["responseLocale"] == "tn"
    assert body["data"]["ttsUnavailable"] is True
    assert process_mock.call_args.kwargs["metadata"]["language"] == "tn"


def test_voice_v2_confirmation_oui_executes_pending_confirmation(monkeypatch, tmp_path: Path) -> None:
    stored = StoredAudio(path=tmp_path / "input.webm", directory=tmp_path, size_bytes=100)
    fake_processed = VoiceProcessorResult(
        stt=VoiceProcessingResult(status="success", cleaned_text="oui", language="fr", language_confidence=0.9),
        stored_audio=stored,
        detected_language="fr",
    )
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.process_upload", AsyncMock(return_value=fake_processed))
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.cleanup", lambda self, stored: None)
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value=None))

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        services = ensure_copilot_services(client.app.state)
        context = CurrentUserContext(user_id=12, role="EMPLOYEE", entreprise_id=9, token="token")
        services["confirmation_store"].create(context, "legacy.create_leave_request", {"payload": {"start_date": "2026-05-06"}})
        services["executor"].execute = AsyncMock(return_value=ToolResult.ok({"id": 1}))

        response = client.post(
            "/v2/voice",
            headers=token_header(user_id=12),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["requiresConfirmation"] is False
    assert body["data"]["agent"] == "confirmation"
    assert services["executor"].execute.await_count == 1

