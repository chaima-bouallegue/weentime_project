from __future__ import annotations

import wave
from pathlib import Path

import pytest

from config import Settings
from voice.stt import AudioConversionError, SpeechToTextService
from voice.vad import VadAnalysis
from voice.whisper_service import WhisperTranscriptionResult


def write_wav(path: Path, *, seconds: float = 1.8, sample_rate: int = 16000, amplitude: int = 2000) -> None:
    frames = int(seconds * sample_rate)
    sample = int(amplitude).to_bytes(2, byteorder="little", signed=True)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(sample * frames)


def build_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.temp_audio_dir = tmp_path
    settings.voice_min_input_bytes = 1
    settings.voice_min_duration_seconds = 1.0
    settings.voice_min_detected_volume = 0.01
    settings.voice_min_peak_amplitude = 1
    settings.voice_min_words = 1
    return settings


def test_vad_negative_with_real_signal_continues_to_stt(monkeypatch, tmp_path: Path) -> None:
    source = tmp_path / "input.webm"
    source.write_bytes(b"audio" * 100)
    settings = build_settings(tmp_path)
    service = SpeechToTextService(settings)

    def fake_convert_to_wav(_source, target, *, ffmpeg_binary="ffmpeg"):
        write_wav(Path(target), seconds=1.8, amplitude=2500)

    monkeypatch.setattr("voice.stt.convert_to_wav", fake_convert_to_wav)
    monkeypatch.setattr(
        "voice.stt.analyze_voice",
        lambda *args, **kwargs: VadAnalysis(
            used_vad=True,
            total_duration_ms=1800,
            voiced_duration_ms=0,
            total_frames=60,
            voiced_frames=0,
        ),
    )
    monkeypatch.setattr(
        "voice.stt.transcribe_audio_result",
        lambda *args, **kwargs: WhisperTranscriptionResult(
            text="je veux pointer",
            language="fr",
            language_probability=0.95,
        ),
    )

    result = service.process(source)

    assert result.status == "success"
    assert result.cleaned_text == "je veux pointer"
    assert result.vad_analysis is not None
    assert result.vad_analysis.has_speech is False


def test_valid_short_hr_command_can_continue_to_stt(monkeypatch, tmp_path: Path) -> None:
    source = tmp_path / "short.webm"
    source.write_bytes(b"audio" * 100)
    settings = build_settings(tmp_path)
    settings.voice_min_duration_seconds = 1.5
    settings.voice_short_command_min_duration_seconds = 0.45
    service = SpeechToTextService(settings)

    def fake_convert_to_wav(_source, target, *, ffmpeg_binary="ffmpeg"):
        write_wav(Path(target), seconds=0.7, amplitude=2500)

    monkeypatch.setattr("voice.stt.convert_to_wav", fake_convert_to_wav)
    monkeypatch.setattr(
        "voice.stt.analyze_voice",
        lambda *args, **kwargs: VadAnalysis(
            used_vad=True,
            total_duration_ms=690,
            voiced_duration_ms=210,
            total_frames=23,
            voiced_frames=7,
        ),
    )
    monkeypatch.setattr(
        "voice.stt.transcribe_audio_result",
        lambda *args, **kwargs: WhisperTranscriptionResult(
            text="npointi",
            language="fr",
            language_probability=0.51,
        ),
    )

    result = service.process(source)

    assert result.status == "success"
    assert result.cleaned_text == "npointi"
    assert result.details["short_command_candidate"] is True


def test_ffmpeg_conversion_failure_raises_clean_audio_conversion_error(monkeypatch, tmp_path: Path) -> None:
    source = tmp_path / "input.webm"
    source.write_bytes(b"audio" * 100)
    settings = build_settings(tmp_path)
    service = SpeechToTextService(settings)

    def fail_convert(*args, **kwargs):
        raise RuntimeError("conversion_failed:invalid data")

    monkeypatch.setattr("voice.stt.convert_to_wav", fail_convert)

    with pytest.raises(AudioConversionError):
        service.process(source)
