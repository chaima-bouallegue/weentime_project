from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

import main

pytestmark = pytest.mark.asyncio

from voice.stt import VoiceProcessingResult


def make_ready_session(tmp_path: Path, session_id: str) -> main.AudioStreamSession:
    stream_path = tmp_path / "recording.webm"
    stream_path.write_bytes(b"0" * 6000)
    session = main.AudioStreamSession(
        session_id=session_id,
        user_id=7,
        role="EMPLOYEE",
        access_token=None,
        directory=tmp_path,
        stream_path=stream_path,
    )
    session.total_bytes = stream_path.stat().st_size
    main.app.state.audio_stream_sessions = {session_id: session}
    main.app.state.completed_audio_streams = {}
    return session


async def test_finalize_audio_stream_returns_controlled_cancelled_error(tmp_path: Path) -> None:
    session = make_ready_session(tmp_path, "voice-cancel")
    main.app.state.stt_service = type("FakeStt", (), {})()
    main.app.state.stt_service.aprocess = AsyncMock(side_effect=asyncio.CancelledError())

    with patch.object(main, "convert_stream_to_wav", return_value=session.directory / "recording.wav"), patch.object(
        main, "_validate_stream_audio", return_value=(True, None)
    ):
        payload = await main._finalize_audio_stream("voice-cancel")

    assert payload["success"] is False
    assert payload["status"] == "audio_cancelled"
    assert payload["retryable"] is True
    assert payload["session_id"] == "voice-cancel"
    assert "voice-cancel" in main.app.state.completed_audio_streams


async def test_finalize_audio_stream_returns_stt_unavailable(tmp_path: Path) -> None:
    session = make_ready_session(tmp_path, "voice-unavailable")
    main.app.state.stt_service = type("FakeStt", (), {})()
    main.app.state.stt_service.aprocess = AsyncMock(
        return_value=VoiceProcessingResult(status="unavailable", error="stt_unavailable", detected_volume=0.2)
    )

    with patch.object(main, "convert_stream_to_wav", return_value=session.directory / "recording.wav"), patch.object(
        main, "_validate_stream_audio", return_value=(True, None)
    ):
        payload = await main._finalize_audio_stream("voice-unavailable")

    assert payload["success"] is False
    assert payload["status"] == "stt_unavailable"
    assert payload["error"] == "stt_unavailable"
    assert payload["retryable"] is True
    assert payload["session_id"] == "voice-unavailable"


