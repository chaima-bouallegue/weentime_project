from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import main
from app.context.context_builder import ContextBuilder
from app.tools.result import ToolResult
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceProcessorResult
from jwt_test_utils import TEST_JWT_SECRET, make_token
from voice.stt import VoiceProcessingResult


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": context.role or "EMPLOYEE", "entrepriseId": 9})
        if path == "/presence/me/today":
            return ToolResult.ok({"status": "ACTIVE", "checkIn": "09:00"})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.ok({})


def prepare_workflow_state(client: TestClient) -> None:
    client.app.state.copilot_ready = False
    client.app.state.copilot_backend_client = FakeBackendClient()
    client.app.state.copilot_context_builder = ContextBuilder(FakeBackendClient(), jwt_secret=TEST_JWT_SECRET)


def token_header(user_id: int = 12, role: str = "EMPLOYEE") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token({'userId': user_id, 'role': role, 'entrepriseId': 9})}"}


def test_voice_workflow_preserves_language(monkeypatch, tmp_path: Path) -> None:
    stored = StoredAudio(path=tmp_path / "input.webm", directory=tmp_path, size_bytes=100)
    fake_processed = VoiceProcessorResult(
        stt=VoiceProcessingResult(status="success", cleaned_text="Est-ce que je suis pointe ?", language="fr", language_confidence=0.82),
        stored_audio=stored,
        detected_language="tn",
    )
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.process_upload", AsyncMock(return_value=fake_processed))
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.cleanup", lambda self, stored: None)
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value=None))

    with TestClient(main.app) as client:
        prepare_workflow_state(client)
        response = client.post(
            "/v2/voice",
            headers=token_header(),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["intent"] == "attendance.status"
    assert body["data"]["detectedLanguage"] == "tn"
    assert body["data"]["responseLocale"] == "tn"
    assert body["data"]["ttsUnavailable"] is True
