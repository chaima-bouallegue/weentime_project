from __future__ import annotations

from fastapi.testclient import TestClient

import main


def test_audio_stream_accepts_small_final_chunk(monkeypatch) -> None:
    captured: dict[str, int] = {}

    async def fake_finalize(session_id: str):
        session = main._get_stream_sessions()[session_id]
        captured["chunk_count"] = session.chunk_count
        captured["total_bytes"] = session.total_bytes
        return {
            "success": True,
            "session_id": session_id,
            "final": True,
            "status": "done",
            "text": "",
            "message": "done",
            "response": "done",
        }

    monkeypatch.setattr(main, "_finalize_audio_stream", fake_finalize)

    with TestClient(main.app) as client:
        response = client.post(
            "/audio-stream",
            data={"user_id": "1", "role": "EMPLOYEE", "is_final": "true", "chunk_index": "1"},
            files={"file": ("tiny.webm", b"x" * max(1, main.settings.voice_min_chunk_bytes - 1), "audio/webm")},
        )

    assert response.status_code == 200
    assert response.json()["final"] is True
    assert captured["chunk_count"] == 1
    assert captured["total_bytes"] == max(1, main.settings.voice_min_chunk_bytes - 1)
