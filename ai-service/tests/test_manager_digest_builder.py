from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.intelligence.manager_digest_builder import ManagerDigestBuilder
from app.tools.result import ToolResult, build_read_result

pytestmark = pytest.mark.asyncio


class FakeExecutor:
    def __init__(self, results: dict[str, ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any], CurrentUserContext]] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append((tool_name, payload or {}, context))
        return self.results.get(tool_name) or read(tool_name, f"ok:{tool_name}")


def context(role: str = "MANAGER", *, tenant_id: int | None = 42, verified: bool = True) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=7,
        role=role,
        entreprise_id=tenant_id,
        token="verified-token" if verified else None,
        language="fr",
        metadata={"jwt_verified": verified},
    )


def read(
    tool_name: str,
    summary: str,
    items: list[dict[str, Any]] | None = None,
    data: dict[str, Any] | None = None,
    *,
    count: int | None = None,
) -> ToolResult:
    items = items or []
    return ToolResult.ok(
        {
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=summary,
                items=items,
                count=len(items) if count is None else count,
                data=data or {},
                empty=not items and not data,
                backend_status=200,
            )
        },
        status_code=200,
    )


async def test_manager_digest_uses_modern_manager_read_tools() -> None:
    executor = FakeExecutor()
    digest = await ManagerDigestBuilder(executor).build_digest(context())

    calls = {call[0] for call in executor.calls}
    assert digest.role == "MANAGER"
    assert {
        "get_team_presence",
        "leave.list_manager_requests",
        "telework.list_manager_requests",
        "authorization.list_manager_requests",
        "communication.list_channels",
    }.issubset(calls)
    assert not any(name.startswith("legacy.") for name in calls)
    assert all(call[2].tenant_id == 42 for call in executor.calls)


async def test_manager_digest_prioritizes_pending_approvals() -> None:
    executor = FakeExecutor(
        {
            "leave.list_manager_requests": read(
                "leave.list_manager_requests",
                "1 conge en attente",
                [{"id": 5, "statut": "EN_ATTENTE", "ageDays": 4}],
            )
        }
    )

    digest = await ManagerDigestBuilder(executor).build_digest(context())

    assert any(item["type"] == "approval_workload" for item in digest.reminders)
    assert any(priority.type == "approval_workload" for priority in digest.priorities)
    assert any(priority.type == "stale_approval" for priority in digest.priorities)


async def test_manager_digest_detects_attendance_anomalies() -> None:
    executor = FakeExecutor(
        {
            "get_team_presence": read(
                "get_team_presence",
                "Presence equipe",
                [{"employee": "Amin", "checkIn": "08:30", "checkOut": None, "status": "PRESENT"}],
            )
        }
    )

    digest = await ManagerDigestBuilder(executor).build_digest(context())

    assert any(item["type"] == "team_missing_checkout" for item in digest.reminders)
    assert any(priority.type == "team_missing_checkout" for priority in digest.priorities)


async def test_manager_digest_communication_does_not_fake_unread_counts() -> None:
    channels = [{"id": "channel-1", "name": "Equipe"}]
    executor = FakeExecutor({"communication.list_channels": read("communication.list_channels", "1 canal visible", channels)})

    digest = await ManagerDigestBuilder(executor).build_digest(context())

    communication = next(section for section in digest.sections if section.tool_name == "communication.list_channels")
    assert "non lu" not in communication.summary.lower()
    assert all("unreadCount" not in item for item in communication.items if isinstance(item, dict))
    assert not any(item["type"] == "manager_communication_activity" for item in digest.reminders)


async def test_manager_digest_fallback_keeps_unavailable_section_clean() -> None:
    failure = ToolResult.fail(
        "backend_unavailable",
        "Presence equipe indisponible.",
        status_code=503,
        data={
            "read_result": build_read_result(
                tool_name="get_team_presence",
                summary="Presence equipe indisponible.",
                items=[],
                count=0,
                data={},
                empty=True,
                backend_status=503,
            )
        },
    )
    executor = FakeExecutor({"get_team_presence": failure})

    digest = await ManagerDigestBuilder(executor).build_digest(context())

    assert any(section.tool_name == "get_team_presence" and section.status == "unavailable" for section in digest.sections)
    assert digest.warnings


async def test_manager_digest_never_creates_write_confirmation() -> None:
    digest = await ManagerDigestBuilder(FakeExecutor()).build_digest(context())

    write_tools = {"leave.manager_decide", "telework.manager_decide", "authorization.manager_decide", "communication.send_message"}
    assert write_tools.isdisjoint({call.name for call in digest.tool_calls})
    assert digest.to_dict()["requiresConfirmation"] is False
    assert all(not item["requiresConfirmation"] for item in digest.to_dict()["reminders"])
