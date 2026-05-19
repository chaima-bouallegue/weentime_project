"""Synthetic approval-request generator.

Produces labelled rows (approved=1 / rejected=0) across three behavioural
profiles so the LogisticRegression has signal to learn. Columns mirror the
fields the Java backend will populate on a real ``ApprovalAnalysisRequest``.
"""
from __future__ import annotations

import argparse
import logging
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_REQUEST_TYPES = ("CONGE", "TELETRAVAIL", "AUTORISATION")
_DEPARTMENTS = ("Engineering", "Sales", "Support", "Finance", "Operations")


def _draw_reliable_approved(rng: np.random.Generator, ref: date) -> dict:
    """Reliable employee + good coverage -> approved."""
    team_size = int(rng.integers(5, 12))
    absent = int(rng.integers(0, max(1, team_size // 4)))
    start = ref + timedelta(days=int(rng.integers(3, 45)))
    return {
        "team_size": team_size,
        "team_members_absent_same_period": absent,
        "team_critical_employees_absent": 0,
        "is_critical_period": False,
        "duration_days": int(rng.integers(1, 6)),
        "employee_seniority_months": int(rng.integers(18, 120)),
        "absences_last_6_months": int(rng.integers(0, 4)),
        "late_arrivals_last_30_days": int(rng.integers(0, 3)),
        "approved_requests_last_year": int(rng.integers(3, 10)),
        "rejected_requests_last_year": int(rng.integers(0, 2)),
        "anomaly_score_last_30_days": float(rng.uniform(0.0, 0.4)),
        "days_until_period_end": int(rng.integers(0, 30)),
        "start_date": start,
        "approved": 1,
    }


def _draw_review_borderline(rng: np.random.Generator, ref: date) -> dict:
    """Good coverage but critical period / long duration -> mixed labels."""
    team_size = int(rng.integers(4, 10))
    absent = int(rng.integers(1, max(2, team_size // 3)))
    start = ref + timedelta(days=int(rng.integers(1, 20)))
    approved = int(rng.random() < 0.5)
    return {
        "team_size": team_size,
        "team_members_absent_same_period": absent,
        "team_critical_employees_absent": int(rng.integers(0, 2)),
        "is_critical_period": True,
        "duration_days": int(rng.integers(5, 14)),
        "employee_seniority_months": int(rng.integers(6, 60)),
        "absences_last_6_months": int(rng.integers(2, 7)),
        "late_arrivals_last_30_days": int(rng.integers(0, 5)),
        "approved_requests_last_year": int(rng.integers(2, 7)),
        "rejected_requests_last_year": int(rng.integers(1, 4)),
        "anomaly_score_last_30_days": float(rng.uniform(0.3, 0.7)),
        "days_until_period_end": int(rng.integers(0, 10)),
        "start_date": start,
        "approved": approved,
    }


def _draw_low_coverage_rejected(rng: np.random.Generator, ref: date) -> dict:
    """Low coverage + simultaneous absences -> rejected."""
    team_size = int(rng.integers(3, 9))
    absent = int(rng.integers(max(1, team_size // 2), team_size))
    start = ref + timedelta(days=int(rng.integers(0, 10)))
    return {
        "team_size": team_size,
        "team_members_absent_same_period": absent,
        "team_critical_employees_absent": int(rng.integers(1, 3)),
        "is_critical_period": bool(rng.random() < 0.6),
        "duration_days": int(rng.integers(3, 15)),
        "employee_seniority_months": int(rng.integers(1, 36)),
        "absences_last_6_months": int(rng.integers(4, 12)),
        "late_arrivals_last_30_days": int(rng.integers(2, 10)),
        "approved_requests_last_year": int(rng.integers(0, 4)),
        "rejected_requests_last_year": int(rng.integers(2, 6)),
        "anomaly_score_last_30_days": float(rng.uniform(0.5, 0.95)),
        "days_until_period_end": int(rng.integers(0, 7)),
        "start_date": start,
        "approved": 0,
    }


def generate(n_rows: int = 5000, seed: int = 42, ref_date: date | None = None) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    ref = ref_date or date.today()
    profiles = (
        (_draw_reliable_approved, 0.50),
        (_draw_review_borderline, 0.15),
        (_draw_low_coverage_rejected, 0.35),
    )
    draws = [fn for fn, _ in profiles]
    weights = np.array([w for _, w in profiles], dtype=float)
    weights = weights / weights.sum()

    rows: list[dict] = []
    for i in range(n_rows):
        draw = draws[int(rng.choice(len(draws), p=weights))]
        row = draw(rng, ref)
        row["request_id"] = 10_000 + i
        row["request_type"] = _REQUEST_TYPES[int(rng.integers(0, len(_REQUEST_TYPES)))]
        row["employee_id"] = int(rng.integers(1000, 1200))
        row["employee_department"] = _DEPARTMENTS[int(rng.integers(0, len(_DEPARTMENTS)))]
        row["end_date"] = (row["start_date"] + timedelta(days=max(0, row["duration_days"] - 1)))
        row["start_date"] = row["start_date"].isoformat()
        row["end_date"] = row["end_date"].isoformat()
        rows.append(row)

    return pd.DataFrame(rows)


def save_dataframe(df: pd.DataFrame, output_dir: Path) -> tuple[Path, Path | None]:
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "synthetic_approvals.csv"
    df.to_csv(csv_path, index=False)
    parquet_path: Path | None = None
    try:
        parquet_path = output_dir / "synthetic_approvals.parquet"
        df.to_parquet(parquet_path, index=False)
    except Exception as exc:  # pragma: no cover - optional engine
        logger.warning("parquet write failed (%s); kept CSV only", exc)
        parquet_path = None
    return csv_path, parquet_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[3] / "storage" / "training_data",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    df = generate(args.rows, args.seed)
    csv_path, parquet_path = save_dataframe(df, args.out)
    print(f"wrote {len(df)} approval rows to {csv_path}")
    if parquet_path:
        print(f"parquet copy at {parquet_path}")
    print(f"approval rate: {df['approved'].mean():.2%}")


if __name__ == "__main__":
    main()
