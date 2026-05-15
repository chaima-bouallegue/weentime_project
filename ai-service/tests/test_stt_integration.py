from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from config import Settings
from voice.stt import SpeechToTextService, VoiceProcessingResult
from voice.vad import VadAnalysis
from voice.whisper_service import WhisperTranscriptionResult, transcribe_audio_result


def test_whisper_unavailable_returns_explicit_error(monkeypatch, tmp_path: Path) -> None:
    audio = tmp_path / "input.wav"
    audio.write_bytes(b"fake")
    monkeypatch.setattr("voice.whisper_service._load_model", lambda **kwargs: False)

    result = transcribe_audio_result(audio)

    assert result.text == ""
    assert result.error == "stt_unavailable"


def test_stt_unavailable_maps_to_retryable_status(monkeypatch, tmp_path: Path) -> None:
    source = tmp_path / "input.webm"
    source.write_bytes(b"audio" * 100)
    settings = Settings()
    settings.temp_audio_dir = tmp_path
    settings.voice_min_input_bytes = 1
    settings.voice_min_duration_seconds = 0.0
    settings.voice_min_detected_volume = 0.0
    settings.voice_min_peak_amplitude = 0
    service = SpeechToTextService(settings)

    monkeypatch.setattr("voice.stt.convert_to_wav", lambda source, target, **kwargs: Path(target).write_bytes(b"not-a-real-wav"))
    monkeypatch.setattr("voice.stt.SpeechToTextService._read_audio_metrics", lambda self, path: (1.8, 1.0, 200))
    monkeypatch.setattr("voice.stt.analyze_voice", lambda *args, **kwargs: VadAnalysis(used_vad=False, total_duration_ms=1800, voiced_duration_ms=0, total_frames=0, voiced_frames=0))
    monkeypatch.setattr(
        "voice.stt.transcribe_audio_result",
        lambda *args, **kwargs: WhisperTranscriptionResult(text="", error="stt_unavailable"),
    )

    result = service.process(source)

    assert result.status == "unavailable"
    assert result.error == "stt_unavailable"


@pytest.mark.asyncio
async def test_async_stt_cancellation_returns_controlled_status(monkeypatch, tmp_path: Path) -> None:
    service = SpeechToTextService(Settings())

    def cancelled(_path):
        raise asyncio.CancelledError()

    monkeypatch.setattr(service, "process", cancelled)

    result = await service.aprocess(tmp_path / "input.webm")

    assert isinstance(result, VoiceProcessingResult)
    assert result.status == "cancelled"
    assert result.error == "audio_cancelled"

