"""Isolation Forest wrapper tests."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.features.attendance_features import FEATURE_NAMES
from app.models.isolation_forest_model import AttendanceAnomalyModel
from app.schemas.anomaly_schemas import RiskLevel


def _training_frame(n_rows: int = 300) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    data = {
        "arrival_hour": rng.normal(9.0, 0.3, n_rows),
        "departure_hour": rng.normal(17.5, 0.3, n_rows),
        "worked_hours": rng.normal(8.0, 0.5, n_rows),
        "late_minutes": np.clip(rng.normal(0, 3, n_rows), 0, None),
        "weekday": rng.integers(0, 5, n_rows),
        "is_weekend": np.zeros(n_rows, dtype=int),
        "missing_checkout": np.zeros(n_rows, dtype=int),
        "remote_flag": (rng.random(n_rows) < 0.1).astype(int),
        "weekly_hours": rng.normal(40, 2, n_rows),
        "avg_checkin_hour_30d": rng.normal(9.0, 0.1, n_rows),
        "deviation_from_usual": np.abs(rng.normal(0, 0.4, n_rows)),
        "behavior_delta_weekly": rng.normal(0, 1.0, n_rows),
        "night_activity": np.zeros(n_rows, dtype=int),
        "rapid_session": np.zeros(n_rows, dtype=int),
        "overtime_excess": np.zeros(n_rows, dtype=int),
    }
    return pd.DataFrame(data)


def test_model_trains_and_predicts():
    df = _training_frame()
    model = AttendanceAnomalyModel(contamination=0.05, n_estimators=50)
    result = model.train(df)
    assert result.records_used == len(df)
    assert 0.0 <= result.contamination_observed <= 1.0
    assert model.model is not None
    assert model.scaler is not None


def test_predict_returns_valid_schema():
    df = _training_frame()
    model = AttendanceAnomalyModel(contamination=0.05, n_estimators=50)
    model.train(df)
    sample = df[list(FEATURE_NAMES)].iloc[0].to_numpy()
    prediction = model.predict(sample)
    assert set(prediction.keys()) == {"raw_score", "score", "is_anomaly", "risk"}
    assert 0.0 <= prediction["score"] <= 1.0
    assert prediction["risk"] in {r.value for r in RiskLevel}


def test_risk_thresholds():
    model = AttendanceAnomalyModel(
        critical_threshold=0.85,
        high_threshold=0.70,
        medium_threshold=0.50,
    )
    assert model.score_to_risk(0.95) == RiskLevel.CRITICAL
    assert model.score_to_risk(0.75) == RiskLevel.HIGH
    assert model.score_to_risk(0.60) == RiskLevel.MEDIUM
    assert model.score_to_risk(0.10) == RiskLevel.LOW


def test_reason_generation_picks_up_signals():
    model = AttendanceAnomalyModel()
    reasons = model.generate_reasons(
        {
            "arrival_hour": 3.0,
            "worked_hours": 14.0,
            "late_minutes": 0,
            "missing_checkout": 0,
            "deviation_from_usual": 4.0,
            "weekly_hours": 60.0,
            "is_weekend": 1,
            "night_activity": 1,
            "departure_hour": 17.0,
        },
        score=0.9,
    )
    text = " ".join(reasons)
    assert "nocturne" in text or "Check-in" in text
    assert "longue" in text or "14" in text


def test_anomaly_score_inverts_decision_function():
    model = AttendanceAnomalyModel()
    model._score_min = -0.2
    model._score_max = 0.2
    # decision_function output near min => high anomaly score.
    assert model.get_anomaly_score(-0.2) == pytest.approx(1.0)
    assert model.get_anomaly_score(0.2) == pytest.approx(0.0)
    assert 0.0 < model.get_anomaly_score(0.0) < 1.0


def test_save_and_load_roundtrip(tmp_path):
    df = _training_frame()
    model = AttendanceAnomalyModel(contamination=0.05, n_estimators=50)
    model.train(df)
    bundle_path = model.save(tmp_path)
    assert bundle_path.endswith(".joblib")

    other = AttendanceAnomalyModel()
    from pathlib import Path
    other.load(Path(bundle_path))
    assert other.model_version == model.model_version
    sample = df[list(FEATURE_NAMES)].iloc[0].to_numpy()
    assert other.predict(sample)["risk"] in {r.value for r in RiskLevel}
