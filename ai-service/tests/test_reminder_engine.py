from __future__ import annotations

from app.intelligence.reminder_engine import ReminderEngine


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


def test_missing_checkout_reminder_is_deterministic_from_pointage_data() -> None:
    reminders = ReminderEngine().build_employee_reminders(
        [
            section(
                "get_pointage_status",
                data={"checkIn": "08:30", "checkOut": None, "status": "CHECKED_IN"},
            )
        ]
    )

    assert any(item.type == "missing_checkout" for item in reminders)
    reminder = next(item for item in reminders if item.type == "missing_checkout")
    assert reminder.requires_confirmation is False
    assert reminder.evidence["checkIn"] == "08:30"


def test_no_missing_checkout_reminder_when_checkout_exists() -> None:
    reminders = ReminderEngine().build_employee_reminders(
        [
            section(
                "get_pointage_status",
                data={"checkIn": "08:30", "checkOut": "17:35", "status": "CLOSED"},
            )
        ]
    )

    assert not any(item.type == "missing_checkout" for item in reminders)


def test_low_leave_balance_reminder_uses_real_balance_value() -> None:
    reminders = ReminderEngine().build_employee_reminders(
        [
            section(
                "leave.get_balance",
                data={"balances": [{"typeConge": "Maladie", "joursRestants": 0}]},
            )
        ]
    )

    assert any(item.type == "low_leave_balance" for item in reminders)
    reminder = next(item for item in reminders if item.type == "low_leave_balance")
    assert reminder.evidence["remainingDays"] == 0.0
    assert "Maladie" in reminder.summary


def test_pending_telework_reminder_uses_backend_status_only() -> None:
    reminders = ReminderEngine().build_employee_reminders(
        [
            section(
                "telework.list_my_requests",
                items=[{"id": 12, "statut": "EN_ATTENTE_MANAGER"}],
            )
        ]
    )

    assert any(item.type == "pending_teletravail_requests" for item in reminders)
    reminder = next(item for item in reminders if item.type == "pending_teletravail_requests")
    assert reminder.evidence["sampleIds"] == [12]


def test_communication_reminder_does_not_invent_unread_counts() -> None:
    reminders = ReminderEngine().build_employee_reminders(
        [section("communication.list_channels", items=[{"id": "c-1", "name": "General"}])]
    )

    assert not any(item.type == "communication_unread" for item in reminders)


def test_communication_reminder_uses_backend_unread_counts_when_present() -> None:
    reminders = ReminderEngine().build_employee_reminders(
        [section("communication.list_channels", items=[{"id": "c-1", "name": "General", "unreadCount": 3}])]
    )

    assert any(item.type == "communication_unread" for item in reminders)
    reminder = next(item for item in reminders if item.type == "communication_unread")
    assert reminder.evidence["unreadCount"] == 3
