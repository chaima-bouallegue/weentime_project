from __future__ import annotations

import asyncio
import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from time import perf_counter
from typing import Any

from fastapi import UploadFile

from app.context.current_user import CurrentUserContext
from app.nlp.language_detector import detect_language, resolve_response_language
from app.observability.metrics import record_voice_event
from app.observability.tracing import log_error, log_event, start_span
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
    timings: dict[str, float] = field(default_factory=dict)


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
        total_started = perf_counter()
        audio_store_started = perf_counter()
        with start_span("voice.audio.store", {"content_type": upload.content_type}):
            stored = await self.store_upload(upload)
            audio_store_duration_ms = round((perf_counter() - audio_store_started) * 1000, 2)
            log_event(
                "voice.audio.store",
                metadata={
                    "size_bytes": stored.size_bytes,
                    "status": "stored",
                },
            )
            record_voice_event(stage="audio_store", duration_ms=audio_store_duration_ms, success=True)
        with start_span("voice.audio.validate", {"content_type": upload.content_type, "size_bytes": stored.size_bytes}):
            log_event(
                "voice.audio.validate",
                metadata={
                    "status": "accepted" if stored.size_bytes > 0 else "empty",
                    "size_bytes": stored.size_bytes,
                },
            )

        stt_started = perf_counter()
        with start_span("voice.stt", {"size_bytes": stored.size_bytes}):
            stt_result = await self.stt_service.aprocess(stored.path)
            stt_duration_ms = round((perf_counter() - stt_started) * 1000, 2)
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
            record_voice_event(
                stage="stt",
                language=stt_result.language,
                duration_ms=stt_duration_ms,
                audio_duration_seconds=stt_result.duration_seconds,
                fallback_path=stt_result.error if stt_result.status != "success" else None,
                success=stt_result.status == "success",
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
            detected_language = self._resolve_language(
                transcript,
                stt_result.language,
                language_hint,
                stt_result.language_confidence,
                preferred_languages=getattr(self.settings, "voice_preferred_languages", ["fr", "ar", "en"]),
            )

        timings: dict[str, float] = {}
        stt_timings = stt_result.details.get("timings") if isinstance(stt_result.details, dict) else None
        if isinstance(stt_timings, dict):
            timings.update({str(key): float(value) for key, value in stt_timings.items() if isinstance(value, (int, float))})
        timings["audio_store_ms"] = audio_store_duration_ms
        timings["stt_service_ms"] = stt_duration_ms
        timings["stt_ms"] = stt_duration_ms
        timings["total_voice_processing_ms"] = round((perf_counter() - total_started) * 1000, 2)
        return VoiceProcessorResult(
            stt=stt_result,
            stored_audio=stored,
            detected_language=detected_language,
            timings=timings,
        )

    async def store_upload(self, upload: UploadFile) -> StoredAudio:
        request_id = uuid.uuid4().hex
        directory = self.settings.temp_audio_dir / "v2_voice" / request_id
        directory.mkdir(parents=True, exist_ok=True)
        suffix = Path(upload.filename or "audio.webm").suffix or ".webm"
        target = directory / f"input{suffix}"
        payload = await upload.read()
        await asyncio.to_thread(target.write_bytes, payload)
        return StoredAudio(path=target, directory=directory, size_bytes=len(payload))

    async def generate_tts(self, text: str, *, language: str | None = None) -> str | None:
        if not text or not self.settings.tts_enabled:
            record_voice_event(stage="tts", language=language, fallback_path="tts_disabled_or_empty", success=False)
            return None
        tts_started = perf_counter()
        with start_span("voice.tts", {"text_length": len(text), "language": language or "auto"}):
            try:
                audio_path = await self.tts_service.asynthesize(text, language)
            except Exception as exc:  # noqa: BLE001
                audio_path = None
                log_error("voice.tts.failed", exc)
        tts_duration_ms = round((perf_counter() - tts_started) * 1000, 2)
        log_event(
            "voice.tts",
            metadata={
                "status": "generated" if audio_path else "skipped",
                "detected_language": language,
                "cleaned_empty": False,
                "tts_generation_ms": tts_duration_ms,
            },
        )
        record_voice_event(
            stage="tts",
            language=language,
            duration_ms=tts_duration_ms,
            fallback_path=None if audio_path else "tts_unavailable",
            success=bool(audio_path),
        )
        if not audio_path:
            return None
        return f"{self.settings.public_base_url}/audio/files/{Path(audio_path).name}"

    def cleanup(self, stored: StoredAudio | None) -> None:
        if stored is not None:
            shutil.rmtree(stored.directory, ignore_errors=True)

    @staticmethod
    def _resolve_language(
        transcript: str,
        stt_language: str | None,
        language_hint: str | None,
        language_confidence: float = 0.0,
        *,
        preferred_languages: list[str] | None = None,
    ) -> str:
        preferred = [_canonical_voice_language(item) for item in (preferred_languages or ["fr", "ar", "en"])]
        preferred = [item for item in preferred if item]
        transcript_language = detect_language(transcript)
        if transcript_language in {"tn", "ar"}:
            return transcript_language

        stt_detected = _canonical_voice_language(stt_language)
        confidence = float(language_confidence or 0.0)
        if transcript_language == "fr" and (confidence < 0.70 or stt_detected in {None, "fr", "en"}):
            return "fr"
        if stt_detected and confidence >= 0.70:
            return resolve_response_language(transcript, {"language": stt_detected}, stt_language=stt_detected)

        hinted = _canonical_voice_language(language_hint)
        if hinted:
            return resolve_response_language(transcript, {"language": hinted}, stt_language=hinted)
        return transcript_language if transcript_language in {"fr", "en", "ar", "tn"} else (preferred[0] or "fr")


def _canonical_voice_language(value: str | None) -> str | None:
    normalized = (value or "").strip().lower()
    if not normalized:
        return None
    if normalized in {"tn", "tounsi", "franco-arabic", "franco_arabic"}:
        return "tn"
    if normalized.startswith("ar"):
        return "ar"
    if normalized.startswith("en"):
        return "en"
    if normalized.startswith("fr"):
        return "fr"
    return None
