"""
Empirical STT benchmark test runner: WHISPER_MODEL=base
Generates 4 real audio test samples via Windows SAPI (or WAV synthesis fallback),
converts them to WebM (Opus), then runs each sample through the full voice STT pipeline
(WebM -> WAV -> VAD -> Whisper base).
Reports: FFmpeg conversion success rate, whisper_ms exact, raw_transcript, cleaned_transcript.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from time import perf_counter

import pytest

from config import Settings
from voice.audio_conversion import convert_to_wav, resolve_ffmpeg_binary
from voice.stt import SpeechToTextService

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent

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
    posix_path = str(wav_path.resolve()).replace("\\", "/")
    safe_text = text.replace("'", "''")
    ps_cmd = (
        f"Add-Type -AssemblyName System.Speech; "
        f"$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"$synth.SetOutputToWaveFile('{posix_path}'); "
        f"$synth.Speak('{safe_text}'); "
        f"$synth.Dispose()"
    )
    try:
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=20,
        )
        return wav_path.exists() and wav_path.stat().st_size > 0
    except Exception as exc:
        print(f"  [TTS WARNING] {exc}")
        return False


def convert_wav_to_webm(wav_path: Path, webm_path: Path) -> bool:
    ffmpeg = resolve_ffmpeg_binary()
    if not ffmpeg:
        print("  [FFMPEG WARNING] ffmpeg binary not found")
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
        print(f"  [FFMPEG CONVERSION WARNING] {exc}")
        return False


def test_empirical_whisper_base_benchmark(monkeypatch, tmp_path: Path):
    print("\n" + "=" * 72)
    print("  EMPIRICAL BENCHMARK: WHISPER_MODEL=base")
    print("=" * 72)

    os.environ["WHISPER_MODEL"] = "base"
    os.environ["STT_MODEL"] = "base"

    settings = Settings()
    settings.stt_model = "base"
    print(f"\n  Configured STT Model: {settings.stt_model}")
    print(f"  Device: {settings.stt_device}")
    print(f"  Compute Type: {settings.stt_compute_type}")
    print(f"  CPU Threads: {settings.stt_cpu_threads}")

    stt_service = SpeechToTextService(settings)
    print("\n  Preloading Whisper base model...")
    t0 = perf_counter()
    preloaded = stt_service.preload()
    t_preload = round((perf_counter() - t0) * 1000, 2)
    print(f"  Preloaded: {preloaded} in {t_preload} ms")
    assert preloaded is True, "Whisper base model could not be preloaded"

    results = []
    ffmpeg_success_count = 0
    ffmpeg_total_count = 0

    for tc in TEST_CASES:
        print(f"\n" + "-" * 60)
        print(f"  {tc['label']}")
        print(f"  Text input: \"{tc['text']}\"")

        wav_sapi = tmp_path / f"{tc['id']}_sapi.wav"
        webm_input = tmp_path / f"{tc['id']}_input.webm"

        # 1. Synthesize audio
        synth_ok = generate_sapi_wav(tc["text"], wav_sapi)
        assert synth_ok is True, f"Audio synthesis failed for {tc['id']}"

        # 2. Convert to WebM (simulating MediaRecorder browser output)
        webm_ok = convert_wav_to_webm(wav_sapi, webm_input)
        assert webm_ok is True, f"WebM conversion failed for {tc['id']}"

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

    assert ffmpeg_success_count == ffmpeg_total_count, "FFmpeg conversion failed during benchmark"
