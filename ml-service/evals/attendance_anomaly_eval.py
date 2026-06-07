"""Evaluate attendance anomaly classification locally and in Braintrust."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import get_settings
from app.features.attendance_features import FEATURE_NAMES
from app.models.isolation_forest_model import AttendanceAnomalyModel
from evals.common import load_evaluation_dataset, publish_evaluation

DATASET_NAME = "attendance_anomaly_eval"
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "attendance_anomaly_eval.csv"


def _number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _boolean(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "anomaly", "-1"}


def _feature_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {name: _number(row.get(name)) for name in FEATURE_NAMES}
            for row in rows
        ],
        columns=list(FEATURE_NAMES),
    )


def _rule_fallback(frame: pd.DataFrame) -> list[bool]:
    predictions: list[bool] = []
    for _, row in frame.iterrows():
        predictions.append(
            bool(
                row["missing_checkout"] >= 1
                or row["rapid_session"] >= 1
                or row["night_activity"] >= 1
                or row["overtime_excess"] >= 1
                or row["late_minutes"] >= 60
                or row["worked_hours"] > 12
                or (row["is_weekend"] >= 1 and row["worked_hours"] > 0)
            )
        )
    return predictions


def compute_classification_metrics(
    expected: list[bool],
    predicted: list[bool],
) -> dict[str, float]:
    tn, fp, fn, tp = confusion_matrix(
        expected,
        predicted,
        labels=[False, True],
    ).ravel()
    false_positive_rate = fp / (fp + tn) if fp + tn else 0.0
    false_negative_rate = fn / (fn + tp) if fn + tp else 0.0
    return {
        "accuracy": float(accuracy_score(expected, predicted)),
        "precision": float(precision_score(expected, predicted, zero_division=0)),
        "recall": float(recall_score(expected, predicted, zero_division=0)),
        "f1": float(f1_score(expected, predicted, zero_division=0)),
        "false_positive_rate": float(false_positive_rate),
        "false_negative_rate": float(false_negative_rate),
    }


def run(*, force_local: bool = False, publish: bool = True) -> dict[str, Any]:
    dataset = load_evaluation_dataset(
        DATASET_NAME,
        FIXTURE_PATH,
        force_local=force_local,
    )
    frame = _feature_frame(dataset.rows)
    expected = [
        _boolean(row.get("expected_anomaly", row.get("expected", False)))
        for row in dataset.rows
    ]

    settings = get_settings()
    model = AttendanceAnomalyModel.load_latest(settings.model_dir_path)
    rule_predictions = _rule_fallback(frame)
    if model is not None:
        results = model.predict_batch(frame)
        predicted = [
            bool(item["is_anomaly"]) or rule_predictions[index]
            for index, item in enumerate(results)
        ]
        scores = [float(item["score"]) for item in results]
        model_source = f"hybrid:isolation_forest:{model.model_version}+business_rules"
    else:
        predicted = rule_predictions
        scores = [1.0 if item else 0.0 for item in predicted]
        model_source = "attendance_rule_fallback"

    metrics = compute_classification_metrics(expected, predicted)
    cases = []
    for index, row in enumerate(dataset.rows):
        cases.append(
            {
                "input": {name: _number(row.get(name)) for name in FEATURE_NAMES},
                "output": {
                    "is_anomaly": predicted[index],
                    "anomaly_score": scores[index],
                },
                "expected": {"is_anomaly": expected[index]},
                "scores": {"correct": 1.0 if predicted[index] == expected[index] else 0.0},
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
                "accuracy": metrics["accuracy"],
                "precision": metrics["precision"],
                "recall": metrics["recall"],
                "f1": metrics["f1"],
                "false_positive_rate_quality": 1.0 - metrics["false_positive_rate"],
                "false_negative_rate_quality": 1.0 - metrics["false_negative_rate"],
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
