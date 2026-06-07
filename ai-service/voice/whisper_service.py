from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from time import perf_counter

logger = logging.getLogger(__name__)

_MODEL_LOCK = RLock()
_MODEL_CACHE: dict[tuple[str, str, str, int, int, bool], object] = {}


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
    cpu_threads: int = 1,
    num_workers: int = 1,
    local_files_only: bool = True,
):
    key = (
        str(model_name or "base"),
        str(device or "cpu"),
        str(compute_type or "int8"),
        max(1, int(cpu_threads or 1)),
        max(1, int(num_workers or 1)),
        bool(local_files_only),
    )

    with _MODEL_LOCK:
        if key in _MODEL_CACHE:
            return _MODEL_CACHE[key]

        started = perf_counter()
        try:
            from faster_whisper import WhisperModel

            preferred_device = "cpu" if str(device).strip().lower() == "cpu" else "cpu"
            model_kwargs = {
                "device": preferred_device,
                "compute_type": compute_type,
                "cpu_threads": key[3],
                "num_workers": key[4],
                "local_files_only": key[5],
            }
            try:
                model = WhisperModel(
                    model_name,
                    **model_kwargs,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "whisper model unavailable model=%s device=%s local_only=%s error=%s",
                    model_name,
                    preferred_device,
                    key[5],
                    exc,
                )
                model = False
        except Exception as exc:  # noqa: BLE001
            logger.warning("faster-whisper unavailable: %s", exc)
            model = False

        _MODEL_CACHE[key] = model
        logger.info(
            "whisper_model_cache model=%s device=%s compute_type=%s cpu_threads=%s num_workers=%s local_only=%s ready=%s load_ms=%.2f",
            key[0],
            key[1],
            key[2],
            key[3],
            key[4],
            key[5],
            bool(model),
            (perf_counter() - started) * 1000,
        )
        return model


def preload_model(
    *,
    model_name: str = "base",
    device: str = "cpu",
    compute_type: str = "int8",
    cpu_threads: int = 1,
    num_workers: int = 1,
    local_files_only: bool = True,
) -> bool:
    return bool(
        _load_model(
            model_name=model_name,
            device=device,
            compute_type=compute_type,
            cpu_threads=cpu_threads,
            num_workers=num_workers,
            local_files_only=local_files_only,
        )
    )


def transcribe_audio_result(
    file_path: str | Path,
    *,
    model_name: str = "base",
    language: str | None = None,
    device: str = "cpu",
    compute_type: str = "int8",
    cpu_threads: int = 1,
    num_workers: int = 1,
    beam_size: int = 1,
    best_of: int = 1,
    vad_filter: bool = False,
    condition_on_previous_text: bool = False,
    local_files_only: bool = True,
) -> WhisperTranscriptionResult:
    model = _load_model(
        model_name=model_name,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
        num_workers=num_workers,
        local_files_only=local_files_only,
    )
    if not model:
        return WhisperTranscriptionResult(text="", error="stt_unavailable")

    try:
        segments, info = model.transcribe(
            str(file_path),
            language=language or None,
            vad_filter=vad_filter,
            beam_size=max(1, int(beam_size or 1)),
            best_of=max(1, int(best_of or 1)),
            temperature=0,
            condition_on_previous_text=bool(condition_on_previous_text),
            no_speech_threshold=0.6,
            vad_parameters={
                "threshold": 0.25,
                "min_speech_duration_ms": 100,
                "min_silence_duration_ms": 1600,
                "speech_pad_ms": 600,
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
