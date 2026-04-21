from __future__ import annotations

import contextlib
import shutil
import subprocess
from pathlib import Path

try:
    import imageio_ffmpeg
except Exception:  # noqa: BLE001
    imageio_ffmpeg = None


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

    subprocess.run(
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
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    target = Path(output_path)
    if not target.exists() or target.stat().st_size == 0:
        raise RuntimeError("conversion_failed")
