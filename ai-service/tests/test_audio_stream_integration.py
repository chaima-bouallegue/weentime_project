"""End-to-end integration test for /audio-stream.

Feeds a real French WebM/Opus recording to the streaming endpoint and
verifies that the assistant returns a non-empty transcription containing
at least one of the expected keywords. If this test fails, the voice
pipeline is not reliably transcribing French speech.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import main
from voice.stt import VoiceProcessingResult

FIXTURE = Path(__file__).parent / "fixtures" / "fr_leave_request.webm"
EXPECTED_KEYWORDS = {"congé", "conge", "veux", "demain"}


@pytest.fixture(autouse=True)
def _stub_agent_routing(monkeypatch):
    """Stub the agent so the test focuses on transcription, not the HR backend."""
    fake_response = main.ChatResponse(
        success=True,
        status="success",
        type="chat",
        text="D'accord, je prépare votre demande de congé.",
        message="D'accord, je prépare votre demande de congé.",
        response="D'accord, je prépare votre demande de congé.",
    )
    monkeypatch.setattr(
        main,
        "_route_voice_transcript",
        AsyncMock(return_value=fake_response),
    )
    monkeypatch.setattr(main, "_maybe_generate_tts", AsyncMock(return_value=None))
    yield


def test_audio_stream_transcribes_french_leave_request():
    """Single-blob upload (the new frontend contract)."""
    assert FIXTURE.exists(), f"Missing fixture: {FIXTURE}"

    with TestClient(main.app) as client:
        with FIXTURE.open("rb") as audio:
            response = client.post(
                "/audio-stream",
                data={
                    "user_id": "42",
                    "role": "EMPLOYEE",
                    "is_final": "true",
                },
                files={"file": ("fr_leave_request.webm", audio, "audio/webm")},
            )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["success"] is True, payload
    assert payload.get("final") is True, payload
    transcription = (payload.get("transcription") or "").lower()
    assert transcription, f"Empty transcription: {payload}"
    assert any(keyword in transcription for keyword in EXPECTED_KEYWORDS), (
        f"Transcription {transcription!r} does not contain any expected keyword"
    )


def test_audio_stream_handles_legacy_chunked_upload():
    """Backwards-compat: a client that still streams (two chunks + finalize)
    must still produce a non-empty transcription. Guards the backend contract
    independently of Task 5's frontend refactor."""
    assert FIXTURE.exists(), f"Missing fixture: {FIXTURE}"
    payload = FIXTURE.read_bytes()
    half = len(payload) // 2
    first, second = payload[:half], payload[half:]
    assert len(first) > 0 and len(second) > 0

    with TestClient(main.app) as client:
        r1 = client.post(
            "/audio-stream",
            data={"user_id": "42", "role": "EMPLOYEE", "is_final": "false", "chunk_index": "1"},
            files={"file": ("chunk.webm", first, "audio/webm")},
        )
        assert r1.status_code == 200, r1.text
        session_id = r1.json().get("session_id")
        assert session_id, r1.json()

        r2 = client.post(
            "/audio-stream",
            data={
                "user_id": "42",
                "role": "EMPLOYEE",
                "session_id": session_id,
                "is_final": "true",
                "chunk_index": "2",
            },
            files={"file": ("chunk.webm", second, "audio/webm")},
        )

    assert r2.status_code == 200, r2.text
    final_payload = r2.json()
    assert final_payload.get("final") is True, final_payload
    transcription = (final_payload.get("transcription") or "").lower()
    assert transcription, f"Empty transcription: {final_payload}"
    assert any(keyword in transcription for keyword in EXPECTED_KEYWORDS)


def test_audio_stream_invalid_blob_returns_invalid_audio_status():
    invalid_payload = b"x" * 1200

    with TestClient(main.app) as client:
        response = client.post(
            "/audio-stream",
            data={
                "user_id": "42",
                "role": "EMPLOYEE",
                "is_final": "true",
                "chunk_index": "1",
            },
            files={"file": ("broken.webm", invalid_payload, "audio/webm")},
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload.get("success") is False, payload
    assert payload.get("status") == "invalid_audio", payload
    assert payload.get("retryable") is True, payload
    assert "audio invalide" in (payload.get("message") or "").lower()


def test_audio_stream_repeated_phrase_returns_unclear_audio(monkeypatch):
    assert FIXTURE.exists(), f"Missing fixture: {FIXTURE}"

    async def fake_aprocess(_self, _audio_file):
        return VoiceProcessingResult(
            status="retry",
            raw_text="Bonjour, bonjour, bonjour, bonjour, bonjour",
            cleaned_text=None,
            duration_seconds=1.9,
            detected_volume=12.0,
            error="unclean_transcription",
        )

    monkeypatch.setattr(main.SpeechToTextService, "aprocess", fake_aprocess)

    with TestClient(main.app) as client:
        with FIXTURE.open("rb") as audio:
            response = client.post(
                "/audio-stream",
                data={
                    "user_id": "42",
                    "role": "EMPLOYEE",
                    "is_final": "true",
                    "chunk_index": "1",
                },
                files={"file": ("fr_leave_request.webm", audio, "audio/webm")},
            )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload.get("success") is True, payload
    assert payload.get("status") == "unclear_audio", payload
    assert payload.get("retryable") is True, payload
    assert payload.get("transcription") in (None, ""), payload
