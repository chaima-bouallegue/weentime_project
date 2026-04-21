from __future__ import annotations

import asyncio

from config import Settings
from voice.tts_service import generate_audio


class TextToSpeechService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def synthesize(self, text: str) -> str | None:
        if not self.settings.tts_enabled:
            return None
        return generate_audio(
            text,
            output_dir=self.settings.generated_audio_dir,
            model_name=self.settings.tts_model,
            use_gpu=self.settings.tts_use_gpu,
        )

    async def asynthesize(self, text: str) -> str | None:
        return await asyncio.to_thread(self.synthesize, text)
