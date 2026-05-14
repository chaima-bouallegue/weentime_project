from __future__ import annotations

import asyncio
from typing import Any

from app.agents.manager_agent import ManagerAgent
from app.agents.rh_agent import RHAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.result import ToolResult, build_read_result


class FakeExecutor:
    def __init__(self, items: list[dict[str, Any]] | None = None) -> None:
        self.items = items or []
        self.calls: list[str] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append(tool_name)
        if tool_name in {"leave.get_request_status", "telework.get_status", "authorization.get_status", "document.get_status"}:
            request_id = (payload or {}).get("request_id")
            item = next((item for item in self.items if int(item.get("id", 0)) == int(request_id)), None)
            if item is None:
                return ToolResult.fail("not_found", "Not found", status_code=404)
            return ToolResult.ok(
                {
                    "read_result": build_read_result(
                        tool_name=tool_name,
                        summary="detail",
                        items=[item],
                        count=1,
                    )
                },
                status_code=200,
            )
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary="pending",
                    items=self.items,
                    count=len(self.items),
                )
            },
            status_code=200,
        )


def context(role: str) -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=2, token="token")


def test_manager_approval_fetches_details_before_confirmation() -> None:
    executor = FakeExecutor([{"id": 42, "employee": "Amin Dupont", "type": "CONGE", "dateDebut": "2026-05-20", "statut": "EN_ATTENTE", "motif": "repos"}])
    agent = ManagerAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve le conge 42", context("MANAGER")))

    assert response.type == "confirm_action"
    assert executor.calls[0] == "leave.get_request_status"
    assert response.toolCalls[0].name == "leave.manager_decide"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "approval_confirmation"
    assert "Amin Dupont" in response.text


def test_manager_approval_without_match_asks_for_clarification() -> None:
    agent = ManagerAgent(FakeExecutor([]), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve le conge 42", context("MANAGER")))

    assert response.type == "ask"
    assert response.intent == "manager.approve"


def test_manager_pending_uses_modern_read_tools() -> None:
    executor = FakeExecutor([{"id": 42, "employee": "Amin Dupont", "type": "CONGE", "statut": "EN_ATTENTE"}])
    agent = ManagerAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Quelles validations sont en attente ?", context("MANAGER")))

    assert response.type == "answer"
    assert executor.calls == ["leave.list_manager_requests", "telework.list_manager_requests", "authorization.list_manager_requests"]
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "manager_pending_summary"


def test_rh_approval_fetches_details_before_confirmation() -> None:
    executor = FakeExecutor([{"id": 8, "employee": "Amin Dupont", "type": "TELETRAVAIL", "dateDebut": "2026-05-20", "statut": "EN_ATTENTE_RH"}])
    agent = RHAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve la demande teletravail 8", context("RH")))

    assert response.type == "confirm_action"
    assert executor.calls[0] == "telework.get_status"
    assert response.toolCalls[0].name == "telework.rh_decide"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "approval_confirmation"
    assert "Amin Dupont" in response.text


def test_rh_pending_requests_use_modern_read_tools() -> None:
    executor = FakeExecutor([{"id": 8, "employee": "Amin Dupont", "type": "TELETRAVAIL", "statut": "EN_ATTENTE_RH"}])
    agent = RHAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Quelles validations RH sont en attente ?", context("RH")))

    assert response.type == "answer"
    assert executor.calls == ["leave.list_rh_pending", "telework.list_rh_pending", "authorization.list_rh_requests", "document.list_my_requests"]
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "rh_request_summary"


def test_manager_ambiguous_request_without_type_asks_for_choice() -> None:
    executor = FakeExecutor(
        [
            {"id": 42, "employee": "Amin Dupont", "type": "CONGE", "dateDebut": "2026-05-20", "statut": "EN_ATTENTE"},
            {"id": 42, "employee": "Amin Dupont", "type": "TELETRAVAIL", "dateDebut": "2026-05-21", "statut": "EN_ATTENTE"},
        ]
    )
    agent = ManagerAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve la demande 42", context("MANAGER")))

    assert response.type == "ask"
    assert response.actionResult is not None
    assert response.actionResult["status"] == "ambiguous"


def test_employee_cannot_execute_manager_approval() -> None:
    agent = ManagerAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve le conge 42", context("EMPLOYEE")))

    assert response.type == "error"
    assert response.intent == "manager.forbidden"


def test_manager_cannot_execute_rh_final_validation() -> None:
    agent = RHAgent(FakeExecutor([{"id": 8, "employee": "Amin Dupont", "type": "CONGE"}]), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve le conge 8", context("MANAGER")))

    assert response.type == "error"
    assert response.intent == "rh.forbidden"


def test_rh_document_rejection_uses_safe_document_tool() -> None:
    executor = FakeExecutor([{"id": 51, "employee": "Amin Dupont", "type": "DOCUMENT", "statut": "EN_ATTENTE_RH"}])
    agent = RHAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Refuse le document 51", context("RH")))

    assert response.type == "confirm_action"
    assert executor.calls[0] == "document.get_status"
    assert response.toolCalls[0].name == "document.rh_reject"


def test_rh_document_approval_without_content_is_unavailable() -> None:
    executor = FakeExecutor([{"id": 51, "employee": "Amin Dupont", "type": "DOCUMENT", "statut": "EN_ATTENTE_RH"}])
    agent = RHAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("Approuve le document 51", context("RH")))

    assert response.type == "error"
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "capability_unavailable"
