from __future__ import annotations

from typing import Any

import pytest

from app.context.current_user import CurrentUserContext
from app.intelligence.employee_digest_builder import EmployeeDigestBuilder
from app.tools.result import ToolResult, build_read_result

pytestmark = pytest.mark.asyncio


class FakeExecutor:
    def __init__(self, results: dict[str, ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any], CurrentUserContext]] = []

    async def execute(self, tool_name, payload, context, **kwargs):
        self.calls.append((tool_name, payload or {}, context))
        return self.results.get(tool_name) or read(tool_name, f"ok:{tool_name}")


def context(role: str = "EMPLOYEE", *, tenant_id: int | None = 42, verified: bool = True) -> CurrentUserContext:
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


async def test_employee_digest_uses_modern_personal_read_tools() -> None:
    executor = FakeExecutor()
    digest = await EmployeeDigestBuilder(executor).build_digest(context())

    calls = {call[0] for call in executor.calls}
    assert digest.role == "EMPLOYEE"
    assert {
        "get_pointage_status",
        "get_week_hours",
        "leave.get_balance",
        "leave.list_my_requests",
        "telework.list_my_requests",
        "authorization.list_my_requests",
        "document.list_my_requests",
        "communication.list_channels",
    }.issubset(calls)
    assert not any(name.startswith("legacy.") for name in calls)
    assert all(call[2].tenant_id == 42 for call in executor.calls)


async def test_employee_digest_generates_missing_checkout_reminder() -> None:
    executor = FakeExecutor(
        {
            "get_pointage_status": read(
                "get_pointage_status",
                "Pointage en cours",
                data={"checkIn": "08:30", "checkOut": None, "status": "CHECKED_IN"},
            )
        }
    )

    digest = await EmployeeDigestBuilder(executor).build_digest(context())

    assert any(item["type"] == "missing_checkout" for item in digest.reminders)
    assert any(priority.type == "missing_checkout" for priority in digest.priorities)


async def test_employee_digest_generates_low_leave_balance_warning() -> None:
    executor = FakeExecutor(
        {
            "leave.get_balance": read(
                "leave.get_balance",
                "Solde conge maladie bas",
                data={"balances": [{"typeConge": "Maladie", "joursRestants": 1}]},
            )
        }
    )

    digest = await EmployeeDigestBuilder(executor).build_digest(context())

    assert any(item["type"] == "low_leave_balance" for item in digest.reminders)
    assert any(priority.type == "low_leave_balance" for priority in digest.priorities)


async def test_employee_digest_policy_guidance_preserves_citations() -> None:
    citation = {"sourceId": "policy-1", "title": "Telework policy", "chunkId": "policy-1:0", "excerpt": "Telework needs approval."}
    executor = FakeExecutor(
        {
            "policy.search": read(
                "policy.search",
                "Selon la source RH approuvee",
                [citation],
                {"citations": [citation], "policyAvailable": True},
            )
        }
    )

    digest = await EmployeeDigestBuilder(executor).build_digest(context(), policy_query="politique teletravail")

    assert executor.calls[-1][0] == "policy.search"
    assert digest.citations == [citation]
    assert digest.to_dict()["citations"] == [citation]


async def test_employee_digest_fallback_keeps_unavailable_section_clean() -> None:
    failure = ToolResult.fail(
        "backend_unavailable",
        "Service presence indisponible.",
        status_code=503,
        data={
            "read_result": build_read_result(
                tool_name="get_week_hours",
                summary="Service presence indisponible.",
                items=[],
                count=0,
                data={},
                empty=True,
                backend_status=503,
            )
        },
    )
    executor = FakeExecutor({"get_week_hours": failure})

    digest = await EmployeeDigestBuilder(executor).build_digest(context())

    assert any(section.tool_name == "get_week_hours" and section.status == "unavailable" for section in digest.sections)
    assert digest.warnings


async def test_employee_digest_never_creates_write_confirmation() -> None:
    digest = await EmployeeDigestBuilder(FakeExecutor()).build_digest(context())

    write_tools = {"leave.create_request", "telework.create_request", "authorization.create_request", "communication.send_message"}
    assert write_tools.isdisjoint({call.name for call in digest.tool_calls})
    assert digest.to_dict()["requiresConfirmation"] is False
    assert all(not item["requiresConfirmation"] for item in digest.to_dict()["reminders"])
