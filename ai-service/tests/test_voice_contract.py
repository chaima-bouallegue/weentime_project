from __future__ import annotations

import base64
import json
from pathlib import Path
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import main
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceProcessorResult
from voice.stt import VoiceProcessingResult


def make_token(claims: dict) -> str:
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode("utf-8")).decode("ascii").rstrip("=")
    return f"header.{payload}.signature"


def token_header(user_id: int = 12, role: str = "EMPLOYEE") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token({'userId': user_id, 'role': role, 'entrepriseId': 9})}"}


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
        AsyncMock(return_value=AgentResponse(type="answer", text="Vous etes pointe.", intent="attendance.status", confidence=0.9)),
    )

    with TestClient(main.app) as client:
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
        response = client.post(
            "/v2/voice",
            headers=token_header(),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    data = response.json()["data"]
    assert data["audioUrl"] == "http://audio/reply.wav"
    assert data["audio_url"] == "http://audio/reply.wav"
