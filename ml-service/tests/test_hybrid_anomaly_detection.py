"""Hybrid attendance anomaly detection business rules."""
from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta

from app.features.attendance_features import AttendanceRecord
from app.inference.anomaly_detector import AnomalyDetector
from app.schemas.anomaly_schemas import AnomalyCategory, RiskLevel


def _record(**overrides) -> AttendanceRecord:
    base = dict(
        employee_id=24,
        employee_name="Jean Dupont",
        date=date(2026, 5, 29),
        check_in=datetime(2026, 5, 29, 8, 0),
        check_out=datetime(2026, 5, 29, 17, 0),
        duration_seconds=9 * 3600,
        expected_minutes=9 * 60,
        worked_minutes=9 * 60,
        scheduled_start=time(8, 0),
        scheduled_end=time(17, 0),
        scheduled_workday=True,
        daily_status="PRESENT",
        late_arrival=False,
    )
    base.update(overrides)
    return AttendanceRecord(**base)


def _detector() -> AnomalyDetector:
    return AnomalyDetector(model=None)


def test_absence_detected_on_scheduled_day_with_no_checkin():
    record = _record(check_in=None, check_out=None, duration_seconds=None, worked_minutes=0, daily_status="ABSENT")

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.ABSENCE
    assert anomaly.risk == RiskLevel.CRITICAL
    assert anomaly.score >= 0.90
    assert anomaly.features == {}
    assert anomaly.attendance_snapshot is not None
    assert anomaly.attendance_snapshot.is_absent is True


