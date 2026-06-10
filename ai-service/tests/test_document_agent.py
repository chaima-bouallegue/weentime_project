from __future__ import annotations

import asyncio
from typing import Any

from app.agents.document_agent import DocumentAgent
from app.agents.legacy_agent import LegacyAgent
from app.agents.router_agent import RouterAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any], bool]] = []

    async def execute(self, tool_name, payload, context, *, confirmed=False, **kwargs):
        self.calls.append((tool_name, payload or {}, confirmed))
        return ToolResult.ok({"read_result": {"kind": "read_result", "summary": f"ok:{tool_name}", "items": [], "count": 0}})


class FakeAttendance:
    name = "attendance"

    def can_handle(self, message, context):
        return 0.0

    async def handle(self, message, context):
        return AgentResponse(type="answer", text="attendance", intent="attendance.status", confidence=1.0)


def context(role: str = "EMPLOYEE", *, language: str = "fr") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token", language=language)


def test_document_request_asks_document_type_if_missing() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux un document", context()))

    assert response.type == "ask"
    assert response.intent == "document.create"
    assert "type de document" in response.text.lower()


def test_work_certificate_request_returns_confirmation() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Demande une attestation de travail", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "document.create_request"
    assert response.toolCalls[0].arguments["document_type"] == "ATTESTATION_TRAVAIL"


def test_show_my_documents_calls_list_tool() -> None:
    executor = FakeExecutor()
    agent = DocumentAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Show my documents", context()))

    assert response.type == "answer"
    assert response.intent == "document.list"
    assert executor.calls[0][0] == "document.list_my_requests"


def test_arabic_work_certificate_routes_to_document_agent() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("أريد شهادة عمل", context()))

    assert response.type == "confirm_action"
    assert response.intent == "document.create"
    assert response.toolCalls[0].name == "document.create_request"
    assert response.toolCalls[0].arguments["document_type"] == "ATTESTATION_TRAVAIL"


def test_payslip_request_asks_for_month_before_confirmation() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("I need my payslip", context(language="en")))

    assert response.type == "ask"
    assert response.intent == "document.create"
    assert "month" in response.text.lower()
    assert response.toolCalls == []


def test_manager_payslip_request_asks_for_month() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux un bulletin de paie", context("MANAGER")))

    assert response.type == "ask"
    assert response.intent == "document.create"
    assert "mois" in response.text.lower()


def test_payslip_request_with_month_returns_confirmation() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Je veux un bulletin de paie avril 2026", context()))

    assert response.type == "confirm_action"
    assert response.toolCalls[0].arguments["document_type"] == "BULLETIN_PAIE"
    assert response.toolCalls[0].arguments["month"] == "Avril 2026"


def test_rh_personal_document_request_is_not_confirmed() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("je veux une attestation de travail", context("RH")))

    assert response.type == "answer"
    assert response.confirmationId is None
    assert response.actionResult["kind"] == "capability_unavailable"


def test_document_status_without_id_lists_documents() -> None:
    executor = FakeExecutor()
    agent = DocumentAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Quel est le statut de mon document ?", context()))

    assert response.type == "answer"
    assert response.intent == "document.list"
    assert executor.calls[0][0] == "document.list_my_requests"


def test_document_open_asks_when_request_id_missing() -> None:
    agent = DocumentAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("ouvrir mon document", context()))

    assert response.type == "ask"
    assert response.intent == "document.open"


def test_document_open_calls_open_tool_with_request_id() -> None:
    executor = FakeExecutor()
    agent = DocumentAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("ouvrir document 42", context()))

    assert response.type == "answer"
    assert executor.calls[0][0] == "document.open"
    assert executor.calls[0][1] == {"request_id": 42}


def test_router_routes_document_before_legacy_agent() -> None:
    executor = FakeExecutor()
    document_agent = DocumentAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    async def legacy_handler(request):
        return AgentResponse(type="answer", text="legacy", intent="legacy.intent", confidence=0.5)

    router = RouterAgent(
        FakeAttendance(),
        extra_agents=[document_agent],
        legacy_agent=LegacyAgent(legacy_handler),
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("Show my documents", context()))

    assert response.intent == "document.list"
    assert executor.calls[0][0] == "document.list_my_requests"


def test_legacy_agent_still_handles_unsupported_document_flow() -> None:
    async def legacy_handler(request):
        return AgentResponse(type="answer", text="legacy", intent="legacy.intent", confidence=0.5)

    router = RouterAgent(
        FakeAttendance(),
        extra_agents=[DocumentAgent(FakeExecutor(), ConfirmationStore())],  # type: ignore[arg-type]
        legacy_agent=LegacyAgent(legacy_handler),
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("message hors domaine", context()))

    assert response.intent == "legacy.intent"
