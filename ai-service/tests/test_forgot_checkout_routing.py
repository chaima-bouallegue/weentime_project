"""AI-FE-MASTER-CHATBOT-01 — forgotten-checkout intent routing.

Regression: "Did I forget checkout?" matched no attendance detector and fell
through to the legacy/LLM path, producing fallback.unsafe_response when no
provider was reachable. The fix is a dedicated intent that consults
get_pointage_status and answers deterministically based on checkIn/checkOut
state.
"""

from __future__ import annotations

import asyncio

from app.agents.attendance_agent import AttendanceAgent
from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.tools.result import ToolResult


class _StubExecutor:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    async def execute(self, tool_name: str, payload, context):  # noqa: ANN001
        assert tool_name == "get_pointage_status"
        return ToolResult.ok(self._payload)


class _StubConfirmationStore:
    pass


def _ctx() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=1,
        role="EMPLOYEE",
        entreprise_id=1,
        token=None,
        metadata={"chatbot_public_context": True, "jwt_verified": False},
    )


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_did_i_forget_checkout_routes_to_forgot_intent() -> None:
    agent = AttendanceAgent(executor=_StubExecutor({}), confirmation_store=_StubConfirmationStore())
    for prompt in (
        "Did I forget checkout?",
        "did i forget to check out",
        "forgot to clock out",
        "j'ai oublié de pointer la sortie",
        "ai-je oublié la sortie ?",
        "nsit nkharej",
    ):
        intent, conf = agent.detect_intent(prompt, _ctx())
        assert intent == "attendance.forgot_checkout", prompt
        assert conf >= 0.55, prompt


def test_forgot_checkout_does_not_hijack_normal_checkout() -> None:
    agent = AttendanceAgent(executor=_StubExecutor({}), confirmation_store=_StubConfirmationStore())
    # "Pointer ma sortie" must still create a check_out confirmation, not be
    # interpreted as the forgot-checkout question.
    intent, _ = agent.detect_intent("pointer ma sortie", _ctx())
    assert intent == "attendance.check_out"


def test_handle_reports_missing_checkout_when_session_active() -> None:
    payload = {"active": True, "status": "ACTIVE", "checkIn": "09:00", "checkOut": None}
    agent = AttendanceAgent(executor=_StubExecutor(payload), confirmation_store=_StubConfirmationStore())
    response = _run(agent.handle("Did I forget checkout?", _ctx()))
    assert response.type == "answer"
    assert response.intent == "attendance.forgot_checkout"
    assert "09:00" in response.text
    assert "sortie n'est pas encore enregistree" in response.text


def test_handle_confirms_checkout_recorded() -> None:
    payload = {"active": False, "status": "CLOSED", "checkIn": "09:00", "checkOut": "18:00"}
    agent = AttendanceAgent(executor=_StubExecutor(payload), confirmation_store=_StubConfirmationStore())
    response = _run(agent.handle("did i forget to check out", _ctx()))
    assert "Non" in response.text
    assert "18:00" in response.text


def test_handle_reports_no_check_in() -> None:
    payload = {"active": False, "status": None, "checkIn": None, "checkOut": None}
    agent = AttendanceAgent(executor=_StubExecutor(payload), confirmation_store=_StubConfirmationStore())
    response = _run(agent.handle("Did I forget checkout?", _ctx()))
    assert "pas pointe l'entree" in response.text


def test_forgot_checkout_detects_from_original_text_after_router_rewrite() -> None:
    # Regression: the upstream RouterAgent rewrites messages matching the
    # multilingual CHECK_OUT pattern to "pointer ma sortie" before calling
    # AttendanceAgent. The forgot-checkout detector must still fire by
    # inspecting context.metadata["original_text"].
    agent = AttendanceAgent(executor=_StubExecutor({}), confirmation_store=_StubConfirmationStore())
    context = _ctx()
    context.metadata = {
        **context.metadata,
        "original_text": "j'ai oublié de pointer la sortie",
        "normalized_text": "j'ai oublie de pointer la sortie",
    }
    intent, _ = agent.detect_intent("pointer ma sortie", context)
    assert intent == "attendance.forgot_checkout"


def test_forgot_checkout_response_passes_guard() -> None:
    payload = {"active": True, "status": "ACTIVE", "checkIn": "09:00", "checkOut": None}
    agent = AttendanceAgent(executor=_StubExecutor(payload), confirmation_store=_StubConfirmationStore())
    response = _run(agent.handle("Did I forget checkout?", _ctx()))
    assert ResponseGuard().validate(response, _ctx()).allowed
