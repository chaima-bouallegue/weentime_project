from __future__ import annotations

import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from app.context.current_user import CurrentUserContext
from app.nlp.language_detector import detect_language
from app.observability.tracing import log_event, start_span
from voice.stt import VoiceProcessingResult


@dataclass(slots=True)
class StoredAudio:
    path: Path
    directory: Path
    size_bytes: int


@dataclass(slots=True)
class VoiceProcessorResult:
    stt: VoiceProcessingResult
    stored_audio: StoredAudio
    detected_language: str


class VoiceRequestProcessor:
    def __init__(self, app_state: Any) -> None:
        self.app_state = app_state
        self.settings = app_state.settings
        self.stt_service = app_state.stt_service
        self.tts_service = app_state.tts_service

    async def process_upload(
        self,
        upload: UploadFile,
        *,
        context: CurrentUserContext,
        language_hint: str | None = None,
    ) -> VoiceProcessorResult:
        with start_span("voice.audio.store", {"content_type": upload.content_type}):
            stored = await self.store_upload(upload)
            log_event(
                "voice.audio.store",
                metadata={
                    "size_bytes": stored.size_bytes,
                    "status": "stored",
                },
            )
        with start_span("voice.audio.validate", {"content_type": upload.content_type, "size_bytes": stored.size_bytes}):
            log_event(
                "voice.audio.validate",
                metadata={
                    "status": "accepted" if stored.size_bytes > 0 else "empty",
                    "size_bytes": stored.size_bytes,
                },
            )

        with start_span("voice.stt", {"size_bytes": stored.size_bytes}):
            stt_result = await self.stt_service.aprocess(stored.path)
            log_event(
                "voice.stt",
                metadata={
                    "duration_seconds": stt_result.duration_seconds,
                    "size_bytes": stored.size_bytes,
                    "detected_language": stt_result.language,
                    "confidence": stt_result.language_confidence,
                    "status": stt_result.status,
                    "cleaned_empty": not bool(stt_result.cleaned_text),
                },
            )

        with start_span(
            "voice.cleaner",
            {
                "raw_empty": not bool(stt_result.raw_text),
                "cleaned_empty": not bool(stt_result.cleaned_text),
                "status": stt_result.status,
            },
        ):
            transcript = stt_result.cleaned_text or stt_result.raw_text or ""
            log_event(
                "voice.cleaner",
                metadata={
                    "status": stt_result.status,
                    "cleaned_empty": not bool(stt_result.cleaned_text),
                    "text_length": len(transcript),
                },
            )
        with start_span("voice.language.detect", {"stt_language": stt_result.language, "language_hint": language_hint}):
            detected_language = self._resolve_language(transcript, stt_result.language, language_hint)

        return VoiceProcessorResult(stt=stt_result, stored_audio=stored, detected_language=detected_language)

    async def store_upload(self, upload: UploadFile) -> StoredAudio:
        request_id = uuid.uuid4().hex
        directory = self.settings.temp_audio_dir / "v2_voice" / request_id
        directory.mkdir(parents=True, exist_ok=True)
        suffix = Path(upload.filename or "audio.webm").suffix or ".webm"
        target = directory / f"input{suffix}"
        payload = await upload.read()
        target.write_bytes(payload)
        return StoredAudio(path=target, directory=directory, size_bytes=len(payload))

    async def generate_tts(self, text: str, *, language: str | None = None) -> str | None:
        if not text or not self.settings.tts_enabled:
            return None
        with start_span("voice.tts", {"text_length": len(text), "language": language or "auto"}):
            audio_path = await self.tts_service.asynthesize(text, language)
        log_event(
            "voice.tts",
            metadata={
                "status": "generated" if audio_path else "skipped",
                "detected_language": language,
                "cleaned_empty": False,
            },
        )
        if not audio_path:
            return None
        return f"{self.settings.public_base_url}/audio/files/{Path(audio_path).name}"

    def cleanup(self, stored: StoredAudio | None) -> None:
        if stored is not None:
            shutil.rmtree(stored.directory, ignore_errors=True)

    @staticmethod
    def _resolve_language(transcript: str, stt_language: str | None, language_hint: str | None) -> str:
        for candidate in (language_hint, stt_language):
            value = (candidate or "").strip().lower()
            if value.startswith("ar"):
                return "ar"
            if value.startswith("en"):
                return "en"
            if value.startswith("fr"):
                return "fr"
        return detect_language(transcript)
