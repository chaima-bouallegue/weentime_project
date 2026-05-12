from __future__ import annotations

import pytest

from app.agents.leave_planner import LeaveRiskAnalyzer
from app.context.current_user import CurrentUserContext
from app.tools.result import ToolResult, build_read_result


def context() -> CurrentUserContext:
    return CurrentUserContext(user_id=12, role="EMPLOYEE", entreprise_id=9, token="token")


class FakeExecutor:
    def __init__(self, results: dict[str, ToolResult]) -> None:
        self.results = results
        self.calls: list[str] = []

    async def execute(self, tool_name, payload, ctx, **kwargs):
        self.calls.append(tool_name)
        return self.results.get(tool_name, ToolResult.fail("not_found", "missing", status_code=404))


@pytest.mark.asyncio
async def test_leave_overlap_risk_uses_backend_request_data() -> None:
    executor = FakeExecutor(
        {
            "leave.get_balance": ToolResult.ok(
                {
                    "read_result": build_read_result(
                        tool_name="leave.get_balance",
                        summary="Il vous reste 12 jours.",
                        items=[{"libelle": "Conge maladie", "joursRestants": 12}],
                        data={"total": 12, "balances": [{"libelle": "Conge maladie", "joursRestants": 12}]},
                    )
                }
            ),
            "leave.list_my_requests": ToolResult.ok(
                {
                    "read_result": build_read_result(
                        tool_name="leave.list_my_requests",
                        summary="1 demande.",
                        items=[{"dateDebut": "2026-05-08", "dateFin": "2026-05-08", "statut": "EN_ATTENTE"}],
                    )
                }
            ),
        }
    )

    result = await LeaveRiskAnalyzer(executor).analyze(
        {"start_date": "2026-05-08", "end_date": "2026-05-08", "leave_type_label": "Conge maladie"},
        context(),
    )

    assert any(risk["type"] == "leave_overlap" for risk in result["risks"])
    assert executor.calls == ["leave.get_balance", "leave.list_my_requests"]


@pytest.mark.asyncio
async def test_leave_risk_does_not_invent_when_data_unavailable() -> None:
    executor = FakeExecutor(
        {
            "leave.get_balance": ToolResult.fail("backend_unreachable", "connect ECONNREFUSED", status_code=503),
            "leave.list_my_requests": ToolResult.fail("backend_unreachable", "connect ECONNREFUSED", status_code=503),
        }
    )

    result = await LeaveRiskAnalyzer(executor).analyze(
        {"start_date": "2026-05-08", "end_date": "2026-05-08", "leave_type_label": "Conge maladie"},
        context(),
    )

    assert result["risks"] == []
    assert result["warnings"]
    assert result["canAssess"] is False
