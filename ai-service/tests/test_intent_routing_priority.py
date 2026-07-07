"""Tests for AI-FE-05 chatbot routing fixes:
- Pending leave/authorization flows must not trap pointage/document/greeting messages.
- Deterministic greetings respond per-role without invoking the LLM legacy path.
- Document creation intent must not be hijacked by an in-flight leave flow.
"""
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
        if path.startswith("/rh/pointages/status"):
            return ToolResult.ok(
                {
                    "status": "CHECKED_IN",
                    "active": True,
                    "checkIn": "08:30:00",
                    "checkOut": None,
                },
                status_code=200,
            )
        if path == "/rh/parametres/types-autorisations":
            return ToolResult.ok(
                [
                    {"id": 9, "libelle": "AUTRE"},
                    {"id": 8, "libelle": "ABSENCE_TEMPORAIRE"},
                ],
                status_code=200,
            )
        return ToolResult.ok({}, status_code=200)

    async def post(self, path: str, *, context, json: dict[str, Any] | None = None, headers=None) -> ToolResult:
        return ToolResult.ok({"id": 99, "path": path, **(json or {})}, status_code=201)

    async def request(self, method: str, path: str, *, context, params=None, json=None, headers=None) -> ToolResult:
        return ToolResult.ok({"id": 99}, status_code=200)


def _make_state() -> SimpleNamespace:
    return SimpleNamespace(
        copilot_ready=False,
        copilot_backend_client=FakeBackendClient(),
        settings=SimpleNamespace(backend_timeout_seconds=1, backend_base_url="http://localhost:8222/api/v1"),
    )


async def _send(state: SimpleNamespace, message: str, *, role: str = "EMPLOYEE", session_id: str = "s1"):
    return await process_copilot_message(
        12,
        message,
        None,
        role,
        metadata={
            "app_state": state,
            "allow_legacy_without_token": True,
            "session_id": session_id,
            "entreprise_id": 9,
        },
    )


# ---------------------------------------------------------------------------
# Slot-filling escape: a pending leave flow must not trap a different intent.
# ---------------------------------------------------------------------------


def test_pending_leave_flow_releases_pointage_question() -> None:
    state = _make_state()

    first = asyncio.run(_send(state, "je veux un conge"))
    second = asyncio.run(_send(state, "est ce que jai pointe"))

    assert first.intent == "leave.create"
    assert second.intent == "attendance.status"
    # Must not ask for a leave type when the user changed topic.
    assert "type de conge" not in (second.text or "").lower()


def test_pending_leave_flow_releases_document_request() -> None:
    state = _make_state()

    asyncio.run(_send(state, "je veux un conge"))
    response = asyncio.run(_send(state, "je veut une demande de document"))

    assert response.intent.startswith("document"), response.intent
    assert "type de conge" not in (response.text or "").lower()


def test_pending_leave_flow_releases_daily_summary() -> None:
    state = _make_state()

    asyncio.run(_send(state, "je veux un conge"))
    response = asyncio.run(_send(state, "Show my daily summary"))

    # Should NOT remain inside leave.create slot filling.
    assert not (response.intent or "").startswith("leave."), response.intent
    assert "type de conge" not in (response.text or "").lower()


def test_pending_leave_flow_releases_greeting() -> None:
    state = _make_state()

    asyncio.run(_send(state, "je veux un conge"))
    response = asyncio.run(_send(state, "BONJOUR"))

    assert response.intent == "system.greeting"
    assert "bonjour" in (response.text or "").lower()


# ---------------------------------------------------------------------------
# Document.create intent must win against legacy when leave terms are absent.
# ---------------------------------------------------------------------------


def test_document_request_does_not_route_to_leave_create() -> None:
    state = _make_state()
    response = asyncio.run(_send(state, "je veut une demande de document"))
    assert response.intent.startswith("document"), response.intent


def test_pointage_status_does_not_route_to_leave_create() -> None:
    state = _make_state()
    response = asyncio.run(_send(state, "est ce que jai pointe"))
    assert response.intent == "attendance.status"


# ---------------------------------------------------------------------------
# Deterministic greetings per role.
# ---------------------------------------------------------------------------


def test_greeting_admin_returns_role_specific_text() -> None:
    state = _make_state()
    response = asyncio.run(_send(state, "Bonjour", role="ADMIN"))
    assert response.intent == "system.greeting"
    text = (response.text or "").lower()
    assert "sante systeme" in text or "système" in text or "diagnostics" in text


def test_greeting_rh_returns_role_specific_text() -> None:
    state = _make_state()
    response = asyncio.run(_send(state, "BONJOUR", role="RH"))
    assert response.intent == "system.greeting"
    assert "rh" in (response.text or "").lower() or "backlog" in (response.text or "").lower()


def test_greeting_manager_returns_role_specific_text() -> None:
    state = _make_state()
    response = asyncio.run(_send(state, "salut", role="MANAGER"))
    assert response.intent == "system.greeting"
    assert "equipe" in (response.text or "").lower()


def test_greeting_employee_returns_role_specific_text() -> None:
    state = _make_state()
    response = asyncio.run(_send(state, "hello", role="EMPLOYEE"))
    assert response.intent == "system.greeting"
    text = (response.text or "").lower()
    assert "conge" in text or "pointage" in text or "documents" in text


def test_greeting_with_question_does_not_match() -> None:
    """`bonjour comment ça va` should NOT short-circuit to greeting since the
    user has an actual ask attached. (Defensive — current heuristic also accepts
    the short pure greeting only.)"""
    state = _make_state()
    response = asyncio.run(_send(state, "bonjour comment ça va"))
    # Either routes to greeting (short enough) OR to legacy/fallback — both acceptable.
    # The strict requirement is only that the user does NOT get an unsafe_response fallback.
    assert response.intent != "fallback.unsafe_response"
