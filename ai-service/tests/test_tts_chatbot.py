from __future__ import annotations

import asyncio

from config import Settings
from voice.tts import TextToSpeechService
from app.voice_pipeline.voice_request_processor import VoiceRequestProcessor


class _DummySettings(Settings):
    def __init__(self) -> None:
        super().__init__()
        self.tts_enabled = False


def test_tts_disabled_returns_none() -> None:
    service = TextToSpeechService(_DummySettings())
    assert service.synthesize("Bonjour", "fr") is None


def test_voice_processor_tts_unavailable_is_non_fatal() -> None:
    class _State:
        settings = _DummySettings()
        stt_service = object()
        tts_service = TextToSpeechService(settings)

    processor = VoiceRequestProcessor(_State())
    assert asyncio.run(processor.generate_tts("Bonjour", language="fr")) is None
