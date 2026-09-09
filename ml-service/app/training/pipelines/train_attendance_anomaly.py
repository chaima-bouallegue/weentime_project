"""End-to-end training pipeline: raw rows -> features -> IsolationForest -> joblib."""
from __future__ import annotations

import argparse
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import text

from sklearn.model_selection import train_test_split

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
        is_anomaly_val = row.get("anomaly_injected")
        records.append(
            AttendanceRecord(
                employee_id=int(row["employee_id"]),
                employee_name=str(row["employee_name"]),
                entreprise_id=int(row["entreprise_id"]) if pd.notna(row.get("entreprise_id")) else None,
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
                is_anomaly=bool(is_anomaly_val) if pd.notna(is_anomaly_val) else None,
            )
        )
    return records


def load_real_attendance_data(entreprise_id: int | None = None) -> pd.DataFrame:
    """Read the active attendance store used by presence-service.

    Parameters
    ----------
    entreprise_id : int | None
        When set, only rows for this tenant are loaded.
        When None (legacy), ALL tenants are loaded and a warning is logged.
    """
    settings = get_settings()

    if entreprise_id is None:
        logger.warning(
            "Training on ALL tenants (entreprise_id=None). "
            "This legacy multi-tenant mode biases anomaly detection "
            "for small tenants. Pass entreprise_id for tenant-specific training."
        )

    query = text(
        """
        SELECT
            utilisateur_id AS employee_id,
            'Employee #' || utilisateur_id AS employee_name,
            entreprise_id,
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
          AND (:entreprise_id IS NULL OR entreprise_id = :entreprise_id)
        ORDER BY utilisateur_id, attendance_date, check_in_time
        """
    )
    with get_session_for_url(settings.presence_database_url) as session:
        rows = session.execute(query, {"entreprise_id": entreprise_id}).mappings().all()
    frame = pd.DataFrame(rows)
    logger.info(
        "loaded %d real attendance rows from presence PostgreSQL",
        len(frame),
    )
    return frame


def _model_kwargs(settings, entreprise_id: int | None = None) -> dict[str, Any]:
    return {
        "contamination": settings.contamination,
        "n_estimators": settings.isolation_forest_n_estimators,
        "random_state": settings.random_state,
        "critical_threshold": settings.critical_threshold,
        "high_threshold": settings.high_threshold,
        "medium_threshold": settings.medium_threshold,
        "auto_calibrate_thresholds": settings.auto_calibrate_thresholds,
        "entreprise_id": entreprise_id,
    }


def _attach_metrics(
    result: TrainResult,
    eval_result: TrainResult,
) -> None:
    result.precision = eval_result.precision
    result.recall = eval_result.recall
    result.f1 = eval_result.f1
    result.confusion_matrix = eval_result.confusion_matrix


def train_pipeline(force_synthetic: bool = False, entreprise_id: int | None = None) -> TrainResult:
    settings = get_settings()
    seed = settings.random_state

    if force_synthetic:
        gen_kwargs: dict[str, Any] = {}
        if entreprise_id is not None:
            gen_kwargs["entreprises"] = [entreprise_id]
        df = generate(n_rows=10_000, **gen_kwargs)
        save_dataframe(df, settings.training_data_dir_path)
        data_source = "synthetic_explicit"
        minimum = settings.min_training_records
    else:
        df = load_real_attendance_data(entreprise_id=entreprise_id)
        data_source = "postgresql:attendance_sessions"
        minimum = settings.min_real_training_records

    if len(df) < minimum:
        raise ValueError(
            f"not enough real attendance records: {len(df)} < {minimum}"
        )

    records = dataframe_to_records(df)
    has_ground_truth = any(r.is_anomaly is not None for r in records)
    engineer = FeatureEngineer()

    if has_ground_truth:
        gt_labels = [r.is_anomaly for r in records]
        unique_labels = list(set(gt_labels))
        stratify = gt_labels if len(unique_labels) > 1 and all(gt_labels.count(lb) > 1 for lb in unique_labels) else None
        train_records, test_records = train_test_split(
            records,
            test_size=0.2,
            random_state=seed,
            stratify=stratify,
        )
        train_features_df = engineer.compute_batch_features(train_records)
        test_features_df = engineer.compute_batch_features(test_records)
        y_test = [r.is_anomaly for r in test_records]

        eval_model = AttendanceAnomalyModel(**_model_kwargs(settings, entreprise_id))
        eval_result = eval_model.train(train_features_df, test_features_df, y_test)

        final_model = AttendanceAnomalyModel(**_model_kwargs(settings, entreprise_id))
        final_model._precision = eval_result.precision
        final_model._recall = eval_result.recall
        final_model._f1 = eval_result.f1
        final_model._confusion_matrix = eval_result.confusion_matrix

        all_features_df = engineer.compute_batch_features(records)
        final_result = final_model.train(all_features_df)
        bundle_path = final_model.save(settings.model_dir_path)
        final_result.bundle_path = bundle_path
        final_result.data_source = data_source
        _attach_metrics(final_result, eval_result)

        logger.info(
            "evaluation: precision=%.4f recall=%.4f f1=%.4f cm=%s",
            eval_result.precision or 0.0,
            eval_result.recall or 0.0,
            eval_result.f1 or 0.0,
            eval_result.confusion_matrix,
        )
        return final_result

    logger.warning(
        "No ground truth labels available (data_source=%s). "
        "Skipping supervised evaluation. Use --force-synthetic for labeled data.",
        data_source,
    )
    features_df = engineer.compute_batch_features(records)
    model = AttendanceAnomalyModel(**_model_kwargs(settings, entreprise_id))
    result = model.train(features_df)
    bundle_path = model.save(settings.model_dir_path)
    result.bundle_path = bundle_path
    result.data_source = data_source
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-synthetic", action="store_true")
    parser.add_argument(
        "--entreprise-id",
        type=int,
        default=None,
        help="Entraîner pour un tenant spécifique. Sans ce flag, toutes les données sont utilisées (legacy).",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = train_pipeline(force_synthetic=args.force_synthetic, entreprise_id=args.entreprise_id)
    print(f"trained {result.model_version} on {result.records_used} rows in {result.duration_seconds:.2f}s")
    print(f"observed contamination: {result.contamination_observed:.3f}")
    print(f"bundle: {result.bundle_path}")
    if result.precision is not None:
        print(f"evaluation: precision={result.precision:.4f} recall={result.recall:.4f} f1={result.f1:.4f}")
        print(f"confusion matrix: {result.confusion_matrix}")


if __name__ == "__main__":
    main()
