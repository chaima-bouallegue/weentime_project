"""RH chatbot hotfix reproductions and regression coverage (RH-AGENT-HOTFIX-01).

Each test below corresponds to a problem reported in the hotfix task. They go
through the full `process_copilot_message` pipeline so they exercise:
  - RouterAgent priority / intent detection
  - RHAgent / DocumentAgent / AttendanceAgent / RoleCopilots
  - ToolRegistry role gating
  - ResponseGuard (the actual root cause of clusters A and B)

A FakeBackendClient stands in for the Spring services so the tests do not
require a running gateway or rh-service. The backend simulators return the
exact response envelopes that the real services use.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from app.context.current_user import CurrentUserContext
from app.core.copilot_engine import process_copilot_message
from app.tools.result import ToolResult


def _verified_rh_context() -> CurrentUserContext:
    """Build a CurrentUserContext with is_verified=True so tools execute.

    This matches production behaviour when CHATBOT_PUBLIC_MODE is enabled and
    chat_v2 builds an anonymous chatbot context (see anonymous_context.py). The
    legacy `allow_legacy_without_token` path produces is_verified=False which
    causes the registry to deny every tool with status='denied' — that masks
    the real RH-backlog bug, so this fixture deliberately bypasses it.
    """
    ctx = CurrentUserContext(
        user_id=42,
        role="RH",
        entreprise_id=9,
        token="",
        locale="fr-FR",
        language="fr",
    )
    ctx.metadata["jwt_verified"] = True
    ctx.metadata["source"] = "test_rh_agent_fixture"
    return ctx


class FakeBackendClient:
    """Realistic enough backend stand-in for the RH chatbot hotfix tests."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, Any]] = []

    async def get(self, path: str, *, context, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params))

        # RH backlog / pending validations tools (RH role).
        if path == "/rh/conges/rh/pending":
            return ToolResult.ok(
                {
                    "content": [
                        {"id": 11, "typeDemande": "CONGE", "statut": "EN_ATTENTE_RH",
                         "employe": "Ahmed", "dateDebut": "2026-05-20"}
                    ],
                    "totalElements": 1,
                },
                status_code=200,
            )
        if path == "/rh/teletravail/en-attente-rh":
            return ToolResult.ok({"content": [], "totalElements": 0}, status_code=200)
        if path == "/rh/autorisations/rh/history":
            return ToolResult.ok({"content": [], "totalElements": 0}, status_code=200)
        if path == "/documents/mes-demandes":
            return ToolResult.ok({"content": [], "totalElements": 0}, status_code=200)
        if path == "/rh/stats":
            return ToolResult.ok({"totalDemandes": 12, "enAttenteRh": 1}, status_code=200)

        # Presence me/today (any role, including RH).
        if path == "/presence/me/today":
            return ToolResult.ok(
                {"status": "CHECKED_IN", "checkIn": "09:00", "checkOut": None},
                status_code=200,
            )

        return ToolResult.ok({}, status_code=200)

    async def post(self, path: str, *, context, json: dict[str, Any] | None = None, headers=None) -> ToolResult:
        _ = headers
        self.calls.append(("POST", path, json))
        return ToolResult.ok({"id": 99, **(json or {})}, status_code=201)

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


async def send_rh(state: SimpleNamespace, message: str, *, session_id: str = "s-rh-hotfix"):
    return await process_copilot_message(
        42,
        message,
        None,
        "RH",
        metadata={
            "app_state": state,
            "session_id": session_id,
            "entreprise_id": 9,
        },
        context=_verified_rh_context(),
    )


# ============================================================================
# Cluster A — Guard rejection on RH dashboard prompts (Problems 1, 2, 3, 4)
# ============================================================================


def test_rh_backlog_does_not_trigger_guard_rejection() -> None:
    """Problem 1: 'RH backlog' returns fallback.guard_rejected.

    Root cause: RHAgent._read_rh_requests sets actionResult.kind='rh_request_summary'
    which is NOT in _has_authoritative_data's whitelist. The response text contains
    'demandes ... en attente' which triggers HallucinatedHrValueRule._request_status
    regex. Result: guard rejects.

    Fix: add 'rh_request_summary' to the authoritative-data kind whitelist.
    """
    state = make_state()
    response = asyncio.run(send_rh(state, "RH backlog"))
    assert not response.intent.startswith("fallback.guard_rejected"), (
        f"RH backlog should not trigger guard rejection; got intent={response.intent}"
    )


