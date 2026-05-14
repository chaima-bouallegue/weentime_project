from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import main
from app.context.context_builder import ContextBuilder
from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.models.agent_models import AgentResponse
from app.tools.executor import ToolExecutor
from app.tools.legacy_adapter import LegacyHrToolsAdapter
from app.tools.registry import ToolRegistry
from tools.api_client import ToolResult as LegacyToolResult
from voice.stt import VoiceProcessingResult
from app.voice_pipeline.voice_request_processor import StoredAudio, VoiceProcessorResult
from jwt_test_utils import TEST_JWT_SECRET, make_token


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role=role, entreprise_id=9, token="token")


class FakeHrTools:
    def __init__(self, result: LegacyToolResult) -> None:
        self.result = result
        self.calls: list[tuple[str, dict]] = []

    async def execute_action(self, action, payload, *, user_id, access_token=None, role="EMPLOYEE"):
        self.calls.append((action, payload))
        return self.result


class FakeBackendClient:
    async def get(self, path, *, context, params=None):
        if path == "/users/me":
            return ToolResult.ok({"id": context.user_id, "role": "EMPLOYEE", "entrepriseId": 9})
        return ToolResult.ok({})

    async def post(self, path, *, context, json=None, headers=None):
        return ToolResult.ok({})


async def execute_legacy(tool_name: str, legacy_result: LegacyToolResult, *, role: str = "EMPLOYEE"):
    registry = ToolRegistry()
    LegacyHrToolsAdapter(FakeHrTools(legacy_result)).register(registry)
    executor = ToolExecutor(registry)
    return await executor.execute(tool_name, {"payload": {}}, context(role))


@pytest.mark.asyncio
async def test_leave_balance_read_returns_read_result_summary() -> None:
    legacy = LegacyToolResult(
        success=True,
        tool="/v1/leave-balances",
        data={"total": 12, "balances": [{"type": "Annuel", "joursRestants": 12}]},
        status_code=200,
    )

    result = await execute_legacy("legacy.get_leave_balance", legacy)

    read_result = result.data["read_result"]
    assert result.success is True
    assert read_result["kind"] == "read_result"
    assert read_result["summary"] == "Il vous reste 12 jours de conge."
    assert read_result["count"] == 1
    assert read_result["backendStatus"] == 200
    response = AgentResponse(type="answer", text=read_result["summary"], intent="leave.balance", confidence=0.9, actionResult=result.model_dump(mode="json"))
    assert ResponseGuard().validate(response, context()).allowed is True


@pytest.mark.asyncio
async def test_my_requests_read_returns_count_and_items() -> None:
    legacy = LegacyToolResult(
        success=True,
        tool="get_my_requests",
        data={"count": 2, "items": [{"status": "EN_ATTENTE"}, {"status": "APPROUVEE"}]},
        status_code=200,
    )

    result = await execute_legacy("legacy.get_my_requests", legacy)

    read_result = result.data["read_result"]
    assert read_result["count"] == 2
    assert len(read_result["items"]) == 2
    assert "Vous avez 2 demande(s) recente(s)" in read_result["summary"]


@pytest.mark.asyncio
async def test_pending_validations_read_returns_count_and_items() -> None:
    legacy = LegacyToolResult(
        success=True,
        tool="get_pending_validations",
        data={"count": 5, "items": [{"id": idx} for idx in range(5)]},
        status_code=200,
    )

    result = await execute_legacy("legacy.get_pending_validations", legacy, role="MANAGER")

    read_result = result.data["read_result"]
    assert read_result["count"] == 5
    assert read_result["summary"] == "Vous avez 5 demande(s) a valider."


@pytest.mark.asyncio
async def test_backend_unavailable_returns_clean_message() -> None:
    legacy = LegacyToolResult(
        success=False,
        tool="get_my_requests",
        error="All connection attempts failed",
        text="All connection attempts failed",
        status_code=None,
    )

    result = await execute_legacy("legacy.get_my_requests", legacy)

    read_result = result.data["read_result"]
    assert result.success is False
    assert result.error_code == "backend_unavailable"
    assert "momentanement indisponible" in read_result["summary"]
    assert "connection" not in read_result["summary"].lower()


@pytest.mark.asyncio
async def test_403_returns_permission_denied_message() -> None:
    legacy = LegacyToolResult(
        success=False,
        tool="get_my_requests",
        error="backend_http_403",
        text="Forbidden",
        status_code=403,
    )

    result = await execute_legacy("legacy.get_my_requests", legacy)

    read_result = result.data["read_result"]
    assert result.success is False
    assert result.status_code == 403
    assert result.error_code == "permission_denied"
    assert "droits necessaires" in read_result["summary"]


def prepare_v2_state(client: TestClient) -> None:
    client.app.state.copilot_ready = False
    client.app.state.copilot_backend_client = FakeBackendClient()
    client.app.state.copilot_context_builder = ContextBuilder(FakeBackendClient(), jwt_secret=TEST_JWT_SECRET)
    for attr in ("copilot_tool_registry", "copilot_tool_executor", "copilot_confirmation_store", "copilot_router_agent", "copilot_attendance_agent", "copilot_response_guard"):
        if hasattr(client.app.state, attr):
            delattr(client.app.state, attr)


def fake_voice_result(tmp_path: Path) -> VoiceProcessorResult:
    stored = StoredAudio(path=tmp_path / "input.webm", directory=tmp_path, size_bytes=100)
    return VoiceProcessorResult(
        stt=VoiceProcessingResult(status="success", cleaned_text="Combien de jours de conge ?", language="fr"),
        stored_audio=stored,
        detected_language="fr",
    )


def test_voice_path_preserves_read_result(monkeypatch, tmp_path: Path) -> None:
    read_result = {
        "kind": "read_result",
        "toolName": "legacy.get_leave_balance",
        "summary": "Il vous reste 12 jours de conge.",
        "items": [],
        "empty": False,
        "count": 0,
        "data": {"total": 12},
        "error": None,
        "backendStatus": 200,
    }
    monkeypatch.setattr(
        "app.api.voice_v2.VoiceRequestProcessor.process_upload",
        AsyncMock(return_value=fake_voice_result(tmp_path)),
    )
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.cleanup", lambda self, stored: None)
    monkeypatch.setattr("app.api.voice_v2.VoiceRequestProcessor.generate_tts", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "app.api.voice_v2.process_copilot_message",
        AsyncMock(
            return_value=AgentResponse(
                type="answer",
                text="Il vous reste 12 jours de conge.",
                intent="leave.balance",
                confidence=0.9,
                actionResult={"success": True, "data": {"read_result": read_result}},
            )
        ),
    )

    with TestClient(main.app) as client:
        prepare_v2_state(client)
        token = make_token({"userId": 12, "role": "EMPLOYEE", "entrepriseId": 9})
        response = client.post(
            "/v2/voice",
            headers={"Authorization": f"Bearer {token}"},
            files={"audio_file": ("audio.webm", b"fake", "audio/webm")},
        )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["text"] == "Il vous reste 12 jours de conge."
    assert data["actionResult"]["data"]["read_result"]["summary"] == "Il vous reste 12 jours de conge."
