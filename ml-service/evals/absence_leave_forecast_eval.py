"""Evaluate absence/leave regression locally and in Braintrust."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import get_settings
from app.features.forecast_features import FEATURE_NAMES
from app.models.forecast_model import AbsenceLeaveForecastModel
from evals.common import load_evaluation_dataset, publish_evaluation

DATASET_NAME = "absence_leave_forecast_eval"
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "absence_leave_forecast_eval.csv"
TARGET_NAMES = (
    "expected_absences",
    "expected_leaves",
    "expected_presence_rate",
)


def _number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _feature_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {name: _number(row.get(name)) for name in FEATURE_NAMES}
            for row in rows
        ],
        columns=list(FEATURE_NAMES),
    )


def _expected_array(rows: list[dict[str, Any]]) -> np.ndarray:
    return np.asarray(
        [
            [_number(row.get(name)) for name in TARGET_NAMES]
            for row in rows
        ],
        dtype=float,
    )


def _statistical_fallback(frame: pd.DataFrame) -> np.ndarray:
    predictions: list[list[float]] = []
    for _, row in frame.iterrows():
        employee_count = max(float(row["employee_count"]), 1.0)
        absences = max(
            0.0,
            float(row["absence_count_last_30_days"]) / 30.0
            + float(row["monthly_absence_trend"]),
        )
        leaves = max(
            0.0,
            float(row["leave_count_last_30_days"]) / 30.0
            + float(row["approved_leave_count"]) / 30.0
            + float(row["weekly_leave_trend"]) / 7.0,
        )
        presence_rate = float(
            np.clip(100.0 - (((absences + leaves) / employee_count) * 100.0), 0.0, 100.0)
        )
        predictions.append([absences, leaves, presence_rate])
    return np.asarray(predictions, dtype=float)


def compute_regression_metrics(
    expected: np.ndarray,
    predicted: np.ndarray,
) -> dict[str, float]:
    mae = float(mean_absolute_error(expected, predicted))
    rmse = float(np.sqrt(mean_squared_error(expected, predicted)))
    non_zero = np.abs(expected) > 1e-9
    mape = float(
        np.mean(np.abs((expected[non_zero] - predicted[non_zero]) / expected[non_zero]))
        * 100.0
    ) if np.any(non_zero) else 0.0
    r2 = float(r2_score(expected, predicted, multioutput="variance_weighted"))
    return {
        "mae": mae,
        "rmse": rmse,
        "mape": mape,
        "r2": r2,
    }


def run(*, force_local: bool = False, publish: bool = True) -> dict[str, Any]:
    dataset = load_evaluation_dataset(
        DATASET_NAME,
        FIXTURE_PATH,
        force_local=force_local,
    )
    frame = _feature_frame(dataset.rows)
    expected = _expected_array(dataset.rows)

    settings = get_settings()
    model = AbsenceLeaveForecastModel.load_latest(settings.model_dir_path)
    if model is not None:
        predicted, _ = model.predict(frame)
        model_source = f"random_forest:{model.model_version}"
    else:
        predicted = _statistical_fallback(frame)
        model_source = "statistical_forecast_fallback"

    metrics = compute_regression_metrics(expected, predicted)
    cases = []
    for index, row in enumerate(dataset.rows):
        absolute_errors = np.abs(expected[index] - predicted[index])
        cases.append(
            {
                "input": {name: _number(row.get(name)) for name in FEATURE_NAMES},
                "output": {
                    "predicted_absences": float(predicted[index][0]),
                    "predicted_leaves": float(predicted[index][1]),
                    "predicted_presence_rate": float(predicted[index][2]),
                },
                "expected": {
                    "predicted_absences": float(expected[index][0]),
                    "predicted_leaves": float(expected[index][1]),
                    "predicted_presence_rate": float(expected[index][2]),
                },
                "scores": {
                    "mae_quality": float(1.0 / (1.0 + np.mean(absolute_errors))),
                },
            }
        )

    braintrust_result = {"status": "skipped", "reason": "publish_disabled"}
    if publish:
        braintrust_result = publish_evaluation(
            dataset=dataset,
            experiment_prefix=DATASET_NAME,
            model_source=model_source,
            cases=cases,
            aggregate_scores={
                "mae_quality": 1.0 / (1.0 + metrics["mae"]),
                "rmse_quality": 1.0 / (1.0 + metrics["rmse"]),
                "mape_quality": 1.0 / (1.0 + metrics["mape"] / 100.0),
                "r2_quality": max(0.0, min(1.0, metrics["r2"])),
            },
            aggregate_metrics=metrics,
        )
    return {
        "evaluation": DATASET_NAME,
        "dataset_source": dataset.source,
        "rows": len(dataset.rows),
        "model_source": model_source,
        "metrics": metrics,
        "braintrust": braintrust_result,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--local-only", action="store_true")
    parser.add_argument("--no-publish", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = run(force_local=args.local_only, publish=not args.no_publish)
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
