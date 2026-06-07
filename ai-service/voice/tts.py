from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from config import Settings
from voice.tts_service import generate_audio, supported_tts_language

logger = logging.getLogger(__name__)


class TextToSpeechService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def preload(self) -> bool:
        if not self.settings.tts_enabled:
            return False
        try:
            return bool(self.synthesize("Bonjour.", "fr"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("tts_preload_failed error=%s", exc)
            return False

    async def apreload(self) -> bool:
        return await asyncio.to_thread(self.preload)

    def synthesize(self, text: str, language: str | None = None) -> str | None:
        if not self.settings.tts_enabled:
            return None
        try:
            return generate_audio(
                text,
                output_dir=self.settings.generated_audio_dir,
                model_name=None if language else self.settings.tts_model,
                language=language,
                use_gpu=self.settings.tts_use_gpu,
                max_chars_per_chunk=getattr(self.settings, "tts_max_chars_per_chunk", 420),
                piper_binary=getattr(self.settings, "tts_piper_binary", None),
                piper_model_path=self._piper_model_for_language(language),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("tts_generation_failed language=%s error=%s", language or "auto", exc)
            return None

    async def asynthesize(self, text: str, language: str | None = None) -> str | None:
        return await asyncio.to_thread(self.synthesize, text, language)

    def _piper_model_for_language(self, language: str | None) -> Path | None:
        resolved = supported_tts_language(language)
        attr = {
            "fr": "tts_piper_model_fr",
            "en": "tts_piper_model_en",
            "ar": "tts_piper_model_ar",
        }.get(resolved)
        value = getattr(self.settings, attr or "", None)
        return Path(value) if value else None
