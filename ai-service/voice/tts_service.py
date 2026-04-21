from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from threading import RLock

logger = logging.getLogger(__name__)

_TTS = None
_TTS_KEY: tuple[str, bool] | None = None
_TTS_INITIALIZED = False
_TTS_LOCK = RLock()


def _get_tts(model_name: str, use_gpu: bool):
    global _TTS, _TTS_KEY, _TTS_INITIALIZED

    with _TTS_LOCK:
        desired_key = (model_name, bool(use_gpu))
        if _TTS_INITIALIZED and _TTS_KEY == desired_key:
            return _TTS

        try:
            from TTS.api import TTS

            _TTS = TTS(
                model_name=model_name,
                progress_bar=False,
                gpu=use_gpu,
            )
            _TTS_KEY = desired_key
            _TTS_INITIALIZED = True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Coqui TTS unavailable: %s", exc)
            _TTS = False
            _TTS_KEY = desired_key
            _TTS_INITIALIZED = True

        return _TTS


def generate_audio(
    text,
    *,
    output_dir: str | Path | None = None,
    model_name: str = "tts_models/fr/css10/vits",
    use_gpu: bool = False,
):
    normalized = (text or "").strip()
    if not normalized:
        return None

    engine = _get_tts(model_name, use_gpu)
    if not engine:
        return None

    target_dir = Path(output_dir or Path(__file__).resolve().parents[1] / "generated_audio")
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"response_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}.wav"

    with _TTS_LOCK:
        engine.tts_to_file(text=normalized, file_path=str(target_path))

    if not target_path.exists() or target_path.stat().st_size == 0:
        return None

    return str(target_path)
