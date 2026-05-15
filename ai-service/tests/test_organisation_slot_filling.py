"""Integration tests for the multi-turn slot-filling flow on organisation creates.

These exercise the full `process_copilot_message` path:
- Turn 1: user starts a create with incomplete info → agent asks for the
  missing field, conversation store captures the pending flow.
- Turn 2: user replies with just the missing value → slot-filling merges it
  with the previously-captured fields and builds a confirm_action envelope.
- Cancellation: typing 'annuler' clears the pending flow.
- Cross-domain escape: typing an unrelated query (e.g. 'mes reunions') aborts
  the pending org flow and routes the new message normally.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from app.core.copilot_engine import process_copilot_message
from app.tools.result import ToolResult


class FakeBackendClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []

    async def get(self, path: str, *, context, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params))
        if path == "/rh/reunions/mes-reunions":
            return ToolResult.ok([], status_code=200)
        return ToolResult.ok({}, status_code=200)

    async def post(self, path: str, *, context, json: dict[str, Any] | None = None, headers=None) -> ToolResult:
        _ = headers
        self.calls.append(("POST", path, json))
        return ToolResult.ok({"id": 99, "path": path, **(json or {})}, status_code=201)

    async def request(self, method: str, path: str, *, context, params=None, json=None, headers=None) -> ToolResult:
        _ = params, headers
        self.calls.append((method.upper(), path, json))
        return ToolResult.ok({"id": 99}, status_code=200)


def make_state() -> SimpleNamespace:
    return SimpleNamespace(
        copilot_ready=False,
        copilot_backend_client=FakeBackendClient(),
        settings=SimpleNamespace(
            backend_timeout_seconds=1, backend_base_url="http://localhost:8222/api/v1"
        ),
    )


async def send_as(
    state: SimpleNamespace,
    message: str,
    *,
    role: str = "RH",
    session_id: str = "s-org-slot",
):
    return await process_copilot_message(
        42,
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


# ---------- create_team multi-turn ------------------------------------------


def test_create_team_two_turn_flow_completes_with_confirmation() -> None:
    """'creer equipe IA' → asks for department → '3' → confirm_action envelope."""
    state = make_state()

    first = asyncio.run(send_as(state, "creer equipe IA"))
    assert first.type == "ask"
    assert first.intent == "organisation.create_team"
    assert "departement" in first.text.lower()
    pending = first.actionResult["pendingFlow"]
    assert pending["intent"] == "organisation.create_team"
    assert pending["collectedFields"]["name"] == "IA"
    assert pending["missingFields"] == ["departement_id"]

    second = asyncio.run(send_as(state, "3"))
    assert second.type == "confirm_action"
    assert second.intent == "organisation.create_team"
    assert second.toolCalls[0].name == "organisation.create_team"
    args = second.toolCalls[0].arguments
    assert args["nom"] == "IA"
    assert args["departement_id"] == 3
    assert args["est_active"] is True
    # No backend POST yet — confirmation is still pending user accept.
    backend: FakeBackendClient = state.copilot_backend_client  # type: ignore[assignment]
    assert all(call[0] != "POST" for call in backend.calls)


def test_create_team_two_turn_with_departement_anchor() -> None:
    """User can answer 'departement 5' (verbose) instead of bare '5'."""
    state = make_state()

    asyncio.run(send_as(state, "creer equipe Frontend"))
    second = asyncio.run(send_as(state, "departement 5"))
    assert second.type == "confirm_action"
    assert second.toolCalls[0].arguments["departement_id"] == 5


# ---------- create_department multi-turn ------------------------------------


def test_create_department_two_turn_flow_completes_with_confirmation() -> None:
    """'creer departement Recherche' → asks for code → 'RND-2' → confirm_action."""
    state = make_state()

    first = asyncio.run(send_as(state, "creer departement Recherche"))
    assert first.type == "ask"
    assert first.intent == "organisation.create_department"
    assert "code" in first.text.lower()
    assert first.actionResult["pendingFlow"]["collectedFields"]["name"] == "Recherche"
    assert first.actionResult["pendingFlow"]["missingFields"] == ["code_interne"]

    second = asyncio.run(send_as(state, "RND-2"))
    assert second.type == "confirm_action"
    assert second.intent == "organisation.create_department"
    assert second.toolCalls[0].name == "organisation.create_department"
    args = second.toolCalls[0].arguments
    assert args["nom"] == "Recherche"
    assert args["code_interne"] == "RND-2"


def test_create_department_two_turn_with_code_anchor() -> None:
    """User can answer 'code TECH' (anchored) too."""
    state = make_state()

    asyncio.run(send_as(state, "creer departement Engineering"))
    second = asyncio.run(send_as(state, "code TECH"))
    assert second.type == "confirm_action"
    assert second.toolCalls[0].arguments["code_interne"] == "TECH"


# ---------- cancel mid-flow --------------------------------------------------


def test_create_team_cancel_clears_pending_flow() -> None:
    """Typing 'annuler' mid-flow returns a cancelled answer."""
    state = make_state()

    asyncio.run(send_as(state, "creer equipe IA"))
    response = asyncio.run(send_as(state, "annuler"))
    assert response.type == "answer"
    assert response.intent == "organisation.create_team.cancelled"


# ---------- cross-domain escape ---------------------------------------------


def test_create_team_escapes_when_user_pivots_to_meeting_query() -> None:
    """Mid-flow 'mes reunions' should abandon the org flow and route to reunion."""
    state = make_state()

    first = asyncio.run(send_as(state, "creer equipe IA"))
    assert first.intent == "organisation.create_team"

    second = asyncio.run(send_as(state, "mes reunions"))
    # The pending org flow should be cleared and the new message routed to reunion.
    assert second.intent != "organisation.create_team"
    assert "reunion" in second.intent or second.intent.startswith("reunion.")


def test_create_team_stays_alive_when_user_clarifies_department_naturally() -> None:
    """'departement 5' contains the domain term 'departement' so the flow continues."""
    state = make_state()

    asyncio.run(send_as(state, "creer equipe IA"))
    second = asyncio.run(send_as(state, "departement 5"))
    # Did not escape; resolved to confirmation.
    assert second.intent == "organisation.create_team"
    assert second.type == "confirm_action"


# ---------- safety: no premature POST ---------------------------------------


def test_pending_flow_never_hits_backend_post() -> None:
    """Even after slot-filling completes, the backend write must wait for explicit confirm."""
    state = make_state()
    backend: FakeBackendClient = state.copilot_backend_client  # type: ignore[assignment]

    asyncio.run(send_as(state, "creer equipe IA"))
    asyncio.run(send_as(state, "3"))
    asyncio.run(send_as(state, "creer departement Lab code LAB"))

    posted = [call for call in backend.calls if call[0] == "POST"]
    assert posted == [], f"unexpected POST calls during slot-filling: {posted}"
