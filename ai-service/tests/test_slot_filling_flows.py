from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from app.core.copilot_engine import process_copilot_message
from app.tools.result import ToolResult


class FakeBackendClient:
    async def get(self, path: str, *, context, params: dict[str, Any] | None = None) -> ToolResult:
        if path == "/rh/type-conges":
            return ToolResult.ok([{"id": 3, "libelle": "Conge maladie"}], status_code=200)
        if path == "/rh/solde-conges/me/all":
            return ToolResult.ok([{"libelle": "Conge maladie", "joursRestants": 5}], status_code=200)
        if path == "/rh/conges/me":
            return ToolResult.ok([], status_code=200)
        if path == "/rh/parametres/types-autorisations":
            return ToolResult.ok([{"id": 9, "libelle": "AUTRE"}, {"id": 8, "libelle": "ABSENCE_TEMPORAIRE"}], status_code=200)
        return ToolResult.ok({}, status_code=200)

    async def post(self, path: str, *, context, json: dict[str, Any] | None = None, headers=None) -> ToolResult:
        return ToolResult.ok({"id": 99, "path": path, **(json or {})}, status_code=201)

    async def request(self, method: str, path: str, *, context, params=None, json=None, headers=None) -> ToolResult:
        return ToolResult.ok({"id": 99}, status_code=200)


def make_state() -> SimpleNamespace:
    return SimpleNamespace(
        copilot_ready=False,
        copilot_backend_client=FakeBackendClient(),
        settings=SimpleNamespace(backend_timeout_seconds=1, backend_base_url="http://localhost:8222/api/v1"),
    )


async def send(state: SimpleNamespace, message: str, session_id: str = "s1"):
    return await process_copilot_message(
        12,
        message,
        None,
        "EMPLOYEE",
        metadata={"app_state": state, "allow_legacy_without_token": True, "session_id": session_id},
    )


def test_authorization_followup_date_time_continues_pending_flow() -> None:
    state = make_state()

    first = asyncio.run(send(state, "je veux faire une demande d'autorisation"))
    second = asyncio.run(send(state, "pour demain de 10h a 11h"))

    assert first.type == "ask"
    assert first.intent == "authorization.create"
    assert second.type == "ask"
    assert second.intent == "authorization.create"
    assert "motif" in second.text.lower()
    assert second.actionResult["pendingFlow"]["collectedFields"]["time_start"] == "10:00:00"


def test_authorization_complete_followup_returns_confirmation() -> None:
    state = make_state()

    asyncio.run(send(state, "je veux faire une demande d'autorisation"))
    asyncio.run(send(state, "pour demain de 10h a 11h"))
    response = asyncio.run(send(state, "rendez-vous medical"))

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "authorization.create_request"
    assert response.actionResult["summary"]["motif"] == "rendez-vous medical"


def test_leave_followup_ghodwa_continues_pending_flow() -> None:
    state = make_state()

    first = asyncio.run(send(state, "nheb conge"))
    second = asyncio.run(send(state, "ghodwa"))

    assert first.type == "ask"
    assert second.intent == "leave.create"
    assert second.type == "ask"
    assert "type de conge" in second.text.lower()


def test_leave_direct_sick_leave_only_asks_missing_reason() -> None:
    state = make_state()

    response = asyncio.run(send(state, "nheb conge ghodwa de maladie"))

    assert response.type == "ask"
    assert response.intent == "leave.create"
    assert "motif" in response.text.lower()
    assert response.actionResult["pendingFlow"]["collectedFields"]["leave_type_label"] == "Conge maladie"


def test_nn_does_not_trigger_generic_chat_during_pending_leave_flow() -> None:
    state = make_state()

    asyncio.run(send(state, "nheb conge ghodwa de maladie"))
    response = asyncio.run(send(state, "nn"))

    assert response.intent == "leave.create"
    assert response.type == "ask"
    assert "motif" in response.text.lower()
    assert response.intent != "legacy.intent"
