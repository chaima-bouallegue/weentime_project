from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from config import Settings
from voice.stt import SpeechToTextService
from voice.vad import VadAnalysis
from voice.whisper_service import WhisperTranscriptionResult


@pytest.mark.parametrize(
    ("raw_text", "language"),
    [
        ("je veux un congé", "fr"),
        ("I want a leave", "en"),
        ("نحب عطلة", "ar"),
    ],
)
def test_stt_pipeline_returns_non_empty_text_and_detected_language(tmp_path: Path, raw_text: str, language: str) -> None:
    audio_path = tmp_path / f"{language}.webm"
    audio_path.write_bytes(b"0" * 8000)
    settings = Settings()
    settings.voice_min_input_bytes = 1
    settings.voice_min_duration_seconds = 0.1
    settings.voice_min_detected_volume = 0.01
    settings.voice_min_peak_amplitude = 1
    service = SpeechToTextService(settings)

    with patch("voice.stt.convert_to_wav") as convert_mock, patch(
        "voice.stt.analyze_voice",
        return_value=VadAnalysis(
            used_vad=True,
            total_duration_ms=1200,
            voiced_duration_ms=900,
            total_frames=40,
            voiced_frames=30,
        ),
    ), patch.object(
        service,
        "_read_audio_metrics",
        return_value=(1.2, 3.0, 900),
    ), patch(
        "voice.stt.transcribe_audio_result",
        return_value=WhisperTranscriptionResult(
            text=raw_text,
            language=language,
            language_probability=0.91,
        ),
    ):
        convert_mock.side_effect = lambda _source, target, ffmpeg_binary=None: Path(target).write_bytes(b"RIFF")
        result = service.process(audio_path)

    assert result.status == "success"
    assert result.cleaned_text
    assert result.language == language
    assert result.language_confidence == pytest.approx(0.91)
