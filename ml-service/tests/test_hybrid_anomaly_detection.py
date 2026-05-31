"""Hybrid attendance anomaly detection business rules."""
from __future__ import annotations

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

    assert anomaly.category == AnomalyCategory.LATE
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

    assert anomaly.category == AnomalyCategory.LATE
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
