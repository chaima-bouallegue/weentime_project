"""Regenerate the French leave-request fixture via Coqui TTS."""
from __future__ import annotations

import subprocess
from pathlib import Path

from TTS.api import TTS

FIXTURE_DIR = Path(__file__).resolve().parent
WAV_PATH = FIXTURE_DIR / "fr_leave_request.wav"
WEBM_PATH = FIXTURE_DIR / "fr_leave_request.webm"
TEXT = "Je veux un congé ."
MODEL = "tts_models/fr/css10/vits"


def main() -> None:
    tts = TTS(model_name=MODEL, progress_bar=False, gpu=False)
    tts.tts_to_file(text=TEXT, file_path=str(WAV_PATH))
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(WAV_PATH),
            "-ac",
            "1",
            "-ar",
            "48000",
            "-c:a",
            "libopus",
            "-b:a",
            "64k",
            str(WEBM_PATH),
        ],
        check=True,
    )
    WAV_PATH.unlink(missing_ok=True)
    print(f"Wrote {WEBM_PATH} ({WEBM_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
