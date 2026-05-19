"""Synthetic attendance generator.

Produces rows matching the WeenTime ``AttendanceSession`` shape so the same
feature engineer is used for training and inference. Five employee profiles
plus an injected anomaly band (~5%).
"""
from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class EmployeeProfile:
    label: str
    checkin_mean: float
    checkin_std: float
    worked_hours_mean: float
    worked_hours_std: float
    remote_prob: float
    weight: float


PROFILES: tuple[EmployeeProfile, ...] = (
    EmployeeProfile("normal_office", 8.5, 0.5, 8.0, 0.5, 0.10, 0.50),
    EmployeeProfile("early_bird",    7.0, 0.3, 8.5, 0.4, 0.05, 0.15),
    EmployeeProfile("late_worker",  10.0, 0.8, 9.0, 0.5, 0.20, 0.15),
    EmployeeProfile("remote_worker", 9.0, 1.0, 7.5, 1.0, 0.80, 0.15),
)
ANOMALY_RATE = 0.05


_FIRST_NAMES = (
    "Sami", "Amira", "Yassine", "Ines", "Karim", "Sarra", "Mehdi", "Nour",
    "Aymen", "Rania", "Hatem", "Leila", "Omar", "Salma", "Walid", "Mariem",
    "Bilel", "Imene", "Hamza", "Donia",
)
_LAST_NAMES = (
    "Ben Ali", "Trabelsi", "Gharbi", "Sassi", "Mejri", "Belhaj", "Chebbi",
    "Karoui", "Ferjani", "Bouazizi", "Hammami", "Saidi",
)


def _build_employees(n: int, rng: np.random.Generator) -> list[dict]:
    employees = []
    for i in range(n):
        profile = rng.choice(PROFILES, p=[p.weight for p in PROFILES])
        first = _FIRST_NAMES[rng.integers(0, len(_FIRST_NAMES))]
        last = _LAST_NAMES[rng.integers(0, len(_LAST_NAMES))]
        employees.append(
            {
                "employee_id": 1000 + i,
                "employee_name": f"{first} {last}",
                "profile": profile,
            }
        )
    return employees


def _generate_normal_row(
    employee: dict,
    day: date,
    rng: np.random.Generator,
) -> dict:
    profile: EmployeeProfile = employee["profile"]
    is_remote = rng.random() < profile.remote_prob

    checkin_hour = float(rng.normal(profile.checkin_mean, profile.checkin_std))
    checkin_hour = max(5.0, min(checkin_hour, 13.0))

    worked = float(rng.normal(profile.worked_hours_mean, profile.worked_hours_std))
    worked = max(2.0, min(worked, 12.0))

    check_in = datetime.combine(day, time(int(checkin_hour), int((checkin_hour % 1) * 60)))
    check_out = check_in + timedelta(hours=worked)

    return {
        "employee_id": employee["employee_id"],
        "employee_name": employee["employee_name"],
        "date": day.isoformat(),
        "check_in": check_in.isoformat(),
        "check_out": check_out.isoformat(),
        "duration_seconds": int(worked * 3600),
        "daily_status": "REMOTE" if is_remote else "WORKING",
        "late_arrival": checkin_hour > 9.17,  # past 09:10 tolerance
        "source": "WEB" if not is_remote else "MOBILE",
        "localisation": "Tunis" if not is_remote else "Remote",
        "anomaly_injected": False,
        "profile_label": profile.label,
    }


