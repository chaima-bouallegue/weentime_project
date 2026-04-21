import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import main
from voice.stt import VoiceProcessingResult


class VoicePipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_finalize_audio_stream_keeps_assistant_text_and_transcription(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            session_dir = Path(temp_dir)
            stream_path = session_dir / "recording.webm"
            stream_path.write_bytes(b"0" * 6000)

            session = main.AudioStreamSession(
                session_id="voice-session",
                user_id=7,
                role="EMPLOYEE",
                access_token=None,
                directory=session_dir,
                stream_path=stream_path,
            )
            session.total_bytes = stream_path.stat().st_size
            session.detected_volume = 8.5
            main.app.state.audio_stream_sessions = {"voice-session": session}
            main.app.state.completed_audio_streams = {}
            main.app.state.stt_service = type("FakeStt", (), {})()
            main.app.state.stt_service.aprocess = AsyncMock(
                return_value=VoiceProcessingResult(
                    status="success",
                    cleaned_text="je veux un conge demain",
                    duration_seconds=1.8,
                    detected_volume=12.4,
                )
            )

            with patch.object(
                main,
                "_route_voice_transcript",
                AsyncMock(
                    return_value=main.ChatResponse(
                        success=True,
                        status="success",
                        type="workflow",
                        text="Votre conge a ete cree.",
                        message="Votre conge a ete cree.",
                        response="Votre conge a ete cree.",
                    )
                ),
            ), patch.object(main, "_maybe_generate_tts", AsyncMock(return_value="http://audio.local/reply.wav")), patch.object(
                main,
                "convert_stream_to_wav",
                return_value=session_dir / "recording.wav",
            ):
                payload = await main._finalize_audio_stream("voice-session")

        self.assertEqual(payload["text"], "Votre conge a ete cree.")
        self.assertEqual(payload["transcription"], "je veux un conge demain")
        self.assertEqual(payload["status"], "success")
        self.assertEqual(payload["audio_url"], "http://audio.local/reply.wav")
        self.assertEqual(payload["audio"], "http://audio.local/reply.wav")
        self.assertNotIn("voice-session", main.app.state.audio_stream_sessions)
        self.assertIn("voice-session", main.app.state.completed_audio_streams)

    async def test_finalize_audio_stream_returns_retry_status_for_unclean_transcript(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            session_dir = Path(temp_dir)
            stream_path = session_dir / "recording.webm"
            stream_path.write_bytes(b"0" * 6000)

            session = main.AudioStreamSession(
                session_id="voice-retry",
                user_id=8,
                role="EMPLOYEE",
                access_token=None,
                directory=session_dir,
                stream_path=stream_path,
            )
            session.total_bytes = stream_path.stat().st_size
            main.app.state.audio_stream_sessions = {"voice-retry": session}
            main.app.state.completed_audio_streams = {}
            main.app.state.stt_service = type("FakeStt", (), {})()
            main.app.state.stt_service.aprocess = AsyncMock(
                return_value=VoiceProcessingResult(
                    status="retry",
                    raw_text="il est bien il est bien",
                    duration_seconds=1.1,
                    detected_volume=7.1,
                    error="unclean_transcription",
                )
            )

            with patch.object(
                main,
                "convert_stream_to_wav",
                return_value=session_dir / "recording.wav",
            ):
                payload = await main._finalize_audio_stream("voice-retry")

        self.assertEqual(payload["status"], "retry")
        self.assertEqual(payload["message"], main.VOICE_RETRY_MESSAGE)
        self.assertEqual(payload["transcription"], "il est bien il est bien")
        self.assertIsNone(payload["audio"])
        self.assertNotIn("voice-retry", main.app.state.audio_stream_sessions)
        self.assertIn("voice-retry", main.app.state.completed_audio_streams)

    def test_merge_chunks_combines_webm_in_order(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            session_dir = Path(temp_dir)
            session = main.AudioStreamSession(
                session_id="voice-merge",
                user_id=9,
                role="EMPLOYEE",
                access_token=None,
                directory=session_dir,
                stream_path=session_dir / "recording.webm",
            )
            main.app.state.audio_stream_sessions = {"voice-merge": session}

            (session_dir / "chunk_0002.webm").write_bytes(b"BBBB")
            (session_dir / "chunk_0001.webm").write_bytes(b"AAAA")
            (session_dir / "chunk_0003.webm").write_bytes(b"CCCC")

            merged = main.merge_chunks("voice-merge")
            merged_bytes = (session_dir / "recording.webm").read_bytes()

        self.assertIsNotNone(merged)
        self.assertEqual(merged_bytes, b"AAAABBBBCCCC")

    async def test_append_stream_chunk_recomputes_volume_per_chunk(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            session_dir = Path(temp_dir)
            session = main.AudioStreamSession(
                session_id="voice-volume",
                user_id=10,
                role="EMPLOYEE",
                access_token=None,
                directory=session_dir,
                stream_path=session_dir / "recording.webm",
            )

            class FakeUpload:
                def __init__(self, payload: bytes) -> None:
                    self._payload = payload

                async def read(self) -> bytes:
                    return self._payload

            first_chunk = (100).to_bytes(2, byteorder="little", signed=True) * 1200
            second_chunk = (2000).to_bytes(2, byteorder="little", signed=True) * 1200

            await main._append_stream_chunk(session, FakeUpload(first_chunk), chunk_index=1)
            first_volume = session.last_chunk_volume
            await main._append_stream_chunk(session, FakeUpload(second_chunk), chunk_index=2)

        self.assertGreater(session.last_chunk_volume, first_volume)
        self.assertEqual(session.chunk_count, 2)


if __name__ == "__main__":
    unittest.main()
