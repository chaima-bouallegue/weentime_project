"""Synthetic data generator tests."""
from __future__ import annotations

import pandas as pd
import pytest

from app.training.generate_synthetic_attendance import generate


def test_generator_produces_correct_row_count():
    df = generate(n_rows=500, n_employees=10, seed=1)
    assert len(df) == 500


def test_anomaly_injection_rate_near_5_percent():
    df = generate(n_rows=2000, seed=1)
    rate = df["anomaly_injected"].mean()
    assert 0.03 <= rate <= 0.08


def test_no_null_employee_ids():
    df = generate(n_rows=500, seed=1)
    assert df["employee_id"].notna().all()
    assert (df["employee_id"] > 0).all()


def test_required_columns_present():
    df = generate(n_rows=200, seed=1)
    required = {
        "employee_id", "employee_name", "date",
        "check_in", "check_out", "duration_seconds",
        "daily_status", "anomaly_injected",
    }
    assert required.issubset(df.columns)


def test_anomaly_rows_have_distinguishing_signals():
    df = generate(n_rows=3000, seed=2)
    anomalies = df[df["anomaly_injected"]]
    assert not anomalies.empty
    # At least one anomaly type should have a missing checkout.
    has_missing = anomalies["check_out"].isna().any()
    # Or extreme hours: parse check_in/check_out for duration.
    durations = pd.to_numeric(anomalies["duration_seconds"], errors="coerce")
    has_extreme = (durations > 12 * 3600).any() or (durations < 0.5 * 3600).any()
    assert has_missing or has_extreme
