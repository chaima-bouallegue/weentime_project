"""Feature engineering tests."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from app.features.attendance_features import (
    AttendanceRecord,
    FEATURE_NAMES,
    FeatureEngineer,
)


def _record(**overrides) -> AttendanceRecord:
    base = dict(
        employee_id=1,
        employee_name="Test Employee",
        date=date(2026, 1, 5),  # Monday
        check_in=datetime(2026, 1, 5, 9, 0),
        check_out=datetime(2026, 1, 5, 17, 0),
        duration_seconds=8 * 3600,
        daily_status="WORKING",
        late_arrival=False,
    )
    base.update(overrides)
    return AttendanceRecord(**base)


def test_known_normal_input_produces_expected_features():
    engineer = FeatureEngineer()
    record = _record()
    features = engineer.compute_features(record)
    assert features.arrival_hour == pytest.approx(9.0)
    assert features.departure_hour == pytest.approx(17.0)
    assert features.worked_hours == pytest.approx(8.0)
    assert features.late_minutes == pytest.approx(0.0)
    assert features.weekday == 0  # Monday
    assert features.is_weekend == 0
    assert features.missing_checkout == 0
    assert features.night_activity == 0
    assert features.rapid_session == 0
    assert features.overtime_excess == 0


def test_missing_checkout_flags():
    engineer = FeatureEngineer()
    record = _record(check_out=None, duration_seconds=None)
    features = engineer.compute_features(record)
    assert features.missing_checkout == 1
    assert features.worked_hours == 0.0
    assert features.departure_hour == 0.0


def test_weekend_detection():
    engineer = FeatureEngineer()
    saturday = _record(date=date(2026, 1, 10), check_in=datetime(2026, 1, 10, 10, 0), check_out=datetime(2026, 1, 10, 14, 0), duration_seconds=4 * 3600)
    features = engineer.compute_features(saturday)
    assert features.weekday == 5
    assert features.is_weekend == 1


def test_late_minutes_after_tolerance():
    engineer = FeatureEngineer()
    # 09:25 -> 15 minutes past 09:10 threshold.
    late = _record(check_in=datetime(2026, 1, 5, 9, 25), check_out=datetime(2026, 1, 5, 17, 25))
    features = engineer.compute_features(late)
    assert features.late_minutes == pytest.approx(15.0)


def test_night_activity_flag():
    engineer = FeatureEngineer()
    record = _record(check_in=datetime(2026, 1, 5, 3, 0), check_out=datetime(2026, 1, 5, 7, 0), duration_seconds=4 * 3600)
    features = engineer.compute_features(record)
    assert features.night_activity == 1


def test_rapid_session_flag():
    engineer = FeatureEngineer()
    record = _record(check_in=datetime(2026, 1, 5, 9, 0), check_out=datetime(2026, 1, 5, 9, 15), duration_seconds=15 * 60)
    features = engineer.compute_features(record)
    assert features.rapid_session == 1


def test_overtime_excess_flag():
    engineer = FeatureEngineer()
    record = _record(check_in=datetime(2026, 1, 5, 7, 0), check_out=datetime(2026, 1, 5, 21, 0), duration_seconds=14 * 3600)
    features = engineer.compute_features(record)
    assert features.overtime_excess == 1


def test_deviation_from_usual_uses_history():
    engineer = FeatureEngineer()
    base_day = date(2026, 1, 5)
    history = [
        _record(date=base_day - timedelta(days=i), check_in=datetime(base_day.year, base_day.month, max(1, base_day.day - i), 9, 0), check_out=datetime(base_day.year, base_day.month, max(1, base_day.day - i), 17, 0))
        for i in range(1, 11)
    ]
    current = _record(check_in=datetime(2026, 1, 5, 13, 0), check_out=datetime(2026, 1, 5, 21, 0))
    features = engineer.compute_features(current, history)
    assert features.avg_checkin_hour_30d == pytest.approx(9.0)
    assert features.deviation_from_usual == pytest.approx(4.0)


def test_feature_vector_order_matches_FEATURE_NAMES():
    engineer = FeatureEngineer()
    features = engineer.compute_features(_record())
    vector = features.to_vector()
    assert len(vector) == len(FEATURE_NAMES)
    assert features.to_dict()[FEATURE_NAMES[0]] == features.arrival_hour
