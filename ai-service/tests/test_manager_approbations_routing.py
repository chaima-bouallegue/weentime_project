"""Verify the keyword 'approbations' (and siblings) routes to the manager
pending-approvals tool instead of producing fallback.unsafe_response.

Before this slice, ManagerAgent.detect_intent only recognised the verb forms
("approuve", "approve", "valide"). Noun forms ("approbations", "approvals")
fell through to fallback.unsafe_response. The fix adds those noun forms and
routes them to the list-pending flow rather than per-request decision.
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.agents.manager_agent import ManagerAgent
from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.tools.result import ToolResult, build_read_result


class _FakeExecutor:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def execute(self, tool_name: str, payload: dict[str, Any], context: CurrentUserContext, **kwargs: Any) -> ToolResult:
        self.calls.append(tool_name)
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary="aucune demande en attente",
                    items=[],
                    count=0,
                )
            },
            status_code=200,
        )


def _ctx() -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role="MANAGER", entreprise_id=2, token="token")


@pytest.mark.parametrize(
    "phrase",
    [
        "approbations",
        "approvals",
        "pending approvals",
        "mes approbations",
        "voir les approbations",
        "approbation en attente",
    ],
)
def test_phrase_detects_as_pending_approvals(phrase: str) -> None:
    agent = ManagerAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    intent, confidence = agent.detect_intent(phrase, _ctx())

    assert intent == "manager.pending_approvals"
    assert confidence >= 0.5


@pytest.mark.parametrize(
    "phrase",
    [
        "approbations",
        "approvals",
        "pending approvals",
    ],
)
def test_phrase_routes_to_pending_summary_not_fallback(phrase: str) -> None:
    executor = _FakeExecutor()
    agent = ManagerAgent(executor, ConfirmationStore())  # type: ignore[arg-type]

    response = asyncio.run(agent.handle(phrase, _ctx()))

    assert response.intent == "manager.pending_approvals"
    assert response.type == "answer"
    assert response.actionResult is not None
    assert response.actionResult.get("kind") == "manager_pending_summary"
    # The 3 list_manager_requests tools were invoked.
    assert executor.calls == [
        "leave.list_manager_requests",
        "telework.list_manager_requests",
        "authorization.list_manager_requests",
    ]


def test_verb_form_still_routes_to_approve_branch() -> None:
    """Regression guard: 'approuve la demande 42' must still be a per-request
    decision, not a list. The noun-form rule must not steal the verb form."""
    agent = ManagerAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    intent, _ = agent.detect_intent("approuve la demande 42", _ctx())

    assert intent == "manager.approve"


def test_unknown_phrase_does_not_match() -> None:
    """Regression guard: a phrase with no approval verbs/nouns must still
    return None so other agents can pick it up."""
    agent = ManagerAgent(_FakeExecutor(), ConfirmationStore())  # type: ignore[arg-type]

    intent, _ = agent.detect_intent("aandi reunion", _ctx())

    assert intent is None
