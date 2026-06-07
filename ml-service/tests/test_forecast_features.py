"""Forecast feature engineering tests."""
from __future__ import annotations

from datetime import date

from app.features.forecast_features import FEATURE_NAMES, ForecastFeatureRow


def test_temporal_forecast_features_are_stable():
    row = ForecastFeatureRow(
        target_date=date(2026, 6, 30),
        employee_count=12,
        department_id=3,
        team_id=7,
        holidays=frozenset({date(2026, 6, 30), date(2026, 7, 1)}),
    )

    data = row.to_dict()

    assert data["day_of_week"] == 1
    assert data["month"] == 6
    assert data["week_of_year"] == 27
    assert data["is_weekend"] == 0
    assert data["is_holiday"] == 1
    assert data["is_before_holiday"] == 1
    assert data["is_summer_period"] == 1
    assert data["is_end_of_month"] == 1
    assert data["employee_count"] == 12
    assert data["department_id"] == 3
    assert data["team_id"] == 7


def test_forecast_feature_vector_matches_feature_names():
    row = ForecastFeatureRow(target_date=date(2026, 6, 15), employee_count=2)
    vector = row.to_vector()

    assert len(vector) == len(FEATURE_NAMES)
    assert vector.shape == (len(FEATURE_NAMES),)
