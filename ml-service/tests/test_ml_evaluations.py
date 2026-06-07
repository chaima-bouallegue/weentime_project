"""Offline ML evaluation coverage for local fallback datasets and metrics."""
from __future__ import annotations

import numpy as np

from evals.absence_leave_forecast_eval import (
    compute_regression_metrics,
    run as run_forecast_eval,
)
from evals.attendance_anomaly_eval import (
    compute_classification_metrics,
    run as run_anomaly_eval,
)


def test_attendance_metrics_include_required_rates():
    metrics = compute_classification_metrics(
        [False, False, True, True],
        [False, True, True, False],
    )

    assert metrics == {
        "accuracy": 0.5,
        "precision": 0.5,
        "recall": 0.5,
        "f1": 0.5,
        "false_positive_rate": 0.5,
        "false_negative_rate": 0.5,
    }


def test_forecast_metrics_include_required_regression_scores():
    expected = np.asarray([[1.0, 2.0, 90.0], [2.0, 1.0, 80.0]])

    metrics = compute_regression_metrics(expected, expected.copy())

    assert metrics["mae"] == 0.0
    assert metrics["rmse"] == 0.0
    assert metrics["mape"] == 0.0
    assert metrics["r2"] == 1.0


def test_attendance_eval_runs_from_local_fixture_without_publishing():
    result = run_anomaly_eval(force_local=True, publish=False)

    assert result["rows"] >= 10
    assert result["dataset_source"].startswith("csv:")
    assert set(result["metrics"]) == {
        "accuracy",
        "precision",
        "recall",
        "f1",
        "false_positive_rate",
        "false_negative_rate",
    }


def test_forecast_eval_runs_from_local_fixture_without_publishing():
    result = run_forecast_eval(force_local=True, publish=False)

    assert result["rows"] >= 10
    assert result["dataset_source"].startswith("csv:")
    assert set(result["metrics"]) == {"mae", "rmse", "mape", "r2"}
