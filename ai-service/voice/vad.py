from __future__ import annotations

import logging
import wave
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    import webrtcvad
except Exception:  # noqa: BLE001
    webrtcvad = None

vad = webrtcvad.Vad(2) if webrtcvad is not None else None

SUPPORTED_SAMPLE_RATES = {8000, 16000, 32000, 48000}


@dataclass(slots=True)
class VadAnalysis:
    used_vad: bool
    total_duration_ms: int
    voiced_duration_ms: int
    total_frames: int
    voiced_frames: int
    sample_rate: int = 16000

    @property
    def voiced_ratio(self) -> float:
        if self.total_frames <= 0:
            return 0.0
        return self.voiced_frames / self.total_frames

    @property
    def has_speech(self) -> bool:
        return self.voiced_frames > 0 and self.voiced_duration_ms > 0


def _scan_frames(
    source_path: Path,
    *,
    aggressiveness: int,
    frame_ms: int,
) -> tuple[VadAnalysis, list[bytes], int, int]:
    if webrtcvad is None:
        return (
            VadAnalysis(
                used_vad=False,
                total_duration_ms=0,
                voiced_duration_ms=0,
                total_frames=0,
                voiced_frames=0,
            ),
            [],
            1,
            16000,
        )

    detector = webrtcvad.Vad(aggressiveness)
    with wave.open(str(source_path), "rb") as wav_file:
        sample_width = wav_file.getsampwidth()
        channels = wav_file.getnchannels()
        sample_rate = wav_file.getframerate()

        if sample_width != 2 or channels != 1 or sample_rate not in SUPPORTED_SAMPLE_RATES:
            logger.info(
                "VAD skipped path=%s sample_width=%s channels=%s sample_rate=%s",
                source_path,
                sample_width,
                channels,
                sample_rate,
            )
            total_duration_ms = 0
            with wave.open(str(source_path), "rb") as metrics_file:
                total_duration_ms = int((metrics_file.getnframes() / max(metrics_file.getframerate(), 1)) * 1000)
            return (
                VadAnalysis(
                    used_vad=False,
                    total_duration_ms=total_duration_ms,
                    voiced_duration_ms=0,
                    total_frames=0,
                    voiced_frames=0,
                    sample_rate=sample_rate,
                ),
                [],
                sample_width,
                sample_rate,
            )

        frame_samples = int(sample_rate * frame_ms / 1000)
        frame_bytes = frame_samples * sample_width
        total_frames = 0
        voiced_frames = 0
        voiced_chunks: list[bytes] = []

        while True:
            frame = wav_file.readframes(frame_samples)
            if len(frame) < frame_bytes:
                break

            total_frames += 1
            if detector.is_speech(frame, sample_rate):
                voiced_frames += 1
                voiced_chunks.append(frame)

    analysis = VadAnalysis(
        used_vad=True,
        total_duration_ms=total_frames * frame_ms,
        voiced_duration_ms=voiced_frames * frame_ms,
        total_frames=total_frames,
        voiced_frames=voiced_frames,
        sample_rate=sample_rate,
    )
    return analysis, voiced_chunks, 2, sample_rate


def analyze_voice(
    audio_path: str | Path,
    *,
    aggressiveness: int = 2,
    frame_ms: int = 30,
    min_voiced_ms: int = 300,
) -> VadAnalysis:
    source_path = Path(audio_path)
    analysis, _, _, _ = _scan_frames(
        source_path,
        aggressiveness=aggressiveness,
        frame_ms=frame_ms,
    )
    if not analysis.used_vad:
        return analysis
    if analysis.voiced_duration_ms < min_voiced_ms:
        return VadAnalysis(
            used_vad=True,
            total_duration_ms=analysis.total_duration_ms,
            voiced_duration_ms=analysis.voiced_duration_ms,
            total_frames=analysis.total_frames,
            voiced_frames=analysis.voiced_frames,
            sample_rate=analysis.sample_rate,
        )
    return analysis


def has_voice(audio_path):
    analysis = analyze_voice(audio_path)
    return analysis.has_speech and analysis.voiced_duration_ms >= 300


def strip_silence_from_wav(
    input_path: str | Path,
    output_path: str | Path,
    *,
    aggressiveness: int = 2,
    frame_ms: int = 30,
    min_voiced_ms: int = 350,
) -> VadAnalysis:
    source_path = Path(input_path)
    target_path = Path(output_path)
    analysis, voiced_chunks, sample_width, sample_rate = _scan_frames(
        source_path,
        aggressiveness=aggressiveness,
        frame_ms=frame_ms,
    )

    if not analysis.used_vad:
        return analysis

    if not voiced_chunks or analysis.voiced_duration_ms < min_voiced_ms:
        return analysis

    with wave.open(str(target_path), "wb") as voiced_file:
        voiced_file.setnchannels(1)
        voiced_file.setsampwidth(sample_width)
        voiced_file.setframerate(sample_rate)
        voiced_file.writeframes(b"".join(voiced_chunks))

    return analysis
