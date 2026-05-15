from __future__ import annotations

from app.intelligence.team_insight_engine import TeamInsightEngine


def section(tool_name: str, *, items=None, data=None, count=None, status: str = "ok"):
    items = items or []
    return {
        "title": tool_name,
        "summary": f"summary:{tool_name}",
        "status": status,
        "toolName": tool_name,
        "count": len(items) if count is None else count,
        "items": items,
        "data": data or {},
    }


def test_approval_prioritization_is_deterministic_from_pending_requests() -> None:
    insights = TeamInsightEngine().build_manager_insights(
        [
            section(
                "leave.list_manager_requests",
                items=[
                    {"id": 10, "statut": "EN_ATTENTE", "ageDays": 3},
                    {"id": 11, "statut": "APPROUVEE", "ageDays": 1},
                ],
            )
        ]
    )

    assert any(item.type == "approval_workload" for item in insights)
    workload = next(item for item in insights if item.type == "approval_workload")
    assert workload.evidence["pendingCount"] == 1
    assert workload.evidence["sampleIds"] == [10]
    assert workload.requires_confirmation is False
    assert any(item.type == "stale_approval" for item in insights)


def test_attendance_anomaly_summary_detects_missing_checkout_absence_and_late() -> None:
    insights = TeamInsightEngine().build_manager_insights(
        [
            section(
                "get_team_presence",
                items=[
                    {"employee": "Amin", "checkIn": "08:30", "checkOut": None, "status": "PRESENT"},
                    {"employee": "Meriem", "status": "ABSENT"},
                    {"employee": "Nadia", "status": "RETARD"},
                ],
            )
        ]
    )

    assert any(item.type == "team_missing_checkout" for item in insights)
    assert any(item.type == "team_absence" for item in insights)
    assert any(item.type == "team_late_arrival" for item in insights)


def test_communication_digest_does_not_fake_unread_counts() -> None:
    insights = TeamInsightEngine().build_manager_insights(
        [section("communication.list_channels", items=[{"id": "c1", "name": "Equipe"}])]
    )

    assert not any(item.type == "manager_communication_activity" for item in insights)


def test_communication_digest_uses_visible_backend_counts_when_present() -> None:
    insights = TeamInsightEngine().build_manager_insights(
        [section("communication.list_channels", items=[{"id": "c1", "name": "Equipe", "unreadCount": 4, "mentionCount": 1}])]
    )

    assert any(item.type == "manager_communication_activity" for item in insights)
    item = next(item for item in insights if item.type == "manager_communication_activity")
    assert item.evidence["unreadCount"] == 4
    assert item.evidence["mentionCount"] == 1
