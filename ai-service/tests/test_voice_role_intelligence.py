from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import main
from app.context.context_builder import ContextBuilder
from app.tools.result import ToolResult, build_read_result
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceProcessorResult
from jwt_test_utils import TEST_JWT_SECRET, make_token
from voice.stt import VoiceProcessingResult


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": context.role or "EMPLOYEE", "entrepriseId": 9})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.ok({})


def token_header(user_id: int = 12, role: str = "EMPLOYEE") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token({'userId': user_id, 'role': role, 'entrepriseId': 9})}"}


def prepare_v2_state(client: TestClient) -> None:
    client.app.state.copilot_ready = False
    client.app.state.copilot_backend_client = FakeBackendClient()
    client.app.state.copilot_context_builder = ContextBuilder(FakeBackendClient(), jwt_secret=TEST_JWT_SECRET)
    for attr in (
        "copilot_tool_registry",
        "copilot_tool_executor",
        "copilot_confirmation_store",
        "copilot_router_agent",
        "copilot_attendance_agent",
        "voice_role_router",
    ):
        if hasattr(client.app.state, attr):
            delattr(client.app.state, attr)


def fake_processed(tmp_path: Path, text: str, language: str = "en") -> VoiceProcessorResult:
    stored = StoredAudio(path=tmp_path / "input.webm", directory=tmp_path, size_bytes=100)
    return VoiceProcessorResult(
        stt=VoiceProcessingResult(status="success", cleaned_text=text, language=language, language_confidence=0.91),
        stored_audio=stored,
        detected_language=language,
    )


def install_voice_processor(monkeypatch, tmp_path: Path, text: str, language: str = "en") -> None:
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.process_upload", AsyncMock(return_value=fake_processed(tmp_path, text, language)))
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.cleanup", lambda self, stored: None)
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value=None))


def patch_executor_after_services(client: TestClient, priority_tool: str) -> None:
    from app.core.copilot_engine import ensure_copilot_services

    services = ensure_copilot_services(client.app.state)

    async def fake_execute(tool_name, payload, context, **kwargs):
        items = [{"id": 1, "status": "PENDING"}] if tool_name == priority_tool else []
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=f"summary:{tool_name}",
                    items=items,
                    count=len(items),
                    data={},
                    empty=not items,
                    backend_status=200,
                )
            },
            status_code=200,
        )

    services["executor"].execute = AsyncMock(side_effect=fake_execute)
    if hasattr(client.app.state, "voice_role_router"):
        delattr(client.app.state, "voice_role_router")


def test_voice_employee_briefing_uses_role_intelligence_not_generic_copilot(monkeypatch, tmp_path: Path) -> None:
    install_voice_processor(monkeypatch, tmp_path, "what should I do today", "en")
    process_mock = AsyncMock()
    monkeypatch.setattr("app.api.voice_v2.process_copilot_message", process_mock)

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        patch_executor_after_services(client, "leave.list_my_requests")
        response = client.post(
            "/v2/voice",
            headers=token_header(role="EMPLOYEE"),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    data = response.json()["data"]
    assert response.status_code == 200
    assert data["agent"] == "role_intelligence"
    assert data["intent"] == "voice_role.employee_briefing"
    assert data["actionResult"]["kind"] == "role_intelligence_digest"
    assert data["actionResult"]["voice"]["optimized"] is True
    assert data["requiresConfirmation"] is False
    assert process_mock.await_count == 0


def test_voice_manager_briefing_is_role_aware(monkeypatch, tmp_path: Path) -> None:
    install_voice_processor(monkeypatch, tmp_path, "give me today's summary", "en")

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        patch_executor_after_services(client, "leave.list_manager_requests")
        response = client.post(
            "/v2/voice",
            headers=token_header(role="MANAGER"),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    data = response.json()["data"]
    assert data["intent"] == "voice_role.manager_briefing"
    assert data["actionResult"]["role"] == "MANAGER"
    assert "team briefing" in data["text"]


def test_voice_rh_briefing_is_role_aware(monkeypatch, tmp_path: Path) -> None:
    install_voice_processor(monkeypatch, tmp_path, "what requires attention", "en")

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        patch_executor_after_services(client, "leave.list_rh_pending")
        response = client.post(
            "/v2/voice",
            headers=token_header(role="RH"),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    data = response.json()["data"]
    assert data["intent"] == "voice_role.rh_briefing"
    assert data["actionResult"]["role"] == "RH"


def test_voice_admin_system_health_briefing(monkeypatch, tmp_path: Path) -> None:
    install_voice_processor(monkeypatch, tmp_path, "system health", "en")

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        patch_executor_after_services(client, "admin.misconfigured_users")
        response = client.post(
            "/v2/voice",
            headers=token_header(role="ADMIN"),
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    data = response.json()["data"]
    assert data["intent"] == "voice_role.admin_briefing"
    assert data["actionResult"]["role"] == "ADMIN"
    assert "system briefing" in data["text"]
