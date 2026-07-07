from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from voice.tts_service import _finalize_audio_output


class TestFinalizeAudioOutput:

    def test_returns_ogg_if_already_cached(self, tmp_path: Path) -> None:
        wav = tmp_path / "test.wav"
        wav.write_bytes(b"fake_wav")
        ogg = tmp_path / "test.ogg"
        ogg.write_bytes(b"fake_ogg")

        with patch("voice.audio_conversion.resolve_ffmpeg_binary") as mock_ffmpeg:
            result = _finalize_audio_output(wav)

        assert result == ogg
        mock_ffmpeg.assert_not_called()

    def test_returns_wav_on_ffmpeg_not_found(self, tmp_path: Path) -> None:
        wav = tmp_path / "test.wav"
        wav.write_bytes(b"fake_wav")

        with patch(
            "voice.audio_conversion.resolve_ffmpeg_binary",
            side_effect=FileNotFoundError,
        ):
            result = _finalize_audio_output(wav)

        assert result == wav
        assert wav.exists()

    def test_returns_wav_on_ffmpeg_failure(self, tmp_path: Path) -> None:
        wav = tmp_path / "test.wav"
        wav.write_bytes(b"fake_wav")

        mock_result = MagicMock()
        mock_result.returncode = 1

        with (
            patch("voice.audio_conversion.resolve_ffmpeg_binary", return_value="ffmpeg"),
            patch("subprocess.run", return_value=mock_result),
        ):
            result = _finalize_audio_output(wav)

        assert result == wav
        assert wav.exists()

    def test_returns_wav_on_timeout(self, tmp_path: Path) -> None:
        wav = tmp_path / "test.wav"
        wav.write_bytes(b"fake_wav")

        with (
            patch("voice.audio_conversion.resolve_ffmpeg_binary", return_value="ffmpeg"),
            patch("subprocess.run", side_effect=subprocess.TimeoutExpired("ffmpeg", 15)),
        ):
            result = _finalize_audio_output(wav)

        assert result == wav

    def test_returns_ogg_on_success(self, tmp_path: Path) -> None:
        wav = tmp_path / "test.wav"
        wav.write_bytes(b"fake_wav")

        mock_result = MagicMock()
        mock_result.returncode = 0

        def fake_run(*args: object, **kwargs: object) -> MagicMock:
            ogg = tmp_path / "test.ogg"
            ogg.write_bytes(b"fake_ogg")
            return mock_result

        with (
            patch("voice.audio_conversion.resolve_ffmpeg_binary", return_value="ffmpeg"),
            patch("subprocess.run", side_effect=fake_run),
        ):
            result = _finalize_audio_output(wav)

        assert result.suffix == ".ogg"
        assert wav.exists()

    def test_returns_wav_if_ogg_not_created(self, tmp_path: Path) -> None:
        wav = tmp_path / "test.wav"
        wav.write_bytes(b"fake_wav")

        mock_result = MagicMock()
        mock_result.returncode = 0

        with (
            patch("voice.audio_conversion.resolve_ffmpeg_binary", return_value="ffmpeg"),
            patch("subprocess.run", return_value=mock_result),
        ):
            result = _finalize_audio_output(wav)

        assert result == wav
