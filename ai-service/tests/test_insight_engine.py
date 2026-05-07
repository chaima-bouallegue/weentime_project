from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.insights import InsightEngine
from app.tools.result import ToolResult, build_read_result


def context(role: str = "EMPLOYEE") -> CurrentUserContext:
    return CurrentUserContext(user_id=1, role=role, entreprise_id=42, token="token")


def read_result(tool_name: str, summary: str, items=None, data=None, count=None) -> ToolResult:
    return ToolResult.ok(
        {
            "read_result": build_read_result(
                tool_name=tool_name,
                summary=summary,
                items=items or [],
                count=count,
                data=data or {},
                empty=not bool(items),
            )
        }
    )


def test_missing_checkout_insight_generated_from_check_in_without_checkout() -> None:
    engine = InsightEngine()
    report = engine.employee_daily(
        context(),
        {
            "get_pointage_status": ToolResult.ok({"checkedIn": True, "checkedOut": False, "status": "OPEN"}),
            "get_presence_history": ToolResult.ok([]),
            "leave.get_balance": read_result("leave.get_balance", "ok", data={"total": 12}),
        },
    )

    assert any(item.type == "missing_checkout" for item in report.insights)
    insight = next(item for item in report.insights if item.type == "missing_checkout")
    assert insight.evidence["hasCheckIn"] is True
    assert insight.confidence > 0


def test_no_missing_checkout_when_checkout_exists() -> None:
    engine = InsightEngine()
    report = engine.employee_daily(
        context(),
        {
            "get_pointage_status": ToolResult.ok({"checkedIn": True, "checkedOut": True, "status": "CLOSED"}),
            "get_presence_history": ToolResult.ok([]),
            "leave.get_balance": read_result("leave.get_balance", "ok", data={"total": 12}),
        },
    )

    assert all(item.type != "missing_checkout" for item in report.insights)


def test_low_leave_balance_insight_generated_below_threshold() -> None:
    engine = InsightEngine()
    report = engine.employee_daily(
        context(),
        {
            "get_pointage_status": ToolResult.ok({"checkedIn": False}),
            "get_presence_history": ToolResult.ok([]),
            "leave.get_balance": read_result("leave.get_balance", "low", data={"total": 2}),
        },
    )

    assert any(item.type == "low_leave_balance" for item in report.insights)


def test_pending_workload_warning_generated_from_pending_count() -> None:
    engine = InsightEngine()
    report = engine.manager_team(
        context("MANAGER"),
        {
            "legacy.get_pending_validations": read_result("legacy.get_pending_validations", "pending", items=[{"id": i} for i in range(6)]),
            "get_team_presence": ToolResult.ok({"total": 10, "absents": 0}),
        },
    )

    assert any(item.type == "pending_workload" for item in report.insights)


def test_missing_endpoint_returns_warning_not_crash() -> None:
    engine = InsightEngine()
    report = engine.employee_daily(
        context(),
        {
            "get_pointage_status": ToolResult.fail("backend_unavailable", "Presence unavailable", status_code=503),
            "leave.get_balance": ToolResult.fail("backend_unavailable", "RH unavailable", status_code=503),
        },
    )

    assert report.insights == []
    assert "Presence unavailable" in report.warnings
    assert "RH unavailable" in report.warnings


def test_insight_report_includes_evidence_and_confidence() -> None:
    engine = InsightEngine()
    report = engine.manager_team(
        context("MANAGER"),
        {
            "legacy.get_pending_validations": read_result("legacy.get_pending_validations", "pending", items=[{"id": i} for i in range(9)]),
            "get_team_presence": ToolResult.ok({"total": 10, "absents": 3}),
        },
    )

    payload = report.to_dict()
    assert payload["kind"] == "insight_report"
    assert payload["insights"]
    assert all(item["evidence"] for item in payload["insights"])
    assert all(item["confidence"] > 0 for item in payload["insights"])