def test_pending_validations_does_not_trigger_guard_rejection() -> None:
    """Problem 2: 'Pending validations' returns fallback.guard_rejected.

    Same root cause as test_rh_backlog_does_not_trigger_guard_rejection.
    """
    state = make_state()
    response = asyncio.run(send_rh(state, "Pending validations"))
    assert not response.intent.startswith("fallback.guard_rejected"), (
        f"Pending validations should not trigger guard rejection; got intent={response.intent}"
    )


def test_personal_pointage_for_rh_does_not_trigger_guard_rejection() -> None:
    """Problem 4: 'est ce que je suis pointer' returns guard rejected for RH.

    AttendanceAgent.detect_intent matches 'est ce que je suis' AND 'pointer' (via
    has_attendance_word) → attendance.status. The tool returns success=True so the
    guard SHOULD accept. This test pins that behaviour.
    """
    state = make_state()
    response = asyncio.run(send_rh(state, "est ce que je suis pointer"))
    assert not response.intent.startswith("fallback.guard_rejected"), (
        f"Personal pointage for RH should not be rejected; got intent={response.intent}"
    )


# ============================================================================
# Cluster B — Capability messaging (Problem 5)
# ============================================================================


def test_rh_user_creation_returns_capability_unavailable_not_unsafe_fallback() -> None:
    """Problem 5: 'je veux créer un nouveau user' returns fallback.unsafe_response.

    Root cause: AdminAgent rejects non-ADMIN (returns can_handle=0.0). RHAgent does
    not detect user-creation intent. No agent claims it → falls through to legacy /
    unknown fallback. The expected behaviour is a clear capability-unavailable
    message that lists what RH CAN do (assign employee/team/department/manager).

    Fix: extend RHAgent.detect_intent to recognise user-creation intent and return a
    capability-unavailable response listing real RH capabilities.
    """
    state = make_state()
    response = asyncio.run(send_rh(state, "je veux creer un nouveau user"))
    assert not response.intent.startswith("fallback.unsafe_response"), (
        f"User-creation question from RH should not return unsafe fallback; got intent={response.intent}"
    )
    assert not response.intent.startswith("fallback.guard_rejected")
    # Response text should clearly explain RH cannot create platform users.
    text_lower = (response.text or "").lower()
    assert "rh" in text_lower or "admin" in text_lower or "ne peut pas" in text_lower or "cannot" in text_lower, (
        f"Capability message should explain RH-vs-ADMIN scope; got text={response.text!r}"
    )


def test_rh_create_user_in_english_also_handled() -> None:
    """Same as above but for 'create user' / 'new user' English variants."""
    state = make_state()
    response = asyncio.run(send_rh(state, "create new user"))
    assert not response.intent.startswith("fallback.unsafe_response"), (
        f"create new user from RH should not return unsafe fallback; got intent={response.intent}"
    )


# ============================================================================
# Cluster C — Document tool role-aware pre-flight (Problem 6)
# ============================================================================


def test_rh_document_request_does_not_offer_confirmation_then_fail() -> None:
    """Problem 6: 'document attestation de travail' offers confirmation for RH,
    then on accept the registry denies the call (allowed_roles={'EMPLOYEE'}).

    Root cause: DocumentAgent.handle for intent=document.create does not pre-check
    role. Registry enforces correctly at execution time, but the UX dance is broken:
    user gets a confirmation envelope, then a denial.

    Fix: DocumentAgent should pre-check role and return capability-unavailable for
    RH/ADMIN asking to CREATE a document request (those roles use different tools).
    """
    state = make_state()
    response = asyncio.run(send_rh(state, "document attestation de travail"))
    # Should NOT be a confirm_action that would fail on execution.
    if response.type == "confirm_action":
        assert False, (
            f"DocumentAgent should not offer a confirm_action for RH role on "
            f"document.create_request (allowed_roles={{'EMPLOYEE'}}); got "
            f"intent={response.intent}, toolCalls={response.toolCalls}"
        )
    # Acceptable: type='answer' with capability-unavailable explanation,
    # or type='ask' offering RH-specific document tools, or type='error'.
    assert response.intent != "fallback.unsafe_response"


# ============================================================================
# Regression — preserve currently-working RH paths
# ============================================================================


def test_rh_role_greeting_still_works() -> None:
    """Greeting path should remain deterministic and pass the guard."""
    state = make_state()
    response = asyncio.run(send_rh(state, "Bonjour"))
    assert response.intent == "system.greeting"
    assert response.type == "answer"
    assert "rh" in (response.text or "").lower()


def test_rh_stats_still_passes_guard() -> None:
    """'RH stats' path uses rh.get_stats — should be fine; pins regression."""
    state = make_state()
    response = asyncio.run(send_rh(state, "stats RH"))
    assert not response.intent.startswith("fallback.guard_rejected")
