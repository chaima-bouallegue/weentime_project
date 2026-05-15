from __future__ import annotations

import pytest

import main


class FakeUpload:
    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    async def read(self) -> bytes:
        return self._payload


def make_session(tmp_path, session_id: str = "chunk-test") -> main.AudioStreamSession:
    return main.AudioStreamSession(
        session_id=session_id,
        user_id=1,
        role="EMPLOYEE",
        access_token=None,
        directory=tmp_path,
        stream_path=tmp_path / "recording.webm",
    )


@pytest.mark.asyncio
async def test_low_size_non_final_chunk_is_skipped(tmp_path) -> None:
    session = make_session(tmp_path, "small-skip")
    payload = b"x" * max(1, main.settings.voice_min_chunk_bytes - 1)

    await main._append_stream_chunk(session, FakeUpload(payload), chunk_index=1, accept_small=False)

    assert session.chunk_count == 0
    assert session.total_bytes == 0
    assert session.chunk_paths == []


@pytest.mark.asyncio
async def test_low_size_final_chunk_is_accepted(tmp_path) -> None:
    session = make_session(tmp_path, "small-final")
    payload = b"x" * max(1, main.settings.voice_min_chunk_bytes - 1)

    await main._append_stream_chunk(session, FakeUpload(payload), chunk_index=1, accept_small=True)

    assert session.chunk_count == 1
    assert session.total_bytes == len(payload)
    assert session.chunk_paths[0].read_bytes() == payload


@pytest.mark.asyncio
async def test_duplicate_chunk_is_skipped(tmp_path) -> None:
    session = make_session(tmp_path, "duplicate")
    payload = b"x" * (main.settings.voice_min_chunk_bytes + 5)

    await main._append_stream_chunk(session, FakeUpload(payload), chunk_index=1)
    await main._append_stream_chunk(session, FakeUpload(payload), chunk_index=2)

    assert session.chunk_count == 1
    assert session.total_bytes == len(payload)


def test_partial_webm_transcription_helper_removed() -> None:
    assert not hasattr(main, "_transcribe_stream_partial")


