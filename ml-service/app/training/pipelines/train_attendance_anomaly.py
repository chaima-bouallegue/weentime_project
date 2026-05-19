"""End-to-end training pipeline: raw rows -> features -> IsolationForest -> joblib."""
from __future__ import annotations

import argparse
import logging
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from app.core.config import get_settings
from app.features.attendance_features import AttendanceRecord, FEATURE_NAMES, FeatureEngineer
from app.models.isolation_forest_model import AttendanceAnomalyModel, TrainResult
from app.training.generate_synthetic_attendance import generate, save_dataframe

logger = logging.getLogger(__name__)


def _parse_dt(value) -> datetime | None:
    if value is None or (isinstance(value, float) and pd.isna(value)) or value == "":
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _parse_date(value) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def dataframe_to_records(df: pd.DataFrame) -> list[AttendanceRecord]:
    records: list[AttendanceRecord] = []
    for _, row in df.iterrows():
        records.append(
            AttendanceRecord(
                employee_id=int(row["employee_id"]),
                employee_name=str(row["employee_name"]),
                date=_parse_date(row["date"]),
                check_in=_parse_dt(row.get("check_in")),
                check_out=_parse_dt(row.get("check_out")),
                duration_seconds=(
                    int(row["duration_seconds"]) if not pd.isna(row.get("duration_seconds")) else None
                ),
                daily_status=str(row.get("daily_status") or "") or None,
                late_arrival=bool(row.get("late_arrival")) if not pd.isna(row.get("late_arrival")) else None,
                source=str(row.get("source") or "") or None,
                localisation=str(row.get("localisation") or "") or None,
            )
        )
    return records


def load_or_generate_data(min_records: int) -> pd.DataFrame:
    settings = get_settings()
    parquet = settings.training_data_dir_path / "synthetic_attendance.parquet"
    csv = settings.training_data_dir_path / "synthetic_attendance.csv"

    if parquet.exists():
        df = pd.read_parquet(parquet)
        if len(df) >= min_records:
            logger.info("loaded %d rows from %s", len(df), parquet)
            return df
    if csv.exists():
        df = pd.read_csv(csv)
        if len(df) >= min_records:
            logger.info("loaded %d rows from %s", len(df), csv)
            return df

    logger.info("no usable training data found -- generating synthetic 10k rows")
    df = generate(n_rows=max(min_records * 5, 10_000))
    save_dataframe(df, settings.training_data_dir_path)
    return df


def train_pipeline(force_synthetic: bool = False) -> TrainResult:
    settings = get_settings()
    if force_synthetic:
        df = generate(n_rows=10_000)
        save_dataframe(df, settings.training_data_dir_path)
    else:
        df = load_or_generate_data(settings.min_training_records)

    if len(df) < settings.min_training_records:
        raise ValueError(
            f"not enough training records: {len(df)} < {settings.min_training_records}"
        )

    records = dataframe_to_records(df)
    engineer = FeatureEngineer()
    features_df = engineer.compute_batch_features(records)

    model = AttendanceAnomalyModel(
        contamination=settings.contamination,
        n_estimators=settings.isolation_forest_n_estimators,
        random_state=settings.random_state,
        critical_threshold=settings.critical_threshold,
        high_threshold=settings.high_threshold,
        medium_threshold=settings.medium_threshold,
    )

    result = model.train(features_df)
    bundle_path = model.save(settings.model_dir_path)
    logger.info("model saved at %s", bundle_path)
    # Re-emit a TrainResult with bundle_path populated.
    return TrainResult(
        model_version=result.model_version,
        records_used=result.records_used,
        contamination_observed=result.contamination_observed,
        duration_seconds=result.duration_seconds,
        bundle_path=bundle_path,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-synthetic", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = train_pipeline(force_synthetic=args.force_synthetic)
    print(f"trained {result.model_version} on {result.records_used} rows in {result.duration_seconds:.2f}s")
    print(f"observed contamination: {result.contamination_observed:.3f}")
    print(f"bundle: {result.bundle_path}")


if __name__ == "__main__":
    main()
