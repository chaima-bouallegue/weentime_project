from __future__ import annotations

import asyncio
import audioop
import logging
import os
import tempfile
import wave
from dataclasses import dataclass, field
from pathlib import Path
from time import perf_counter
from typing import Any

from config import Settings
from app.observability.tracing import log_event, start_span
from voice.audio_conversion import convert_to_wav
from voice.cleaner import SHORT_COMMANDS, clean_transcription as base_clean_transcription
from voice.vad import VadAnalysis, analyze_voice
from voice.whisper_service import transcribe_audio_result

logger = logging.getLogger(__name__)


class AudioConversionError(RuntimeError):
    pass


@dataclass(slots=True)
class VoiceProcessingResult:
    status: str
    raw_text: str | None = None
    cleaned_text: str | None = None
    language: str = "unknown"
    language_confidence: float = 0.0
    duration_seconds: float = 0.0
    detected_volume: float = 0.0
    peak_amplitude: int = 0
    vad_analysis: VadAnalysis | None = None
    wav_path: str | None = None
    error: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


def is_valid_audio(file_path: str | Path, min_size_bytes: int = 5000) -> bool:
    path = Path(file_path)
    return path.exists() and os.path.getsize(path) > min_size_bytes


def clean_transcription(
    text: str | None,
    *,
    min_words: int = 2,
    noise_phrases: list[str] | None = None,
) -> str | None:
    cleaned = base_clean_transcription(text)
    if not cleaned:
        return None

    words = [word for word in cleaned.split(" ") if word]
    if len(words) < min_words and cleaned not in SHORT_COMMANDS:
        return None

    lowered = cleaned.lower()
    if noise_phrases and any(phrase and phrase.lower() in lowered for phrase in noise_phrases):
        return None

    return cleaned


clean_transcript = clean_transcription


