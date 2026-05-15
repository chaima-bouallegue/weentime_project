from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from threading import RLock

logger = logging.getLogger(__name__)

_MODEL = None
_MODEL_INITIALIZED = False
_MODEL_LOCK = RLock()


@dataclass(frozen=True, slots=True)
class WhisperTranscriptionResult:
    text: str
    language: str = "unknown"
    language_probability: float = 0.0
    error: str | None = None


def _load_model(
    *,
    model_name: str = "base",
    device: str = "cpu",
    compute_type: str = "int8",
):
    global _MODEL, _MODEL_INITIALIZED

    with _MODEL_LOCK:
        if _MODEL_INITIALIZED:
            return _MODEL

        _MODEL_INITIALIZED = True
        try:
            from faster_whisper import WhisperModel

            preferred_device = "cpu" if str(device).strip().lower() == "cpu" else "cpu"
            try:
                _MODEL = WhisperModel(
                    model_name,
                    device=preferred_device,
                    compute_type=compute_type,
                )
            except Exception as exc:  # noqa: BLE001
                if preferred_device == "cpu":
                    logger.warning("whisper cpu unavailable, fallback cpu: %s", exc)
                    _MODEL = WhisperModel(
                        model_name,
                        device="cpu",
                        compute_type=compute_type,
                    )
                else:
                    raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("faster-whisper unavailable: %s", exc)
            _MODEL = False

        return _MODEL


def transcribe_audio_result(
    file_path: str | Path,
    *,
    model_name: str = "base",
    language: str | None = None,
    device: str = "cpu",
    compute_type: str = "int8",
) -> WhisperTranscriptionResult:
    model = _load_model(
        model_name=model_name,
        device=device,
        compute_type=compute_type,
    )
    if not model:
        return WhisperTranscriptionResult(text="", error="stt_unavailable")

    try:
        segments, info = model.transcribe(
            str(file_path),
            language=language or None,
            vad_filter=True,
            beam_size=5,
            temperature=0,
            condition_on_previous_text=False,
            no_speech_threshold=0.75,
            vad_parameters={
                "threshold": 0.35,
                "min_speech_duration_ms": 100,
                "min_silence_duration_ms": 1200,
                "speech_pad_ms": 400,
            },
        )
        text = " ".join(
            segment.text.strip()
            for segment in segments
            if getattr(segment, "text", "").strip()
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("whisper_transcription_failed path=%s error=%s", file_path, exc.__class__.__name__)
        return WhisperTranscriptionResult(text="", error="stt_failed")
    detected_language = str(getattr(info, "language", "") or "unknown")
    language_probability = float(getattr(info, "language_probability", 0.0) or 0.0)
    logger.info(
        "whisper_transcription language=%s confidence=%.4f length=%s",
        detected_language,
        language_probability,
        len(text.strip()),
    )
    return WhisperTranscriptionResult(
        text=text.strip(),
        language=detected_language,
        language_probability=language_probability,
    )


def transcribe_audio(
    file_path: str | Path,
    *,
    model_name: str = "base",
    language: str | None = None,
    device: str = "cpu",
    compute_type: str = "int8",
) -> str:
    return transcribe_audio_result(
        file_path,
        model_name=model_name,
        language=language,
        device=device,
        compute_type=compute_type,
    ).text
