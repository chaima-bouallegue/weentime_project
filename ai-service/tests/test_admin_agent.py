from __future__ import annotations

import asyncio
from typing import Any

from app.agents.admin_agent import AdminAgent
from app.agents.legacy_agent import LegacyAgent
from app.agents.router_agent import RouterAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult, build_read_result


class FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any], bool]] = []

    async def execute(self, tool_name, payload, context, *, confirmed=False, **kwargs):
        self.calls.append((tool_name, payload or {}, confirmed))
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=f"ok:{tool_name}",
                    items=[],
                    count=0,
                    data={},
                    empty=True,
                    backend_status=200,
                )
            },
            status_code=200,
        )


class EmptyAttendance:
    name = "attendance"

    def can_handle(self, message, context):
        return 0.0

    async def handle(self, message, context):
        return AgentResponse(type="answer", text="attendance", intent="attendance.status", confidence=1.0)


def context(role: str = "ADMIN") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=1, token="token")


def test_admin_system_summary_routes_to_admin_agent() -> None:
    executor = FakeExecutor()
    router = RouterAgent(EmptyAttendance(), extra_agents=[AdminAgent(executor, ConfirmationStore())], legacy_agent=None)  # type: ignore[arg-type]

    response = asyncio.run(router.handle("resume systeme", context()))

    assert response.type == "answer"
    assert response.intent == "admin.summary"
    assert response.actionResult is not None
    assert response.actionResult["agent"] == "AdminAgent"
    assert executor.calls[0][0] == "admin.system_health"


def test_admin_can_list_users() -> None:
    executor = FakeExecutor()
    agent = AdminAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("montre les utilisateurs", context()))

    assert response.type == "answer"
    assert response.intent == "admin.list_users"
    assert executor.calls[0][0] == "admin.list_users"


def test_admin_can_list_enterprises() -> None:
    executor = FakeExecutor()
    agent = AdminAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("liste les entreprises", context()))

    assert response.type == "answer"
    assert response.intent == "admin.list_enterprises"
    assert executor.calls[0][0] == "admin.list_enterprises"


def test_admin_can_ask_misconfigured_users() -> None:
    executor = FakeExecutor()
    agent = AdminAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("quels utilisateurs sont mal configures", context()))

    assert response.type == "answer"
    assert response.intent == "admin.misconfigured_users"
    assert executor.calls[0][0] == "admin.misconfigured_users"


def test_create_user_requires_confirmation_when_payload_complete() -> None:
    agent = AdminAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("create user Sarah Ben email sarah@ween.tn password Password123 role employee company 1", context()))

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "admin.create_user"


def test_create_user_asks_missing_fields() -> None:
    agent = AdminAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("cree un utilisateur pour Sarah", context()))

    assert response.type == "ask"
    assert response.intent == "admin.create_user"


def test_update_role_requires_confirmation() -> None:
    agent = AdminAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("modifier role utilisateur 7 RH", context()))

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "admin.update_user_role"
    assert response.toolCalls[0].arguments == {"user_id": 7, "role": "RH"}


def test_assign_manager_requires_confirmation() -> None:
    agent = AdminAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("assigne manager 3 utilisateur 9", context()))

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "admin.assign_manager"
    assert response.toolCalls[0].arguments == {"user_id": 9, "manager_id": 3}


def test_assign_rh_owner_requires_confirmation() -> None:
    agent = AdminAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("assigne RH 4 entreprise 2", context()))

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "admin.assign_rh_owner"
    assert response.toolCalls[0].arguments == {"rh_user_id": 4, "entreprise_id": 2}


def test_non_admin_gets_permission_denied_from_admin_agent() -> None:
    agent = AdminAgent(FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle("resume systeme", context("EMPLOYEE")))

    assert response.type == "error"
    assert response.intent == "admin.forbidden"


def test_legacy_fallback_still_works_for_unrelated_prompt() -> None:
    async def legacy_handler(request):
        return AgentResponse(type="answer", text="legacy", intent="legacy.intent", confidence=0.5)

    router = RouterAgent(
        EmptyAttendance(),
        extra_agents=[AdminAgent(FakeExecutor(), ConfirmationStore())],  # type: ignore[arg-type]
        legacy_agent=LegacyAgent(legacy_handler),
    )  # type: ignore[arg-type]

    response = asyncio.run(router.handle("message hors domaine", context()))

    assert response.intent == "legacy.intent"
