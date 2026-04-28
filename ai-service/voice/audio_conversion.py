from __future__ import annotations

import contextlib
import logging
import shutil
import subprocess
from pathlib import Path

try:
    import imageio_ffmpeg
except Exception:  # noqa: BLE001
    imageio_ffmpeg = None

logger = logging.getLogger(__name__)


def resolve_ffmpeg_binary(ffmpeg_binary: str = "ffmpeg") -> str | None:
    binary = shutil.which(ffmpeg_binary)
    if binary:
        return binary

    if imageio_ffmpeg is not None:
        with contextlib.suppress(Exception):
            return imageio_ffmpeg.get_ffmpeg_exe()

    return None


def convert_to_wav(
    input_path: str | Path,
    output_path: str | Path,
    *,
    ffmpeg_binary: str = "ffmpeg",
) -> None:
    binary = resolve_ffmpeg_binary(ffmpeg_binary)
    if not binary:
        raise RuntimeError("ffmpeg_not_available")

    result = subprocess.run(
        [
            binary,
            "-y",
            "-i",
            str(input_path),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-acodec",
            "pcm_s16le",
            str(output_path),
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.returncode != 0:
        stderr_tail = (result.stderr.decode("utf-8", errors="replace") or "").strip()[-500:]
        logger.warning(
            "ffmpeg_conversion_failed input=%s returncode=%s stderr=%r",
            input_path,
            result.returncode,
            stderr_tail,
        )
        raise RuntimeError(f"conversion_failed:{stderr_tail}")

    target = Path(output_path)
    if not target.exists() or target.stat().st_size == 0:
        logger.warning(
            "ffmpeg_conversion_empty_output input=%s output=%s", input_path, output_path
        )
        raise RuntimeError("conversion_failed")
