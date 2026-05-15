from __future__ import annotations

from typing import Any

import pytest

from app.agents.organisation_agent import OrganisationAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.executor import ToolExecutor
from app.tools.organisation_structure_tools import register_organisation_structure_tools
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult


def _context(role: str = "RH", *, tenant_id: int = 9) -> CurrentUserContext:
    return CurrentUserContext(user_id=42, role=role, entreprise_id=tenant_id, token="token")


class FakeBackendClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        self.calls.append(("GET", path, params))
        if path == "/organisations/equipes":
            return ToolResult.ok({"content": [{"id": 1, "nom": "IA"}], "totalElements": 1}, status_code=200)
        if path == "/organisations/departements":
            return ToolResult.ok({"content": [{"id": 3, "nom": "Tech"}], "totalElements": 1}, status_code=200)
        return ToolResult.fail("not_found", "Not found", status_code=404)

    async def post(self, *args: Any, **kwargs: Any) -> ToolResult:
        # writes should not be reached without the executor confirming
        raise AssertionError("post should not be hit by an ask/confirm response path")

    async def request(self, *args: Any, **kwargs: Any) -> ToolResult:
        raise AssertionError("request should not be hit")


def _agent_and_backend() -> tuple[OrganisationAgent, FakeBackendClient]:
    backend = FakeBackendClient()
    registry = ToolRegistry()
    register_organisation_structure_tools(registry, backend)  # type: ignore[arg-type]
    executor = ToolExecutor(registry)
    confirmations = ConfirmationStore(ttl_seconds=60)
    return OrganisationAgent(executor, confirmations), backend


# ---------- intent detection -------------------------------------------------


@pytest.mark.parametrize(
    "message, expected_intent",
    [
        ("liste les equipes", "organisation.list_teams"),
        ("show all teams", "organisation.list_teams"),
        ("list departments", "organisation.list_departments"),
        ("voir les departements", "organisation.list_departments"),
        ("equipes", "organisation.list_teams"),  # short topic-only
        ("departments", "organisation.list_departments"),
        ("creer equipe IA dans departement 3", "organisation.create_team"),
        ("create team frontend in department 4", "organisation.create_team"),
        ("creer departement Recherche", "organisation.create_department"),
        ("create department Engineering", "organisation.create_department"),
        ("nheb naamel equipe jdida fi departement 3", "organisation.create_team"),
        ("أنشئ فريق IA", "organisation.create_team"),
    ],
)
def test_intent_detection_multilingual(message: str, expected_intent: str) -> None:
    agent, _ = _agent_and_backend()
    intent, confidence = agent.detect_intent(message, _context("RH"))
    assert intent == expected_intent, f"got {intent!r} for {message!r}"
    assert confidence >= 0.7


def test_unrelated_message_yields_unknown_intent_and_zero_confidence() -> None:
    agent, _ = _agent_and_backend()
    assert agent.can_handle("show my leave balance", _context("EMPLOYEE")) == 0.0
    assert agent.can_handle("bonjour", _context("RH")) == 0.0
    assert agent.can_handle("est ce que jai pointer", _context("RH")) == 0.0


# ---------- list flows -------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_list_teams_calls_tool_and_returns_answer() -> None:
    agent, backend = _agent_and_backend()
    response = await agent.handle("liste les equipes", _context("RH"))
    assert response.type == "answer"
    assert response.intent == "organisation.list_teams"
    assert backend.calls and backend.calls[0][1] == "/organisations/equipes"


@pytest.mark.asyncio
async def test_handle_list_departments_calls_tool_and_returns_answer() -> None:
    agent, backend = _agent_and_backend()
    response = await agent.handle("show departments", _context("ADMIN"))
    assert response.type == "answer"
    assert response.intent == "organisation.list_departments"
    assert backend.calls and backend.calls[0][1] == "/organisations/departements"


# ---------- create flows: missing fields ask, no backend hit -----------------


@pytest.mark.asyncio
async def test_create_team_without_department_asks_for_it() -> None:
    agent, backend = _agent_and_backend()
    response = await agent.handle("creer equipe IA", _context("RH"))
    assert response.type == "ask"
    assert response.intent == "organisation.create_team"
    assert "departement" in response.text.lower()
    assert backend.calls == []  # no backend hit on ask


@pytest.mark.asyncio
async def test_create_department_without_code_asks_for_it() -> None:
    agent, backend = _agent_and_backend()
    response = await agent.handle("creer departement Recherche", _context("RH"))
    assert response.type == "ask"
    assert response.intent == "organisation.create_department"
    assert "code" in response.text.lower()
    assert backend.calls == []


# ---------- create flows: full info → confirmation envelope ------------------


@pytest.mark.asyncio
async def test_create_team_with_department_returns_confirmation() -> None:
    agent, backend = _agent_and_backend()
    response = await agent.handle("creer equipe IA-NLP dans departement 3", _context("RH"))
    assert response.type == "confirm_action"
    assert response.intent == "organisation.create_team"
    assert response.requiresConfirmation is True
    assert response.confirmationId is not None
    assert response.toolCalls and response.toolCalls[0].name == "organisation.create_team"
    args = response.toolCalls[0].arguments
    assert args["nom"] == "IA-NLP"
    assert args["departement_id"] == 3
    # confirmation envelope means the POST is NOT executed yet:
    assert backend.calls == []


@pytest.mark.asyncio
async def test_create_team_extracts_name_with_quotes() -> None:
    agent, _ = _agent_and_backend()
    response = await agent.handle(
        'create team "Frontend Core" in department 7', _context("ADMIN")
    )
    assert response.type == "confirm_action"
    args = response.toolCalls[0].arguments
    assert args["nom"] == "Frontend Core"
    assert args["departement_id"] == 7


@pytest.mark.asyncio
async def test_create_department_with_code_returns_confirmation() -> None:
    agent, backend = _agent_and_backend()
    response = await agent.handle(
        "creer departement Recherche code RND-2", _context("RH")
    )
    assert response.type == "confirm_action"
    assert response.intent == "organisation.create_department"
    args = response.toolCalls[0].arguments
    assert args["nom"] == "Recherche"
    assert args["code_interne"] == "RND-2"
    assert backend.calls == []


# ---------- router integration ----------------------------------------------


@pytest.mark.asyncio
async def test_router_explicit_domain_picks_organisation_for_create_team() -> None:
    """`RouterAgent._explicit_domain` should pick 'organisation' for a create-team message,
    short-circuiting before confidence ranking."""
    from app.agents.attendance_agent import AttendanceAgent
    from app.agents.router_agent import RouterAgent

    agent, backend = _agent_and_backend()
    attendance = AttendanceAgent(agent.executor, agent.confirmation_store)
    router = RouterAgent(attendance_agent=attendance, extra_agents=[agent])

    response = await router.handle("creer equipe IA dans departement 3", _context("RH"))
    assert response.intent == "organisation.create_team"
    assert response.type == "confirm_action"
