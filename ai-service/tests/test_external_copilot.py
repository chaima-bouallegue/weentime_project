from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from voice.stt import SpeechToTextService
from voice.tts import TextToSpeechService
import main
from app.context.context_builder import ContextBuilder
from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceProcessorResult
from voice.stt import VoiceProcessingResult
from jwt_test_utils import TEST_JWT_SECRET


@pytest.fixture(autouse=True)
def mock_heavy_lifespan(monkeypatch):
    monkeypatch.setattr(SpeechToTextService, "apreload", AsyncMock(return_value=True))
    monkeypatch.setattr(TextToSpeechService, "apreload", AsyncMock(return_value=True))
    monkeypatch.setattr(main.settings, "stt_preload", False)
    monkeypatch.setattr(main.settings, "tts_preload", False)
    monkeypatch.setattr(main.settings, "rag_embedding_backend", "none")


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        return ToolResult.ok({"id": 1, "role": "EMPLOYEE", "entrepriseId": 1})

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.ok({})


def prepare_state(client: TestClient) -> None:
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


def test_external_copilot_health() -> None:
    with TestClient(main.app) as client:
        prepare_state(client)
        response = client.get("/api/v1/copilot/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "chat" in data["capabilities"]
        assert data["mode"] == "AI-as-a-Service"


def test_external_copilot_chat_unauthorized_without_key() -> None:
    with TestClient(main.app) as client:
        prepare_state(client)
        response = client.post(
            "/api/v1/copilot/chat",
            json={"message": "Bonjour, solde de congés ?"},
        )
        assert response.status_code == 401
        assert response.json()["detail"]["error"] == "missing_api_key"


def test_external_copilot_chat_unauthorized_with_wrong_key() -> None:
    with TestClient(main.app) as client:
        prepare_state(client)
        response = client.post(
            "/api/v1/copilot/chat",
            headers={"X-API-Key": "bad_key_123"},
            json={"message": "Bonjour, solde de congés ?"},
        )
        assert response.status_code == 401
        assert response.json()["detail"]["error"] == "invalid_api_key"


def test_external_copilot_chat_empty_message() -> None:
    with TestClient(main.app) as client:
        prepare_state(client)
        response = client.post(
            "/api/v1/copilot/chat",
            headers={"X-API-Key": "weentime_dev_secret_key_2026"},
            json={"message": "   "},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["error"] == "empty_message"


def test_external_copilot_chat_success(monkeypatch) -> None:
    process_mock = AsyncMock(
        return_value=AgentResponse(
            type="answer",
            text="Bonjour ! En quoi puis-je vous aider aujourd'hui ?",
            intent="GREETING",
        )
    )
    monkeypatch.setattr("app.api.external_copilot.process_copilot_message", process_mock)

    with TestClient(main.app) as client:
        prepare_state(client)
        response = client.post(
            "/api/v1/copilot/chat",
            headers={"X-API-Key": "weentime_dev_secret_key_2026", "X-Request-ID": "test-req-999"},
            json={
                "message": "Bonjour Copilot !",
                "session_id": "ext-session-42",
                "user_id": 15,
                "role": "EMPLOYEE",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["reply"] == "Bonjour ! En quoi puis-je vous aider aujourd'hui ?"
        assert data["session_id"] == "ext-session-42"
        assert data["intent"] == "GREETING"
        assert data["request_id"] == "test-req-999"


def test_external_copilot_voice_success(monkeypatch, tmp_path: Path) -> None:
    audio_file = tmp_path / "sample.webm"
    audio_file.write_bytes(b"dummy_audio_bytes")
    stored = StoredAudio(path=audio_file, directory=tmp_path, size_bytes=len(b"dummy_audio_bytes"))

    stt_result = VoiceProcessingResult(
        raw_text="I want a leave for tomorrow",
        cleaned_text="I want a leave for tomorrow",
        language="en",
        language_confidence=0.98,
        duration_seconds=2.5,
        status="success",
    )
    proc_result = VoiceProcessorResult(
        stt=stt_result,
        stored_audio=stored,
        detected_language="en",
        timings={"stt_ms": 120.0},
    )

    monkeypatch.setattr("app.api.external_copilot.VoiceRequestProcessor.process_upload", AsyncMock(return_value=proc_result))
    monkeypatch.setattr("app.api.external_copilot.VoiceRequestProcessor.cleanup", lambda self, stored: None)
    monkeypatch.setattr(
        "app.api.external_copilot.VoiceRequestProcessor.generate_tts",
        AsyncMock(return_value="http://localhost:8000/audio/files/voice-reply.wav"),
    )

    process_mock = AsyncMock(
        return_value=AgentResponse(type="answer", text="I have prepared your leave request for tomorrow.", intent="DEMANDE_CONGE")
    )
    monkeypatch.setattr("app.api.external_copilot.process_copilot_message", process_mock)

    with TestClient(main.app) as client:
        prepare_state(client)
        response = client.post(
            "/api/v1/copilot/voice",
            headers={"X-API-Key": "client_app_demo_key"},
            data={"session_id": "voice-session-1", "user_id": 10, "generate_tts": "true"},
            files={"audio_file": ("test.webm", b"audio_content_test", "audio/webm")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["transcription"] == "I want a leave for tomorrow"
        assert data["reply"] == "I have prepared your leave request for tomorrow."
        assert data["detected_language"] == "en"
        assert data["audio_url"] == "http://localhost:8000/audio/files/voice-reply.wav"
        assert data["audio_status"] == "generated"


def test_external_copilot_transcribe(monkeypatch, tmp_path: Path) -> None:
    audio_file = tmp_path / "audio.wav"
    audio_file.write_bytes(b"wav")
    stored = StoredAudio(path=audio_file, directory=tmp_path, size_bytes=3)

    stt_result = VoiceProcessingResult(
        raw_text="Pointage effectué avec succès",
        cleaned_text="Pointage effectué avec succès",
        language="fr",
        language_confidence=0.95,
        duration_seconds=1.8,
        status="success",
    )
    proc_result = VoiceProcessorResult(
        stt=stt_result,
        stored_audio=stored,
        detected_language="fr",
        timings={"stt_ms": 85.0},
    )

    monkeypatch.setattr("app.api.external_copilot.VoiceRequestProcessor.process_upload", AsyncMock(return_value=proc_result))
    monkeypatch.setattr("app.api.external_copilot.VoiceRequestProcessor.cleanup", lambda self, stored: None)

    with TestClient(main.app) as client:
        prepare_state(client)
        response = client.post(
            "/api/v1/copilot/transcribe",
            headers={"X-API-Key": "weentime_dev_secret_key_2026"},
            files={"audio_file": ("test.wav", b"wav_data", "audio/wav")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["transcription"] == "Pointage effectué avec succès"
        assert data["detected_language"] == "fr"


def test_external_copilot_synthesize(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.external_copilot.VoiceRequestProcessor.generate_tts",
        AsyncMock(return_value="http://localhost:8000/audio/files/synthesized.wav"),
    )

    with TestClient(main.app) as client:
        prepare_state(client)
        response = client.post(
            "/api/v1/copilot/synthesize",
            headers={"X-API-Key": "weentime_dev_secret_key_2026"},
            json={"text": "Bonjour, votre pointage a été validé.", "language": "fr"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["audio_url"] == "http://localhost:8000/audio/files/synthesized.wav"
        assert data["language"] == "fr"
