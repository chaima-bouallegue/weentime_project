"""End-to-end training pipeline: raw rows -> features -> IsolationForest -> joblib."""
from __future__ import annotations

import argparse
import logging
from datetime import date, datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import get_session_for_url
from app.features.attendance_features import AttendanceRecord, FEATURE_NAMES, FeatureEngineer
from app.models.isolation_forest_model import AttendanceAnomalyModel, TrainResult
from app.training.generate_synthetic_attendance import generate, save_dataframe

logger = logging.getLogger(__name__)


def _parse_dt(value) -> datetime | None:
    if value is None or pd.isna(value) or value == "":
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
                expected_minutes=(
                    int(row["expected_minutes"]) if not pd.isna(row.get("expected_minutes")) else None
                ),
                worked_minutes=(
                    int(row["worked_minutes"]) if not pd.isna(row.get("worked_minutes")) else None
                ),
                overtime_minutes=(
                    int(row["overtime_minutes"]) if not pd.isna(row.get("overtime_minutes")) else None
                ),
                daily_status=str(row.get("daily_status") or "") or None,
                late_arrival=bool(row.get("late_arrival")) if not pd.isna(row.get("late_arrival")) else None,
                source=str(row.get("source") or "") or None,
                localisation=str(row.get("localisation") or "") or None,
            )
        )
    return records


def load_real_attendance_data() -> pd.DataFrame:
    """Read the active attendance store used by presence-service."""
    settings = get_settings()
    query = text(
        """
        SELECT
            utilisateur_id AS employee_id,
            'Employee #' || utilisateur_id AS employee_name,
            attendance_date AS date,
            check_in_time AS check_in,
            CASE
                WHEN daily_status::text = 'MISSING_CHECKOUT'
                  OR auto_closed = TRUE
                THEN NULL
                ELSE check_out_time
            END AS check_out,
            duration_seconds,
            expected_minutes,
            worked_minutes,
            overtime_minutes,
            daily_status,
            late_arrival,
            source,
            COALESCE(check_in_address, check_out_address, localisation) AS localisation
        FROM attendance_sessions
        WHERE attendance_date IS NOT NULL
          AND check_in_time IS NOT NULL
        ORDER BY utilisateur_id, attendance_date, check_in_time
        """
    )
    with get_session_for_url(settings.presence_database_url) as session:
        rows = session.execute(query).mappings().all()
    frame = pd.DataFrame(rows)
    logger.info(
        "loaded %d real attendance rows from presence PostgreSQL",
        len(frame),
    )
    return frame


def train_pipeline(force_synthetic: bool = False) -> TrainResult:
    settings = get_settings()
    if force_synthetic:
        df = generate(n_rows=10_000)
        save_dataframe(df, settings.training_data_dir_path)
        data_source = "synthetic_explicit"
        minimum = settings.min_training_records
    else:
        df = load_real_attendance_data()
        data_source = "postgresql:attendance_sessions"
        minimum = settings.min_real_training_records

    if len(df) < minimum:
        raise ValueError(
            f"not enough real attendance records: {len(df)} < {minimum}"
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
        auto_calibrate_thresholds=settings.auto_calibrate_thresholds,
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
        data_source=data_source,
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
