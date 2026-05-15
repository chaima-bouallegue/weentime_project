from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from threading import RLock

logger = logging.getLogger(__name__)

TTS_MODELS = {
    "fr": "tts_models/fr/css10/vits",
    "en": "tts_models/en/ljspeech/tacotron2-DDC",
    "ar": "tts_models/ar/cv/vits",
}

_TTS_CACHE: dict[tuple[str, bool], object] = {}
_TTS_LOCK = RLock()


def _supported_language(language: str | None) -> str:
    value = (language or "fr").strip().lower()
    if value.startswith("ar"):
        return "ar"
    if value.startswith("en"):
        return "en"
    if value in {"tn", "tounsi", "franco-arabic", "franco_arabic"}:
        return "fr"
    return "fr"


def _model_for_language(language: str | None, model_name: str | None = None) -> tuple[str, str]:
    resolved_language = _supported_language(language)
    return resolved_language, model_name or TTS_MODELS[resolved_language]


def _get_tts(model_name: str, use_gpu: bool):
    desired_key = (model_name, bool(use_gpu))
    with _TTS_LOCK:
        if desired_key in _TTS_CACHE:
            return _TTS_CACHE[desired_key]

        try:
            from TTS.api import TTS

            engine = TTS(
                model_name=model_name,
                progress_bar=False,
                gpu=use_gpu,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Coqui TTS unavailable for model=%s: %s", model_name, exc)
            engine = False

        _TTS_CACHE[desired_key] = engine
        return engine


def _audio_cache_path(output_dir: Path, text: str, language: str) -> Path:
    digest = hashlib.sha256(f"{language}:{text}".encode("utf-8")).hexdigest()[:24]
    return output_dir / f"response_{language}_{digest}.wav"


def generate_audio(
    text,
    *,
    output_dir: str | Path | None = None,
    model_name: str | None = None,
    language: str | None = None,
    use_gpu: bool = False,
):
    normalized = (text or "").strip()
    if not normalized:
        return None

    resolved_language, resolved_model = _model_for_language(language, model_name)
    target_dir = Path(output_dir or Path(__file__).resolve().parents[1] / "generated_audio")
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = _audio_cache_path(target_dir, normalized, resolved_language)
    if target_path.exists() and target_path.stat().st_size > 0:
        return str(target_path)

    engine = _get_tts(resolved_model, use_gpu)
    if not engine:
        return None

    with _TTS_LOCK:
        engine.tts_to_file(text=normalized, file_path=str(target_path))

    if not target_path.exists() or target_path.stat().st_size == 0:
        return None

    logger.info(
        "tts_generated language=%s model=%s text_length=%s path=%s",
        resolved_language,
        resolved_model,
        len(normalized),
        target_path,
    )
    return str(target_path)
