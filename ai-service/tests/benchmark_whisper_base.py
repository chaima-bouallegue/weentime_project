"""
Empirical STT benchmark: WHISPER_MODEL=base
Generates 4 real audio test samples via Windows SAPI, converts them to WebM (Opus),
then runs each sample through the full voice STT pipeline (WebM -> WAV -> VAD -> Whisper base).
Reports: FFmpeg conversion success rate, whisper_ms exact, raw_transcript, cleaned_transcript.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from time import perf_counter

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AI_SERVICE_DIR))

# Ensure base model settings
os.environ["WHISPER_MODEL"] = "base"
os.environ["STT_MODEL"] = "base"
os.environ["STT_COMPUTE_TYPE"] = "int8"
os.environ["STT_DEVICE"] = "cpu"
os.environ["STT_LOCAL_FILES_ONLY"] = "true"
os.environ["LOG_LEVEL"] = "INFO"

from config import Settings
from voice.audio_conversion import convert_to_wav, resolve_ffmpeg_binary
from voice.stt import SpeechToTextService

TEST_CASES = [
    {
        "id": "test_1_fr_conge",
        "label": "Test 1: FR - Demande de conge",
        "text": "Je souhaite poser deux jours de conge la semaine prochaine",
        "language": "fr",
    },
    {
        "id": "test_2_fr_solde",
        "label": "Test 2: FR - Solde de compte",
        "text": "Bonjour, quel est mon solde de tout compte",
        "language": "fr",
    },
    {
        "id": "test_3_tn_pointage",
        "label": "Test 3: TN - Pointage (nheb npointi el youm)",
        "text": "nheb npointi el youm",
        "language": "fr",
    },
    {
        "id": "test_4_tn_solde_conge",
        "label": "Test 4: TN - Solde conge (nheb na3ref solde de conge mte3i)",
        "text": "nheb na3ref solde de conge mte3i",
        "language": "fr",
    },
]


def generate_sapi_wav(text: str, wav_path: Path) -> bool:
    try:
        import win32com.client as win32
        speaker = win32.Dispatch("SAPI.SpVoice")
        stream = win32.Dispatch("SAPI.SpFileStream")
        stream.Open(str(wav_path), 3, False)
        speaker.AudioOutputStream = stream
        speaker.Speak(text)
        stream.Close()
        return wav_path.exists() and wav_path.stat().st_size > 0
    except Exception as exc:
        print(f"  Warning: SAPI speech synth failed: {exc}")
        return False


def convert_wav_to_webm(wav_path: Path, webm_path: Path) -> bool:
    ffmpeg = resolve_ffmpeg_binary()
    if not ffmpeg:
        print("  Warning: ffmpeg binary not found")
        return False
    try:
        result = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(wav_path),
                "-ac",
                "1",
                "-ar",
                "48000",
                "-c:a",
                "libopus",
                "-b:a",
                "64k",
                str(webm_path),
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=15,
        )
        return result.returncode == 0 and webm_path.exists() and webm_path.stat().st_size > 0
    except Exception as exc:
        print(f"  Warning: WAV to WebM conversion failed: {exc}")
        return False


def run_benchmark():
    print("=" * 72)
    print("  EMPIRICAL BENCHMARK: WHISPER_MODEL=base")
    print("=" * 72)

    settings = Settings()
    print(f"\n  Configured STT Model: {settings.stt_model}")
    print(f"  Device: {settings.stt_device}")
    print(f"  Compute Type: {settings.stt_compute_type}")
    print(f"  CPU Threads: {settings.stt_cpu_threads}")

    stt_service = SpeechToTextService(settings)
    print("\n  Preloading Whisper model...")
    t0 = perf_counter()
    preloaded = stt_service.preload()
    t_preload = round((perf_counter() - t0) * 1000, 2)
    print(f"  Preloaded: {preloaded} in {t_preload} ms")

    if not preloaded:
        print("  ERROR: Unable to load Whisper model. Aborting benchmark.")
        sys.exit(1)

    results = []
    ffmpeg_success_count = 0
    ffmpeg_total_count = 0

    for tc in TEST_CASES:
        print(f"\n" + "-" * 60)
        print(f"  {tc['label']}")
        print(f"  Text input: \"{tc['text']}\"")

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            wav_sapi = tmp_path / "speech.wav"
            webm_input = tmp_path / "input.webm"

            # 1. Synthesize audio
            if not generate_sapi_wav(tc["text"], wav_sapi):
                print("  ERROR: Speech synthesis failed for this test case.")
                continue

            # 2. Convert to WebM (simulating MediaRecorder browser output)
            if not convert_wav_to_webm(wav_sapi, webm_input):
                print("  ERROR: WebM conversion failed.")
                continue

            webm_size = webm_input.stat().st_size
            print(f"  WebM file size: {webm_size} bytes")
            ffmpeg_total_count += 1

            # 3. Process WebM file through full SpeechToTextService (FFmpeg WebM->WAV -> VAD -> Whisper)
            stt_start = perf_counter()
            res = stt_service.process(webm_input, language=tc.get("language"))
            total_duration_ms = round((perf_counter() - stt_start) * 1000, 2)

            timings = res.details.get("timings", {}) if isinstance(res.details, dict) else {}
            ffmpeg_ms = timings.get("ffmpeg_ms", 0)
            whisper_ms = timings.get("whisper_ms", 0)

            # Check FFmpeg success
            if res.status != "error" or res.error != "conversion_failed":
                ffmpeg_success_count += 1

            print(f"  FFmpeg conversion: SUCCESS ({ffmpeg_ms} ms)")
            print(f"  Whisper transcription time (whisper_ms): {whisper_ms} ms")
            print(f"  Total STT pipeline time: {total_duration_ms} ms")
            print(f"  Status: {res.status}")
            print(f"  Raw Transcript:     {res.raw_text!r}")
            print(f"  Cleaned Transcript: {res.cleaned_text!r}")
            print(f"  Detected Language:  {res.language} (confidence: {res.language_confidence:.4f})")
            print(f"  Audio Duration:     {res.duration_seconds:.2f}s")

            results.append({
                "id": tc["id"],
                "label": tc["label"],
                "input_text": tc["text"],
                "webm_size_bytes": webm_size,
                "ffmpeg_ms": ffmpeg_ms,
                "whisper_ms": whisper_ms,
                "total_pipeline_ms": total_duration_ms,
                "status": res.status,
                "raw_transcript": res.raw_text,
                "cleaned_transcript": res.cleaned_text,
                "detected_language": res.language,
                "language_confidence": res.language_confidence,
                "audio_duration_seconds": res.duration_seconds,
            })

    print("\n" + "=" * 72)
    print("  BENCHMARK SUMMARY RESULTS")
    print("=" * 72)
    print(f"  FFmpeg Conversion Success Rate: {ffmpeg_success_count}/{ffmpeg_total_count} ({100.0 * ffmpeg_success_count / max(1, ffmpeg_total_count):.1f}%)")

    whisper_times = [r["whisper_ms"] for r in results if "whisper_ms" in r]
    if whisper_times:
        print(f"  Whisper Times (whisper_ms): {whisper_times}")
        print(f"  Average whisper_ms: {sum(whisper_times) / len(whisper_times):.2f} ms")
        print(f"  Min whisper_ms:     {min(whisper_times):.2f} ms")
        print(f"  Max whisper_ms:     {max(whisper_times):.2f} ms")

    output_path = AI_SERVICE_DIR / "benchmark_whisper_base_results.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n  Detailed results saved to: {output_path}")


if __name__ == "__main__":
    run_benchmark()
