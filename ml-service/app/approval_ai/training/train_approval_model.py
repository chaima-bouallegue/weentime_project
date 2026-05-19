"""Train the Smart Approval model from synthetic (or future real) data."""
from __future__ import annotations

import argparse
import logging
import time
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from app.approval_ai.features.approval_features import ApprovalFeatureEngineer
from app.approval_ai.models.approval_model import ApprovalModel
from app.approval_ai.schemas.approval_schemas import ApprovalAnalysisRequest, RequestType
from app.approval_ai.training.generate_synthetic_approvals import generate, save_dataframe
from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _row_to_request(row: pd.Series) -> ApprovalAnalysisRequest:
    return ApprovalAnalysisRequest(
        request_id=int(row.get("request_id", 0) or 0),
        request_type=RequestType(str(row.get("request_type", "CONGE"))),
        employee_id=int(row.get("employee_id", 0) or 0),
        start_date=date.fromisoformat(str(row["start_date"])[:10]),
        end_date=date.fromisoformat(str(row["end_date"])[:10]),
        duration_days=int(row.get("duration_days", 0) or 0),
        employee_seniority_months=int(row.get("employee_seniority_months", 0) or 0),
        employee_department=str(row.get("employee_department", "") or ""),
        team_size=int(row.get("team_size", 1) or 1),
        team_members_absent_same_period=int(row.get("team_members_absent_same_period", 0) or 0),
        team_critical_employees_absent=int(row.get("team_critical_employees_absent", 0) or 0),
        absences_last_6_months=int(row.get("absences_last_6_months", 0) or 0),
        late_arrivals_last_30_days=int(row.get("late_arrivals_last_30_days", 0) or 0),
        approved_requests_last_year=int(row.get("approved_requests_last_year", 0) or 0),
        rejected_requests_last_year=int(row.get("rejected_requests_last_year", 0) or 0),
        is_critical_period=bool(row.get("is_critical_period", False)),
        days_until_period_end=int(row.get("days_until_period_end", 0) or 0),
        anomaly_score_last_30_days=(
            float(row["anomaly_score_last_30_days"])
            if not pd.isna(row.get("anomaly_score_last_30_days"))
            else None
        ),
    )


def prepare_training_data(df: pd.DataFrame, reference: date) -> tuple[np.ndarray, np.ndarray]:
    engineer = ApprovalFeatureEngineer()
    vectors: list[np.ndarray] = []
    labels: list[int] = []
    for _, row in df.iterrows():
        request = _row_to_request(row)
        vectors.append(engineer.compute_features(request, today=reference))
        labels.append(int(row.get("approved", 0)))
    return np.vstack(vectors), np.array(labels, dtype=int)


def load_or_generate(min_records: int) -> tuple[pd.DataFrame, date]:
    settings = get_settings()
    parquet = settings.training_data_dir_path / "synthetic_approvals.parquet"
    csv = settings.training_data_dir_path / "synthetic_approvals.csv"
    if parquet.exists():
        df = pd.read_parquet(parquet)
        if len(df) >= min_records:
            return df, date.today()
    if csv.exists():
        df = pd.read_csv(csv)
        if len(df) >= min_records:
            return df, date.today()
    df = generate(n_rows=max(min_records, 5000))
    save_dataframe(df, settings.training_data_dir_path)
    return df, date.today()


def train(force_synthetic: bool = False) -> dict:
    settings = get_settings()
    started = time.time()
    if force_synthetic:
        df = generate(n_rows=5000)
        save_dataframe(df, settings.training_data_dir_path)
        reference = date.today()
    else:
        df, reference = load_or_generate(min_records=500)

    X, y = prepare_training_data(df, reference)
    model = ApprovalModel()
    metrics = model.train(X, y)
    bundle_path = model.save(settings.model_dir_path)

    duration = time.time() - started
    result = {
        "records_used": int(len(df)),
        "model_version": model.model_version,
        "accuracy": metrics.get("accuracy"),
        "bundle_path": bundle_path,
        "training_duration_seconds": duration,
    }
    logger.info("approval training complete: %s", result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-synthetic", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = train(force_synthetic=args.force_synthetic)
    print(f"trained {result['model_version']} on {result['records_used']} rows")
    print(f"train accuracy: {result['accuracy']:.3f}")
    print(f"bundle: {result['bundle_path']}")


if __name__ == "__main__":
    main()
