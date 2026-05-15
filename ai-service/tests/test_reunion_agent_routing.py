from __future__ import annotations

from typing import Any

import pytest

from app.agents.reunion_agent import ReunionAgent
from app.context.current_user import CurrentUserContext
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from app.tools.reunion_tools import register_reunion_tools


def _context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role=role, entreprise_id=9, token="token")


class FakeBackendClient:
    def __init__(self, *, next_returns_404: bool = False) -> None:
        self.calls: list[tuple[str, str]] = []
        self.next_returns_404 = next_returns_404

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        _ = params
        self.calls.append(("GET", path))
        if path == "/rh/reunions/mes-reunions":
            return ToolResult.ok(
                [
                    {"uuid": "abc-1", "titre": "Daily IA", "dateHeure": "2026-05-16T09:00:00"},
                    {"uuid": "abc-2", "titre": "Sprint planning", "dateHeure": "2026-05-17T14:00:00"},
                ],
                status_code=200,
            )
        if path == "/rh/reunions/prochaine":
            if self.next_returns_404:
                return ToolResult.fail("not_found", "Not found", status_code=404)
            return ToolResult.ok(
                {"uuid": "abc-1", "titre": "Daily IA", "dateHeure": "2026-05-16T09:00:00"},
                status_code=200,
            )
        return ToolResult.fail("not_found", "Not found", status_code=404)

    async def post(self, *args: Any, **kwargs: Any) -> ToolResult:
        raise AssertionError("post should not be hit — reunion agent is read-only")


def _agent_and_backend(*, next_returns_404: bool = False) -> tuple[ReunionAgent, FakeBackendClient]:
    backend = FakeBackendClient(next_returns_404=next_returns_404)
    registry = ToolRegistry()
    register_reunion_tools(registry, backend)  # type: ignore[arg-type]
    return ReunionAgent(ToolExecutor(registry)), backend


# ---------- intent detection -------------------------------------------------


@pytest.mark.parametrize(
    "message, expected_intent",
    [
        ("ma prochaine reunion", "reunion.next"),
        ("c quoi mon prochaine reunion", "reunion.next"),
        ("what is my next meeting", "reunion.next"),
        ("when is my upcoming meeting", "reunion.next"),
        ("mes reunions", "reunion.list_mine"),
        ("my meetings", "reunion.list_mine"),
        ("reunions", "reunion.list_mine"),
        ("meetings", "reunion.list_mine"),
        ("c quoi mon planning aujourd hui", "reunion.list_mine"),
        ("what is my schedule today", "reunion.list_mine"),
    ],
)
def test_intent_detection_multilingual(message: str, expected_intent: str) -> None:
    agent, _ = _agent_and_backend()
    intent, confidence = agent.detect_intent(message, _context())
    assert intent == expected_intent, f"got {intent!r} for {message!r}"
    assert confidence >= 0.7


def test_unrelated_messages_yield_zero_confidence() -> None:
    agent, _ = _agent_and_backend()
    assert agent.can_handle("show my leave balance", _context()) == 0.0
    assert agent.can_handle("creer equipe IA", _context("RH")) == 0.0
    assert agent.can_handle("est ce que jai pointer", _context()) == 0.0


# ---------- handle flows ----------------------------------------------------


@pytest.mark.asyncio
async def test_handle_next_meeting_uses_reunion_next_tool() -> None:
    agent, backend = _agent_and_backend()
    response = await agent.handle("ma prochaine reunion", _context())
    assert response.type == "answer"
    assert response.intent == "reunion.next"
    assert backend.calls == [("GET", "/rh/reunions/prochaine")]


@pytest.mark.asyncio
async def test_handle_my_meetings_uses_list_mine_tool() -> None:
    agent, backend = _agent_and_backend()
    response = await agent.handle("mes reunions", _context())
    assert response.type == "answer"
    assert response.intent == "reunion.list_mine"
    assert backend.calls == [("GET", "/rh/reunions/mes-reunions")]


@pytest.mark.asyncio
async def test_next_meeting_404_is_safe_empty_answer_not_error() -> None:
    """Backend 404 on prochaine = no upcoming meeting. Tool returns success+empty,
    agent surfaces it as a normal answer (not an error)."""
    agent, backend = _agent_and_backend(next_returns_404=True)
    response = await agent.handle("what is my next meeting", _context())
    assert response.type == "answer"
    assert response.intent == "reunion.next"
    assert "aucune" in response.text.lower() or "no" in response.text.lower()
    assert backend.calls == [("GET", "/rh/reunions/prochaine")]


@pytest.mark.asyncio
async def test_all_business_roles_can_route_to_reunion_agent() -> None:
    agent, _ = _agent_and_backend()
    for role in ("EMPLOYEE", "MANAGER", "RH", "ADMIN"):
        response = await agent.handle("mes reunions", _context(role))
        assert response.intent == "reunion.list_mine", f"role {role} did not route"


# ---------- router integration ----------------------------------------------


@pytest.mark.asyncio
async def test_router_explicit_domain_picks_reunion_for_next_meeting() -> None:
    from app.agents.attendance_agent import AttendanceAgent
    from app.agents.router_agent import RouterAgent
    from app.memory.confirmation_store import ConfirmationStore

    agent, backend = _agent_and_backend()
    attendance = AttendanceAgent(agent.executor, ConfirmationStore(ttl_seconds=60))
    router = RouterAgent(attendance_agent=attendance, extra_agents=[agent])

    response = await router.handle("ma prochaine reunion", _context())
    assert response.intent == "reunion.next"
    assert response.type == "answer"
    assert backend.calls and backend.calls[0][1] == "/rh/reunions/prochaine"
