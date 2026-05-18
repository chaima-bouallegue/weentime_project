from __future__ import annotations

import asyncio
import wave
from pathlib import Path

import pytest

import voice.tts as tts_module
from app.voice_pipeline.voice_request_processor import VoiceRequestProcessor
from config import Settings
from voice import tts_service
from voice.tts import TextToSpeechService


class _DummySettings(Settings):
    def __init__(self) -> None:
        super().__init__()
        self.tts_enabled = False


class _EnabledSettings(Settings):
    def __init__(self, tmp_path: Path) -> None:
        super().__init__()
        self.tts_enabled = True
        self.generated_audio_dir = tmp_path
        self.tts_use_gpu = False
        self.tts_max_chars_per_chunk = 180
        self.tts_piper_binary = "piper"
        self.tts_piper_model_fr = str(tmp_path / "fr.onnx")
        self.tts_piper_model_en = str(tmp_path / "en.onnx")
        self.tts_piper_model_ar = str(tmp_path / "ar.onnx")


def test_tts_disabled_returns_none() -> None:
    service = TextToSpeechService(_DummySettings())
    assert service.synthesize("Bonjour", "fr") is None


@pytest.mark.parametrize(
    ("language", "expected_piper_attr"),
    [
        ("fr", "fr.onnx"),
        ("en", "en.onnx"),
        ("ar", "ar.onnx"),
        ("tn", "fr.onnx"),
    ],
)
def test_tts_available_routes_multilingual_languages(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    language: str,
    expected_piper_attr: str,
) -> None:
    requested: dict[str, object] = {}

    def fake_generate_audio(text: str, **kwargs):
        requested.update(kwargs)
        target = tmp_path / f"{language}.wav"
        target.write_bytes(b"wav")
        return str(target)

    monkeypatch.setattr(tts_module, "generate_audio", fake_generate_audio)

    service = TextToSpeechService(_EnabledSettings(tmp_path))
    result = service.synthesize("Bonjour", language)

    assert result and Path(result).exists()
    assert requested["language"] == language
    assert str(requested["piper_model_path"]).endswith(expected_piper_attr)


class _FakeChunkingTTS:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def tts_to_file(self, *, text: str, file_path: str) -> None:
        self.calls.append(text)
        _write_valid_wav(Path(file_path))


def test_tts_long_response_is_chunked(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeChunkingTTS()
    monkeypatch.setattr(tts_service, "_get_tts", lambda model_name, use_gpu: fake)

    long_text = " ".join(["Cette reponse vocale reste sure et lisible."] * 16)
    result = tts_service.generate_audio(
        long_text,
        output_dir=tmp_path,
        language="fr",
        max_chars_per_chunk=160,
    )

    assert result
    assert Path(result).exists()
    assert len(fake.calls) > 1


def test_tts_generation_exception_returns_none(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    class FailingTTS:
        def tts_to_file(self, *, text: str, file_path: str) -> None:
            raise RuntimeError("boom")

    monkeypatch.setattr(tts_service, "_get_tts", lambda model_name, use_gpu: FailingTTS())

    assert tts_service.generate_audio("Bonjour", output_dir=tmp_path, language="fr") is None


def test_voice_processor_tts_unavailable_is_non_fatal() -> None:
    class _State:
        settings = _DummySettings()
        stt_service = object()
        tts_service = TextToSpeechService(settings)

    processor = VoiceRequestProcessor(_State())
    assert asyncio.run(processor.generate_tts("Bonjour", language="fr")) is None


def test_voice_processor_tts_exception_is_non_fatal() -> None:
    class _EnabledNoopSettings(_DummySettings):
        def __init__(self) -> None:
            super().__init__()
            self.tts_enabled = True

    class _FailingTTS:
        async def asynthesize(self, text: str, language: str | None = None) -> str | None:
            raise RuntimeError("tts failed")

    class _State:
        settings = _EnabledNoopSettings()
        stt_service = object()
        tts_service = _FailingTTS()

    processor = VoiceRequestProcessor(_State())
    assert asyncio.run(processor.generate_tts("Bonjour", language="fr")) is None


def _write_valid_wav(path: Path) -> None:
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        wav_file.writeframes((0).to_bytes(2, byteorder="little", signed=True) * 160)
