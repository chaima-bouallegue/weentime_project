from __future__ import annotations

import hashlib
import logging
import shutil
import subprocess
import wave
from contextlib import closing
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
_DEFAULT_MAX_CHARS_PER_CHUNK = 420


def supported_tts_language(language: str | None) -> str:
    value = (language or "fr").strip().lower()
    if value.startswith("ar"):
        return "ar"
    if value.startswith("en"):
        return "en"
    if value in {"tn", "tounsi", "franco-arabic", "franco_arabic"}:
        return "fr"
    return "fr"


def _model_for_language(language: str | None, model_name: str | None = None) -> tuple[str, str]:
    resolved_language = supported_tts_language(language)
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


def _split_text_for_tts(text: str, *, max_chars: int = _DEFAULT_MAX_CHARS_PER_CHUNK) -> list[str]:
    normalized = " ".join((text or "").split())
    if not normalized:
        return []

    limit = max(120, int(max_chars or _DEFAULT_MAX_CHARS_PER_CHUNK))
    if len(normalized) <= limit:
        return [normalized]

    chunks: list[str] = []
    remaining = normalized
    while len(remaining) > limit:
        window = remaining[:limit]
        split_at = max(window.rfind(". "), window.rfind("? "), window.rfind("! "), window.rfind("; "), window.rfind(", "))
        if split_at < int(limit * 0.45):
            split_at = window.rfind(" ")
        if split_at < int(limit * 0.45):
            split_at = limit
        chunk = remaining[:split_at].strip(" ,;")
        if chunk:
            chunks.append(chunk)
        remaining = remaining[split_at:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


def _concatenate_wav_chunks(chunk_paths: list[Path], target_path: Path) -> bool:
    if not chunk_paths:
        return False
    try:
        with closing(wave.open(str(chunk_paths[0]), "rb")) as first:
            params = first.getparams()
            frames = [first.readframes(first.getnframes())]
        for chunk_path in chunk_paths[1:]:
            with closing(wave.open(str(chunk_path), "rb")) as current:
                if current.getparams()[:3] != params[:3]:
                    logger.warning("TTS chunk params mismatch for %s", chunk_path)
                    return False
                frames.append(current.readframes(current.getnframes()))
        with closing(wave.open(str(target_path), "wb")) as output:
            output.setparams(params)
            for frame_data in frames:
                output.writeframes(frame_data)
        return target_path.exists() and target_path.stat().st_size > 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to concatenate TTS chunks: %s", exc)
        return False


def _write_coqui_audio(engine: object, text: str, target_path: Path, *, max_chars_per_chunk: int) -> bool:
    chunks = _split_text_for_tts(text, max_chars=max_chars_per_chunk)
    if not chunks:
        return False
    if len(chunks) == 1:
        engine.tts_to_file(text=chunks[0], file_path=str(target_path))
        return target_path.exists() and target_path.stat().st_size > 0

    chunk_paths = [target_path.with_name(f"{target_path.stem}.part{i}{target_path.suffix}") for i in range(len(chunks))]
    try:
        for chunk, chunk_path in zip(chunks, chunk_paths, strict=True):
            engine.tts_to_file(text=chunk, file_path=str(chunk_path))
            if not chunk_path.exists() or chunk_path.stat().st_size == 0:
                return False
        return _concatenate_wav_chunks(chunk_paths, target_path)
    finally:
        for chunk_path in chunk_paths:
            chunk_path.unlink(missing_ok=True)


def _generate_piper_audio(
    text: str,
    target_path: Path,
    *,
    piper_binary: str | None,
    piper_model_path: str | Path | None,
) -> bool:
    if not piper_binary or not piper_model_path:
        return False
    binary = shutil.which(piper_binary) if not Path(piper_binary).is_file() else str(Path(piper_binary))
    model_path = Path(piper_model_path)
    if not binary or not model_path.is_file():
        return False
    try:
        result = subprocess.run(
            [binary, "--model", str(model_path), "--output_file", str(target_path)],
            input=text,
            text=True,
            capture_output=True,
            timeout=20,
            check=False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Piper TTS failed before generation: %s", exc)
        return False
    if result.returncode != 0:
        logger.warning("Piper TTS unavailable: %s", (result.stderr or "").strip()[:300])
        return False
    return target_path.exists() and target_path.stat().st_size > 0


def generate_audio(
    text,
    *,
    output_dir: str | Path | None = None,
    model_name: str | None = None,
    language: str | None = None,
    use_gpu: bool = False,
    max_chars_per_chunk: int = _DEFAULT_MAX_CHARS_PER_CHUNK,
    piper_binary: str | None = None,
    piper_model_path: str | Path | None = None,
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
    if engine:
        try:
            with _TTS_LOCK:
                generated = _write_coqui_audio(
                    engine,
                    normalized,
                    target_path,
                    max_chars_per_chunk=max_chars_per_chunk,
                )
            if generated:
                logger.info(
                    "tts_generated language=%s model=%s text_length=%s path=%s",
                    resolved_language,
                    resolved_model,
                    len(normalized),
                    target_path,
                )
                return str(target_path)
        except Exception as exc:  # noqa: BLE001
            target_path.unlink(missing_ok=True)
            logger.warning("Coqui TTS generation failed for model=%s: %s", resolved_model, exc)

    if _generate_piper_audio(
        normalized,
        target_path,
        piper_binary=piper_binary,
        piper_model_path=piper_model_path,
    ):
        logger.info(
            "tts_generated language=%s model=piper text_length=%s path=%s",
            resolved_language,
            len(normalized),
            target_path,
        )
        return str(target_path)

    target_path.unlink(missing_ok=True)
    return None