class SpeechToTextService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def process(self, audio_file: str | Path) -> VoiceProcessingResult:
        source_path = Path(audio_file)
        source_size = source_path.stat().st_size if source_path.exists() else 0
        if source_size <= 0:
            logger.info("voice_rejected path=%s reason=empty_file", source_path)
            return VoiceProcessingResult(status="no_input", error="empty_audio")

        if not is_valid_audio(source_path, self.settings.voice_min_input_bytes):
            logger.info(
                "voice_rejected path=%s reason=file_too_small size_bytes=%s",
                source_path,
                source_size,
            )
            return VoiceProcessingResult(status="no_input", error="short_audio")

        wav_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as handle:
                wav_path = Path(handle.name)

            with start_span("voice.audio_convert", {"size_bytes": source_size}):
                try:
                    convert_to_wav(
                        source_path,
                        wav_path,
                        ffmpeg_binary=self.settings.ffmpeg_binary,
                    )
                    log_event("voice.audio_convert", metadata={"size_bytes": source_size, "status": "success"})
                except Exception as exc:  # noqa: BLE001
                    log_event("voice.audio_convert", metadata={"size_bytes": source_size, "status": "failed"})
                    raise AudioConversionError("conversion_failed") from exc

            duration_seconds, detected_volume, peak_amplitude = self._read_audio_metrics(wav_path)
            with start_span(
                "voice.vad",
                {
                    "duration_seconds": duration_seconds,
                    "detected_volume": detected_volume,
                    "peak_amplitude": peak_amplitude,
                },
            ):
                vad_analysis = analyze_voice(
                    wav_path,
                    aggressiveness=self.settings.voice_vad_aggressiveness,
                    frame_ms=self.settings.voice_frame_ms,
                    min_voiced_ms=self.settings.voice_min_voiced_ms,
                )

            logger.info(
                "voice_pipeline_metrics path=%s size_bytes=%s duration_seconds=%.3f detected_volume=%.3f peak_amplitude=%s voiced_ratio=%.3f voiced_duration_ms=%s",
                source_path,
                source_size,
                duration_seconds,
                detected_volume,
                peak_amplitude,
                vad_analysis.voiced_ratio if vad_analysis else 0.0,
                vad_analysis.voiced_duration_ms if vad_analysis else 0,
            )

            short_command_candidate = False
            if duration_seconds < self.settings.voice_min_duration_seconds:
                short_command_candidate = self._allows_short_command_audio(
                    duration_seconds=duration_seconds,
                    detected_volume=detected_volume,
                    peak_amplitude=peak_amplitude,
                    vad_analysis=vad_analysis,
                )
            if duration_seconds < self.settings.voice_min_duration_seconds and not short_command_candidate:
                return VoiceProcessingResult(
                    status="no_input",
                    error="short_audio",
                    duration_seconds=duration_seconds,
                    detected_volume=detected_volume,
                    peak_amplitude=peak_amplitude,
                    vad_analysis=vad_analysis,
                    wav_path=str(wav_path),
                )

            if not self._has_meaningful_audio(
                detected_volume=detected_volume,
                peak_amplitude=peak_amplitude,
            ):
                return VoiceProcessingResult(
                    status="no_input",
                    error="silent_audio",
                    duration_seconds=duration_seconds,
                    detected_volume=detected_volume,
                    peak_amplitude=peak_amplitude,
                    vad_analysis=vad_analysis,
                    wav_path=str(wav_path),
                )

            if vad_analysis.used_vad and not vad_analysis.has_speech:
                logger.info(
                    "voice_vad_no_speech_but_signal_present path=%s duration_seconds=%.3f detected_volume=%.3f peak_amplitude=%s",
                    source_path,
                    duration_seconds,
                    detected_volume,
                    peak_amplitude,
                )

            stt_started = perf_counter()
            with start_span(
                "voice.stt",
                {
                    "stt_model": self.settings.stt_model,
                    "language": "auto",
                    "duration_seconds": duration_seconds,
                },
            ):
                transcription_result = transcribe_audio_result(
                    wav_path,
                    model_name=self.settings.stt_model,
                    language=None,
                    device=self.settings.stt_device,
                    compute_type="int8",
                )
                if transcription_result.error == "stt_unavailable":
                    return VoiceProcessingResult(
                        status="unavailable",
                        language=transcription_result.language,
                        language_confidence=transcription_result.language_probability,
                        duration_seconds=duration_seconds,
                        detected_volume=detected_volume,
                        peak_amplitude=peak_amplitude,
                        vad_analysis=vad_analysis,
                        wav_path=str(wav_path),
                        error="stt_unavailable",
                    )
                if transcription_result.error:
                    return VoiceProcessingResult(
                        status="error",
                        language=transcription_result.language,
                        language_confidence=transcription_result.language_probability,
                        duration_seconds=duration_seconds,
                        detected_volume=detected_volume,
                        peak_amplitude=peak_amplitude,
                        vad_analysis=vad_analysis,
                        wav_path=str(wav_path),
                        error=transcription_result.error,
                    )
                raw_text = transcription_result.text
            with start_span("voice.cleaner", {"raw_empty": not bool(raw_text)}):
                cleaned_text = clean_transcription(
                    raw_text,
                    min_words=self.settings.voice_min_words,
                    noise_phrases=self.settings.voice_noise_phrases,
                )
                log_event(
                    "voice.cleaner",
                    metadata={
                        "status": "success" if cleaned_text else "retry",
                        "cleaned_empty": not bool(cleaned_text),
                        "detected_language": transcription_result.language,
                        "confidence": transcription_result.language_probability,
                        "duration_seconds": duration_seconds,
                    },
                )
            log_event(
                "voice.stt.finished",
                output={
                    "cleaned_empty": not bool(cleaned_text),
                    "raw_length": len(raw_text or ""),
                    "language": transcription_result.language,
                    "language_confidence": transcription_result.language_probability,
                },
                metadata={
                    "latency_ms": round((perf_counter() - stt_started) * 1000, 2),
                    "language": transcription_result.language,
                    "language_confidence": transcription_result.language_probability,
                    "stt_model": self.settings.stt_model,
                    "vad_ratio": vad_analysis.voiced_ratio if vad_analysis else 0.0,
                },
            )

            logger.info(
                "voice_pipeline_transcription path=%s language=%s confidence=%.4f length=%s raw=%r cleaned=%r",
                source_path,
                transcription_result.language,
                transcription_result.language_probability,
                len(raw_text or ""),
                raw_text,
                cleaned_text,
            )

            if not cleaned_text:
                return VoiceProcessingResult(
                    status="retry",
                    raw_text=raw_text,
                    language=transcription_result.language,
                    language_confidence=transcription_result.language_probability,
                    duration_seconds=duration_seconds,
                    detected_volume=detected_volume,
                    peak_amplitude=peak_amplitude,
                    vad_analysis=vad_analysis,
                    wav_path=str(wav_path),
                    error="unclean_transcription",
                )

            return VoiceProcessingResult(
                status="success",
                raw_text=raw_text,
                cleaned_text=cleaned_text,
                language=transcription_result.language,
                language_confidence=transcription_result.language_probability,
                duration_seconds=duration_seconds,
                detected_volume=detected_volume,
                peak_amplitude=peak_amplitude,
                vad_analysis=vad_analysis,
                wav_path=str(wav_path),
                details={"short_command_candidate": short_command_candidate},
            )
        except AudioConversionError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("voice_pipeline_failed path=%s error=%s", source_path, exc)
            return VoiceProcessingResult(status="error", error="audio_processing_failed")
        finally:
            if wav_path is not None:
                wav_path.unlink(missing_ok=True)

    async def aprocess(self, audio_file: str | Path) -> VoiceProcessingResult:
        try:
            return await asyncio.to_thread(self.process, audio_file)
        except asyncio.CancelledError:
            logger.info("voice_pipeline_cancelled path=%s", audio_file)
            return VoiceProcessingResult(status="cancelled", error="audio_cancelled")

    def transcribe(self, audio_file: str | Path) -> str | None:
        result = self.process(audio_file)
        return result.cleaned_text if result.status == "success" else None

    async def atranscribe(self, audio_file: str | Path) -> str | None:
        result = await self.aprocess(audio_file)
        return result.cleaned_text if result.status == "success" else None

    def _read_audio_metrics(self, wav_path: Path) -> tuple[float, float, int]:
        try:
            with wave.open(str(wav_path), "rb") as wav_file:
                frame_count = wav_file.getnframes()
                sample_rate = wav_file.getframerate()
                duration_seconds = frame_count / sample_rate if sample_rate else 0.0
                frames = wav_file.readframes(frame_count)
                if not frames:
                    return duration_seconds, 0.0, 0
                peak_amplitude = int(audioop.max(frames, 2))
                rms = float(audioop.rms(frames, 2))
                detected_volume = (rms / 32767.0) * 100.0
                return duration_seconds, detected_volume, peak_amplitude
        except Exception as exc:  # noqa: BLE001
            logger.warning("audio metrics failed path=%s error=%s", wav_path, exc)
            return 0.0, 0.0, 0

    def _has_meaningful_audio(
        self,
        *,
        detected_volume: float,
        peak_amplitude: int,
    ) -> bool:
        return (
            detected_volume >= self.settings.voice_min_detected_volume
            or peak_amplitude >= self.settings.voice_min_peak_amplitude
        )

    def _allows_short_command_audio(
        self,
        *,
        duration_seconds: float,
        detected_volume: float,
        peak_amplitude: int,
        vad_analysis: VadAnalysis | None,
    ) -> bool:
        minimum = float(getattr(self.settings, "voice_short_command_min_duration_seconds", 0.45))
        if duration_seconds < minimum:
            return False
        if not self._has_meaningful_audio(detected_volume=detected_volume, peak_amplitude=peak_amplitude):
            return False
        if vad_analysis is not None and vad_analysis.used_vad and vad_analysis.has_speech:
            return True
        # WebRTC VAD is intentionally not authoritative for short HR commands;
        # allow a strong signal to reach Whisper instead of producing "no input".
        return (
            detected_volume >= self.settings.voice_min_detected_volume * 2
            or peak_amplitude >= self.settings.voice_min_peak_amplitude * 3
        )