def test_absence_detected_from_absent_status_when_schedule_missing():
    record = _record(
        check_in=None,
        check_out=None,
        duration_seconds=None,
        worked_minutes=0,
        scheduled_start=None,
        scheduled_end=None,
        expected_minutes=None,
        scheduled_workday=None,
        daily_status="ABSENT",
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.ABSENCE
    assert anomaly.score >= 0.90
    assert "Employee schedule unavailable" in anomaly.missing_data_warnings


def test_checkout_or_worked_time_prevents_false_absence():
    record = _record(
        check_in=None,
        check_out=datetime(2026, 5, 31, 18, 0),
        duration_seconds=8 * 3600,
        worked_minutes=480,
        daily_status="ABSENT",
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category != AnomalyCategory.ABSENCE


def test_absence_not_detected_on_approved_leave():
    record = _record(
        check_in=None,
        check_out=None,
        duration_seconds=None,
        worked_minutes=0,
        approved_leave=True,
        daily_status="ON_LEAVE",
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.NONE
    assert anomaly.score == 0.0


def test_absence_not_detected_on_holiday():
    record = _record(
        check_in=None,
        check_out=None,
        duration_seconds=None,
        worked_minutes=0,
        holiday=True,
        daily_status="HOLIDAY",
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.NONE
    assert anomaly.score == 0.0


def test_late_detected_with_grace_period_and_high_severity():
    record = _record(
        check_in=datetime(2026, 5, 29, 8, 55),
        check_out=datetime(2026, 5, 29, 17, 30),
        duration_seconds=515 * 60,
        worked_minutes=515,
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.LATE_ARRIVAL
    assert anomaly.risk == RiskLevel.HIGH
    assert anomaly.attendance_snapshot is not None
    assert anomaly.attendance_snapshot.late_minutes == 45


def test_small_late_is_low_not_critical():
    record = _record(
        check_in=datetime(2026, 5, 29, 8, 20),
        check_out=datetime(2026, 5, 29, 17, 0),
        duration_seconds=520 * 60,
        worked_minutes=520,
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.LATE_ARRIVAL
    assert anomaly.risk == RiskLevel.LOW
    assert anomaly.score < 0.40


def test_missing_checkout_detected_after_due_time():
    record = _record(
        date=date.today() - timedelta(days=1),
        check_in=datetime.combine(date.today() - timedelta(days=1), time(8, 0)),
        check_out=None,
        duration_seconds=None,
        worked_minutes=0,
        daily_status="PRESENT",
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.MISSING_CHECKOUT
    assert anomaly.risk == RiskLevel.HIGH


def test_open_session_without_scheduled_end_is_not_missing_checkout_yet():
    record = _record(
        date=date.today(),
        check_in=datetime.combine(date.today(), time(9, 0)),
        check_out=None,
        duration_seconds=None,
        worked_minutes=0,
        scheduled_start=None,
        scheduled_end=None,
        daily_status="PRESENT",
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.NONE
    assert anomaly.score == 0.0
    assert "Scheduled end unavailable for missing checkout" in anomaly.missing_data_warnings


def test_repeated_missing_checkout_is_critical():
    base_day = date.today() - timedelta(days=1)
    history = [
        _record(
            date=base_day - timedelta(days=offset),
            check_in=datetime.combine(base_day - timedelta(days=offset), time(8, 0)),
            check_out=None,
            duration_seconds=None,
            worked_minutes=0,
            daily_status="PRESENT",
        )
        for offset in (2, 4)
    ]
    record = _record(
        date=base_day,
        check_in=datetime.combine(base_day, time(8, 0)),
        check_out=None,
        duration_seconds=None,
        worked_minutes=0,
        daily_status="PRESENT",
    )

    anomaly = _detector().analyze_record(record, history)

    assert anomaly.category == AnomalyCategory.REPEATED_MISSING_CHECKOUT
    assert anomaly.risk == RiskLevel.CRITICAL
    assert any(reason.code == "REPEATED_MISSING_CHECKOUT" for reason in anomaly.detected_reasons)


def test_rapid_session_detected_but_not_critical_when_isolated():
    record = _record(
        check_in=datetime(2026, 5, 29, 8, 0),
        check_out=datetime(2026, 5, 29, 8, 2),
        duration_seconds=120,
        worked_minutes=2,
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.RAPID_SESSION
    assert anomaly.risk == RiskLevel.HIGH
    assert anomaly.score < 0.90


def test_night_rapid_session_is_suspicious_critical():
    record = _record(
        check_in=datetime(2026, 5, 29, 23, 2),
        check_out=datetime(2026, 5, 29, 23, 5),
        duration_seconds=180,
        worked_minutes=3,
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.SUSPICIOUS_POINTAGE
    assert anomaly.risk == RiskLevel.CRITICAL


def test_night_activity_detected_as_business_rule():
    record = _record(
        check_in=datetime(2026, 5, 29, 23, 0),
        check_out=datetime(2026, 5, 30, 0, 0),
        duration_seconds=3600,
        worked_minutes=60,
        expected_minutes=None,
        scheduled_start=None,
        scheduled_end=None,
        late_arrival=False,
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.NIGHT_ACTIVITY
    assert anomaly.risk == RiskLevel.HIGH


def test_weekend_activity_not_critical_when_schedule_unknown():
    record = _record(
        date=date(2026, 5, 30),
        check_in=datetime(2026, 5, 30, 10, 0),
        check_out=datetime(2026, 5, 30, 14, 0),
        duration_seconds=4 * 3600,
        worked_minutes=240,
        expected_minutes=None,
        scheduled_start=None,
        scheduled_end=None,
        scheduled_workday=None,
    )

    anomaly = _detector().analyze_record(record)

    assert anomaly.category == AnomalyCategory.WEEKEND_ACTIVITY
    assert anomaly.risk in {RiskLevel.LOW, RiskLevel.MEDIUM}
    assert "Weekend schedule unavailable" in anomaly.missing_data_warnings
    assert anomaly.attendance_snapshot is not None
    assert anomaly.attendance_snapshot.is_weekend is True


def test_snapshot_contains_location_when_available():
    record = _record(localisation="Jaafar, Tunisie")

    anomaly = _detector().analyze_record(record)

    assert anomaly.attendance_snapshot is not None
    assert anomaly.attendance_snapshot.location == "Jaafar, Tunisie"


def test_behavioral_anomaly_returns_business_explanation():
    base_day = date(2026, 5, 29)
    history = [
        _record(
            date=base_day - timedelta(days=i),
            check_in=datetime.combine(base_day - timedelta(days=i), time(8, 0)),
            check_out=datetime.combine(base_day - timedelta(days=i), time(17, 0)),
        )
        for i in range(1, 8)
    ]
    record = _record(
        check_in=datetime(2026, 5, 29, 12, 5),
        check_out=datetime(2026, 5, 29, 20, 0),
        scheduled_start=time(12, 0),
        scheduled_end=time(20, 0),
        duration_seconds=8 * 3600,
        worked_minutes=480,
        expected_minutes=480,
    )

    anomaly = _detector().analyze_record(record, history)

    assert anomaly.category == AnomalyCategory.BEHAVIORAL_ANOMALY
    assert anomaly.title
    assert anomaly.detected_reasons
    assert "feature" not in anomaly.summary.lower()


def test_business_rule_suppresses_generic_behavioral_anomaly():
    base_day = date(2026, 5, 29)
    history = [
        _record(
            date=base_day - timedelta(days=i),
            check_in=datetime.combine(base_day - timedelta(days=i), time(8, 0)),
            check_out=datetime.combine(base_day - timedelta(days=i), time(17, 0)),
        )
        for i in range(1, 8)
    ]
    record = _record(
        check_in=datetime(2026, 5, 29, 12, 5),
        check_out=datetime(2026, 5, 29, 12, 7),
        duration_seconds=120,
        worked_minutes=2,
    )

    anomaly = _detector().analyze_record(record, history)

    assert anomaly.category == AnomalyCategory.RAPID_SESSION
    assert all(reason.code != "BEHAVIORAL_ANOMALY" for reason in anomaly.detected_reasons)


def test_debug_flag_exposes_features_only_when_requested():
    record = _record(
        check_in=datetime(2026, 5, 29, 8, 0),
        check_out=datetime(2026, 5, 29, 8, 2),
        duration_seconds=120,
        worked_minutes=2,
    )

    normal = _detector().analyze_record(record)
    debug = _detector().analyze_record(record, debug=True)

    assert normal.features == {}
    assert "rapid_session" in debug.features


def test_analyze_today_omits_normal_pointed_user():
    record = _record()

    dashboard = asyncio.run(_detector().analyze_today([record]))

    assert dashboard.total_anomalies == 0
    assert dashboard.anomalies == []


def test_duplicate_input_rows_for_same_employee_date_merge_to_one_card():
    record = _record(
        check_in=datetime(2026, 5, 29, 8, 0),
        check_out=datetime(2026, 5, 29, 8, 2),
        duration_seconds=120,
        worked_minutes=2,
    )

    dashboard = asyncio.run(_detector().analyze_today([record, record], debug=True))

    assert dashboard.total_anomalies == 1
    assert dashboard.returned_anomalies_count == 1
    assert dashboard.duplicates_removed == 1
    assert dashboard.anomalies[0].category == AnomalyCategory.RAPID_SESSION


def test_same_name_different_employees_are_not_merged():
    left = _record(
        employee_id=1,
        employee_name="Jean Dupont",
        check_in=datetime(2026, 5, 29, 8, 0),
        check_out=datetime(2026, 5, 29, 8, 2),
        duration_seconds=120,
        worked_minutes=2,
    )
    right = _record(
        employee_id=2,
        employee_name="Jean Dupont",
        check_in=datetime(2026, 5, 29, 8, 0),
        check_out=datetime(2026, 5, 29, 8, 3),
        duration_seconds=180,
        worked_minutes=3,
    )

    dashboard = asyncio.run(_detector().analyze_today([left, right]))

    assert dashboard.total_anomalies == 2
    assert {anomaly.employee_id for anomaly in dashboard.anomalies} == {1, 2}