def _generate_anomalous_row(
    employee: dict,
    day: date,
    rng: np.random.Generator,
) -> dict:
    kind = rng.choice(
        ("night_checkin", "missing_checkout", "extreme_duration", "rapid_session", "weekend"),
        p=(0.25, 0.25, 0.25, 0.15, 0.10),
    )

    if kind == "night_checkin":
        checkin_hour = float(rng.uniform(2.0, 5.0))
        worked = float(rng.uniform(2.0, 6.0))
        check_in = datetime.combine(day, time(int(checkin_hour), int((checkin_hour % 1) * 60)))
        check_out = check_in + timedelta(hours=worked)
        return _row(employee, day, check_in, check_out, int(worked * 3600), kind)

    if kind == "missing_checkout":
        checkin_hour = float(rng.uniform(8.0, 10.0))
        check_in = datetime.combine(day, time(int(checkin_hour), int((checkin_hour % 1) * 60)))
        return _row(employee, day, check_in, None, None, kind)

    if kind == "extreme_duration":
        checkin_hour = float(rng.uniform(6.5, 9.5))
        worked = float(rng.uniform(14.0, 18.0))
        check_in = datetime.combine(day, time(int(checkin_hour), int((checkin_hour % 1) * 60)))
        check_out = check_in + timedelta(hours=worked)
        return _row(employee, day, check_in, check_out, int(worked * 3600), kind)

    if kind == "rapid_session":
        checkin_hour = float(rng.uniform(8.5, 11.0))
        worked = float(rng.uniform(0.05, 0.4))  # 3-25 minutes
        check_in = datetime.combine(day, time(int(checkin_hour), int((checkin_hour % 1) * 60)))
        check_out = check_in + timedelta(hours=worked)
        return _row(employee, day, check_in, check_out, int(worked * 3600), kind)

    # weekend
    checkin_hour = float(rng.uniform(9.0, 14.0))
    worked = float(rng.uniform(3.0, 7.0))
    check_in = datetime.combine(day, time(int(checkin_hour), int((checkin_hour % 1) * 60)))
    check_out = check_in + timedelta(hours=worked)
    return _row(employee, day, check_in, check_out, int(worked * 3600), kind)


def _row(
    employee: dict,
    day: date,
    check_in: datetime,
    check_out: datetime | None,
    duration: int | None,
    kind: str,
) -> dict:
    return {
        "employee_id": employee["employee_id"],
        "employee_name": employee["employee_name"],
        "date": day.isoformat(),
        "check_in": check_in.isoformat(),
        "check_out": check_out.isoformat() if check_out else None,
        "duration_seconds": duration,
        "daily_status": "WORKING",
        "late_arrival": True,
        "source": "WEB",
        "localisation": "Tunis",
        "anomaly_injected": True,
        "profile_label": f"anomaly_{kind}",
    }


def generate(
    n_rows: int = 10_000,
    n_employees: int = 50,
    days_back: int = 120,
    seed: int = 42,
    end_date: date | None = None,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    employees = _build_employees(n_employees, rng)
    end = end_date or date.today()

    rows: list[dict] = []
    target_anomalies = int(n_rows * ANOMALY_RATE)
    target_normal = n_rows - target_anomalies

    # Normal rows: random employee x day in business-day window.
    while sum(1 for r in rows if not r["anomaly_injected"]) < target_normal:
        emp = employees[int(rng.integers(0, len(employees)))]
        day_offset = int(rng.integers(0, days_back))
        day = end - timedelta(days=day_offset)
        if day.weekday() >= 5:
            # 90% skip weekends for normal rows; preserve 10% to add realism.
            if rng.random() < 0.9:
                continue
        rows.append(_generate_normal_row(emp, day, rng))

    while sum(1 for r in rows if r["anomaly_injected"]) < target_anomalies:
        emp = employees[int(rng.integers(0, len(employees)))]
        day_offset = int(rng.integers(0, days_back))
        day = end - timedelta(days=day_offset)
        rows.append(_generate_anomalous_row(emp, day, rng))

    rng.shuffle(rows)
    return pd.DataFrame(rows)


def save_dataframe(df: pd.DataFrame, output_dir: Path) -> tuple[Path, Path | None]:
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "synthetic_attendance.csv"
    df.to_csv(csv_path, index=False)
    parquet_path: Path | None = None
    try:
        parquet_path = output_dir / "synthetic_attendance.parquet"
        df.to_parquet(parquet_path, index=False)
    except Exception as exc:  # pragma: no cover - parquet engine optional
        logger.warning("parquet write failed (%s); kept CSV only", exc)
        parquet_path = None
    return csv_path, parquet_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=10_000)
    parser.add_argument("--employees", type=int, default=50)
    parser.add_argument("--days", type=int, default=120)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "storage" / "training_data",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    df = generate(args.rows, args.employees, args.days, args.seed)
    csv_path, parquet_path = save_dataframe(df, args.out)
    print(f"wrote {len(df)} rows to {csv_path}")
    if parquet_path:
        print(f"parquet copy at {parquet_path}")


if __name__ == "__main__":
    main()
