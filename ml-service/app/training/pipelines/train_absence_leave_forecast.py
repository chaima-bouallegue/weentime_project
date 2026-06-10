"""Train the absence/leave forecast model from real WeenTime databases."""
from __future__ import annotations

import argparse
import logging
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

from app.core.config import get_settings
from app.features.forecast_features import FEATURE_NAMES, risk_from_metrics
from app.inference.forecast_data import ForecastDataFilters, ForecastDataRepository, iter_dates
from app.inference.forecast_service import ForecastService, _GroupMeta
from app.models.forecast_model import AbsenceLeaveForecastModel

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ForecastTrainResult:
    model_version: str
    records_used: int
    training_duration_seconds: float
    bundle_path: str
    metrics: dict[str, Any]


def _target_for_day(
    service: ForecastService,
    dataset,
    target_date: date,
    group: _GroupMeta,
) -> tuple[float, float, float, str]:
    absences = service._event_days(
        dataset.absence_events,
        target_date,
        target_date,
        group.employee_ids,
        approved_only=True,
    ) + service._presence_absence_days(
        dataset.presence_events,
        target_date,
        target_date,
        group.employee_ids,
    )
    leaves = service._event_days(
        dataset.leave_events,
        target_date,
        target_date,
        group.employee_ids,
        approved_only=True,
    )
    presence_rate = service._clamp(
        100.0 - (((absences + leaves) / max(group.employee_count, 1)) * 100.0),
        0.0,
        100.0,
    )
    risk = risk_from_metrics(absences, leaves, presence_rate, group.employee_count)
    return float(absences), float(leaves), float(presence_rate), risk


def _build_training_frame(
    *,
    repository: ForecastDataRepository,
    days: int,
    company_id: int | None,
    department_id: int | None,
    team_id: int | None,
) -> tuple[pd.DataFrame, pd.DataFrame, list[str], list[str]]:
    today = date.today()
    history_start = today - timedelta(days=days)
    target_start = history_start + timedelta(days=60)
    target_end = today - timedelta(days=1)
    filters = ForecastDataFilters(
        company_id=company_id,
        department_id=department_id,
        team_id=team_id,
    )
    dataset = repository.load_dataset(
        history_start=history_start,
        forecast_end=target_end,
        filters=filters,
    )
    service = ForecastService(repository=repository, model=AbsenceLeaveForecastModel())
    groups = [service._overall_group(dataset), *service._team_groups(dataset)]

    feature_rows: list[dict[str, float | int]] = []
    target_rows: list[dict[str, float]] = []
    risk_labels: list[str] = []
    scopes: list[str] = []
    for group in groups:
        if group.employee_count <= 0:
            continue
        for target_date in iter_dates(target_start, target_end):
            row = service._feature_row(dataset, target_date, target_date, group)
            absences, leaves, presence_rate, risk = _target_for_day(service, dataset, target_date, group)
            feature_rows.append(row.to_dict())
            target_rows.append(
                {
                    "predicted_absences": absences,
                    "predicted_leaves": leaves,
                    "predicted_presence_rate": presence_rate,
                }
            )
            risk_labels.append(risk)
            scopes.append(str(group.team_id) if group.team_id is not None else "overall")

    if not any(dataset.source_ok.values()):
        raise RuntimeError("forecast training sources unavailable")
    if dataset.warnings:
        logger.warning("forecast training continued with source warnings: %s", sorted(set(dataset.warnings)))
    return (
        pd.DataFrame(feature_rows, columns=list(FEATURE_NAMES)),
        pd.DataFrame(target_rows),
        risk_labels,
        scopes,
    )


def _evaluate(
    model: AbsenceLeaveForecastModel,
    X_test: pd.DataFrame,
    y_test: pd.DataFrame,
    risk_test: list[str],
) -> dict[str, Any]:
    regression, risks = model.predict(X_test)
    mae = mean_absolute_error(y_test, regression, multioutput="raw_values")
    mse = mean_squared_error(y_test, regression, multioutput="raw_values")
    rmse = np.sqrt(mse)
    labels = sorted(set([*risk_test, *risks]))
    return {
        "regression": {
            "maeAbsences": round(float(mae[0]), 4),
            "maeLeaves": round(float(mae[1]), 4),
            "maePresenceRate": round(float(mae[2]), 4),
            "rmseAbsences": round(float(rmse[0]), 4),
            "rmseLeaves": round(float(rmse[1]), 4),
            "rmsePresenceRate": round(float(rmse[2]), 4),
            "r2": round(float(r2_score(y_test, regression, multioutput="variance_weighted")), 4),
        },
        "classification": {
            "accuracy": round(float(accuracy_score(risk_test, risks)), 4),
            "precisionMacro": round(float(precision_score(risk_test, risks, labels=labels, average="macro", zero_division=0)), 4),
            "recallMacro": round(float(recall_score(risk_test, risks, labels=labels, average="macro", zero_division=0)), 4),
            "f1Macro": round(float(f1_score(risk_test, risks, labels=labels, average="macro", zero_division=0)), 4),
            "labels": labels,
            "confusionMatrix": confusion_matrix(risk_test, risks, labels=labels).tolist(),
        },
    }


def train_pipeline(
    *,
    days: int = 730,
    company_id: int | None = None,
    department_id: int | None = None,
    team_id: int | None = None,
    min_records: int | None = None,
    random_state: int | None = None,
    model_dir: Path | None = None,
) -> ForecastTrainResult:
    started = time.time()
    settings = get_settings()
    required_records = min_records if min_records is not None else settings.min_training_records
    seed = random_state if random_state is not None else settings.random_state
    repository = ForecastDataRepository()
    features, targets, risk_labels, _ = _build_training_frame(
        repository=repository,
        days=days,
        company_id=company_id,
        department_id=department_id,
        team_id=team_id,
    )
    if len(features) < required_records:
        raise ValueError(f"not enough real forecast training records: {len(features)} < {required_records}")

    stratify = risk_labels if len(set(risk_labels)) > 1 and min(risk_labels.count(label) for label in set(risk_labels)) > 1 else None
    X_train, X_test, y_train, y_test, risk_train, risk_test = train_test_split(
        features,
        targets,
        risk_labels,
        test_size=0.2,
        random_state=seed,
        stratify=stratify,
    )
    eval_model = AbsenceLeaveForecastModel()
    eval_model.fit(X_train, y_train, risk_train, random_state=seed)
    metrics = _evaluate(eval_model, X_test, y_test, risk_test)

    final_model = AbsenceLeaveForecastModel(metrics=metrics)
    final_model.fit(features, targets, risk_labels, random_state=seed)
    bundle_path = final_model.save(model_dir or settings.model_dir_path)
    logger.info("forecast model saved at %s", bundle_path)
    return ForecastTrainResult(
        model_version=final_model.model_version,
        records_used=len(features),
        training_duration_seconds=time.time() - started,
        bundle_path=bundle_path,
        metrics=metrics,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=730)
    parser.add_argument("--company-id", type=int, default=None)
    parser.add_argument("--department-id", type=int, default=None)
    parser.add_argument("--team-id", type=int, default=None)
    parser.add_argument("--min-records", type=int, default=None)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = train_pipeline(
        days=args.days,
        company_id=args.company_id,
        department_id=args.department_id,
        team_id=args.team_id,
        min_records=args.min_records,
    )
    print(f"trained {result.model_version} on {result.records_used} real rows")
    print(f"duration: {result.training_duration_seconds:.2f}s")
    print(f"bundle: {result.bundle_path}")


if __name__ == "__main__":
    main()
