from __future__ import annotations

import asyncio
from pathlib import Path

from app.agents.hr_policy_agent import HRPolicyAgent, POLICY_UNAVAILABLE_TEXT
from app.agents.legacy_agent import LegacyAgent
from app.agents.router_agent import RouterAgent
from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.policy import LocalPolicyStore, PolicyRetriever
from app.guards.response_guard import ResponseGuard
from app.tools.audit import ToolAuditLogger
from app.tools.executor import ToolExecutor
from app.tools.policy_tools import register_policy_tools
from app.tools.registry import ToolRegistry

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "policies"


class EmptyAttendance:
    name = "attendance"

    def can_handle(self, message, context):
        return 0.0

    async def handle(self, message, context):
        return AgentResponse(type="answer", text="attendance", intent="attendance.status", confidence=1.0)


def context(role: str = "EMPLOYEE", tenant_id: int | None = 42) -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=tenant_id, token="token", language="fr")


def make_executor() -> ToolExecutor:
    registry = ToolRegistry()
    retriever = PolicyRetriever(LocalPolicyStore(FIXTURE_DIR))
    register_policy_tools(registry, retriever)
    return ToolExecutor(registry, ToolAuditLogger())


def test_policy_question_routes_to_hr_policy_agent() -> None:
    agent = HRPolicyAgent(make_executor())
    router = RouterAgent(EmptyAttendance(), extra_agents=[agent], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Quelle est la politique de conge maladie ?", context()))

    assert response.type == "answer"
    assert response.intent == "policy.leave_rule"
    assert response.actionResult is not None
    assert response.actionResult["agent"] == "HRPolicyAgent"
    assert response.actionResult["policyAvailable"] is True
    assert response.actionResult["citations"][0]["sourceId"] == "tenant42-sick-leave"


def test_answer_uses_approved_source() -> None:
    agent = HRPolicyAgent(make_executor())

    response = asyncio.run(agent.handle("quelle est la politique de conge maladie", context()))

    assert response.actionResult is not None
    assert response.actionResult["policyAvailable"] is True
    assert "tenant42-sick-leave" == response.actionResult["citations"][0]["sourceId"]
    assert response.actionResult["citations"][0]["chunkId"] == "tenant42-sick-leave:keyword"
    assert "tenant42-sick-leave" in response.text
    assert "certificat" in response.text.lower()
    assert ResponseGuard().validate(response, context()).allowed is True


def test_missing_source_returns_unavailable_answer() -> None:
    agent = HRPolicyAgent(make_executor())

    response = asyncio.run(agent.handle("Quelle est la politique parking velo ?", context()))

    assert response.text == POLICY_UNAVAILABLE_TEXT
    assert response.actionResult is not None
    assert response.actionResult["policyAvailable"] is False
    assert response.actionResult["citations"] == []


def test_no_invented_answer_when_citations_empty() -> None:
    agent = HRPolicyAgent(make_executor())

    response = asyncio.run(agent.handle("What is the unicorn sabbatical policy?", context()))

    assert response.text == POLICY_UNAVAILABLE_TEXT
    assert response.actionResult is not None
    assert response.actionResult["answer"] == POLICY_UNAVAILABLE_TEXT
    assert response.actionResult["citations"] == []


def test_cross_tenant_policy_source_is_not_used() -> None:
    agent = HRPolicyAgent(make_executor())

    response = asyncio.run(agent.handle("Quelle est la source autre tenant confidentielle ?", context(tenant_id=42)))

    assert response.actionResult is not None
    assert response.actionResult["policyAvailable"] is False


def test_english_policy_question_routes_and_cites_source() -> None:
    agent = HRPolicyAgent(make_executor())
    router = RouterAgent(EmptyAttendance(), extra_agents=[agent], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("What is the remote work policy?", context()))

    assert response.intent == "policy.telework_rule"
    assert response.actionResult is not None
    assert response.actionResult["policyAvailable"] is True
    assert response.actionResult["citations"][0]["sourceId"] == "tenant42-remote-friday"


def test_arabic_policy_question_routes() -> None:
    agent = HRPolicyAgent(make_executor())
    router = RouterAgent(EmptyAttendance(), extra_agents=[agent], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("ما هي سياسة العطل؟", context()))

    assert response.intent == "policy.leave_rule"
    assert response.actionResult is not None
    assert response.actionResult["policyAvailable"] is True
    assert response.actionResult["citations"][0]["sourceId"] == "tenant42-ar-leave"


def test_legacy_fallback_still_handles_unrelated_prompt() -> None:
    async def legacy_handler(request):
        return AgentResponse(type="answer", text="legacy", intent="legacy.intent", confidence=0.5)

    router = RouterAgent(
        EmptyAttendance(),
        extra_agents=[HRPolicyAgent(make_executor())],  # type: ignore[arg-type]
        legacy_agent=LegacyAgent(legacy_handler),
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("message hors domaine", context()))

    assert response.intent == "legacy.intent"
