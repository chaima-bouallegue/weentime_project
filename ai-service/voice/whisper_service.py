from __future__ import annotations

import logging
from pathlib import Path
from threading import RLock

logger = logging.getLogger(__name__)

_MODEL = None
_MODEL_INITIALIZED = False
_MODEL_LOCK = RLock()


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


def transcribe_audio(
    file_path: str | Path,
    *,
    model_name: str = "base",
    language: str = "fr",
    device: str = "cpu",
    compute_type: str = "int8",
) -> str:
    model = _load_model(
        model_name=model_name,
        device=device,
        compute_type=compute_type,
    )
    if not model:
        return ""

    segments, _ = model.transcribe(
        str(file_path),
        language=language or None,
        vad_filter=True,
        beam_size=5,
        temperature=0,
        condition_on_previous_text=False,
        vad_parameters={
            "min_silence_duration_ms": 800,
            "speech_pad_ms": 200,
        },
    )
    text = " ".join(
        segment.text.strip()
        for segment in segments
        if getattr(segment, "text", "").strip()
    )
    return text.strip()


def transcribe_partial(
    audio_path: str | Path,
) -> str:
    model = _load_model()
    if not model:
        return ""

    segments, _ = model.transcribe(
        str(audio_path),
        beam_size=1,
        best_of=1,
        temperature=0.2,
        condition_on_previous_text=False,
        vad_filter=False,
    )
    return " ".join(
        segment.text.strip()
        for segment in segments
        if getattr(segment, "text", "").strip()
    ).strip()
