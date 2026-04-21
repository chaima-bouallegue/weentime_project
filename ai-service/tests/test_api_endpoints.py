import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import main
from voice.stt import VoiceProcessingResult


class ApiEndpointTests(unittest.TestCase):
    def test_audio_endpoint_returns_transcription(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(
                main,
                "_process_uploaded_audio",
                AsyncMock(
                    return_value=(
                        VoiceProcessingResult(status="success", cleaned_text="salut"),
                        Path(temp_dir),
                    )
                ),
            ):
                with TestClient(main.app) as client:
                    response = client.post(
                        "/audio",
                        files={"file": ("voice.webm", b"fake-audio", "audio/webm")},
                    )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"success": True, "text": "salut"})

    def test_audio_endpoint_handles_missing_speech(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(
                main,
                "_process_uploaded_audio",
                AsyncMock(
                    return_value=(
                        VoiceProcessingResult(status="no_input", error="no_voice_detected"),
                        Path(temp_dir),
                    )
                ),
            ):
                with TestClient(main.app) as client:
                    response = client.post(
                        "/audio",
                        files={"file": ("voice.webm", b"fake-audio", "audio/webm")},
                    )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["status"], "no_input")
        self.assertEqual(body["message"], main.NO_SPEECH_MESSAGE)


if __name__ == "__main__":
    unittest.main()
