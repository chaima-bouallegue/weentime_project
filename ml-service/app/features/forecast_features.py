"""Feature engineering for absence and leave forecasting."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

import numpy as np
import pandas as pd


FEATURE_NAMES: tuple[str, ...] = (
    "day_of_week",
    "month",
    "week_of_year",
    "is_weekend",
    "is_holiday",
    "is_before_holiday",
    "is_summer_period",
    "is_end_of_month",
    "employee_count",
    "department_id",
    "team_id",
    "leave_balance",
    "absence_count_last_30_days",
    "leave_count_last_30_days",
    "late_count_last_30_days",
    "remote_days_last_30_days",
    "approved_leave_count",
    "pending_leave_count",
    "team_absence_rate",
    "department_absence_rate",
    "team_leave_count_last_week",
    "department_leave_count_last_month",
    "average_presence_rate",
    "pending_requests_count",
    "approved_requests_count",
    "weekly_leave_trend",
    "monthly_absence_trend",
)


@dataclass(slots=True)
class ForecastFeatureRow:
    target_date: date
    employee_count: int = 0
    department_id: int | None = None
    team_id: int | None = None
    leave_balance: float = 0.0
    absence_count_last_30_days: float = 0.0
    leave_count_last_30_days: float = 0.0
    late_count_last_30_days: float = 0.0
    remote_days_last_30_days: float = 0.0
    approved_leave_count: float = 0.0
    pending_leave_count: float = 0.0
    team_absence_rate: float = 0.0
    department_absence_rate: float = 0.0
    team_leave_count_last_week: float = 0.0
    department_leave_count_last_month: float = 0.0
    average_presence_rate: float = 100.0
    pending_requests_count: float = 0.0
    approved_requests_count: float = 0.0
    weekly_leave_trend: float = 0.0
    monthly_absence_trend: float = 0.0
    holidays: frozenset[date] = frozenset()

    def to_dict(self) -> dict[str, float | int]:
        before_holiday = self.target_date + timedelta(days=1) in self.holidays
        month_end = (self.target_date + timedelta(days=1)).month != self.target_date.month
        values: dict[str, float | int] = {
            "day_of_week": self.target_date.weekday(),
            "month": self.target_date.month,
            "week_of_year": self.target_date.isocalendar().week,
            "is_weekend": 1 if self.target_date.weekday() >= 5 else 0,
            "is_holiday": 1 if self.target_date in self.holidays else 0,
            "is_before_holiday": 1 if before_holiday else 0,
            "is_summer_period": 1 if self.target_date.month in {6, 7, 8} else 0,
            "is_end_of_month": 1 if month_end else 0,
            "employee_count": self.employee_count,
            "department_id": self.department_id or 0,
            "team_id": self.team_id or 0,
            "leave_balance": self.leave_balance,
            "absence_count_last_30_days": self.absence_count_last_30_days,
            "leave_count_last_30_days": self.leave_count_last_30_days,
            "late_count_last_30_days": self.late_count_last_30_days,
            "remote_days_last_30_days": self.remote_days_last_30_days,
            "approved_leave_count": self.approved_leave_count,
            "pending_leave_count": self.pending_leave_count,
            "team_absence_rate": self.team_absence_rate,
            "department_absence_rate": self.department_absence_rate,
            "team_leave_count_last_week": self.team_leave_count_last_week,
            "department_leave_count_last_month": self.department_leave_count_last_month,
            "average_presence_rate": self.average_presence_rate,
            "pending_requests_count": self.pending_requests_count,
            "approved_requests_count": self.approved_requests_count,
            "weekly_leave_trend": self.weekly_leave_trend,
            "monthly_absence_trend": self.monthly_absence_trend,
        }
        return values

    def to_vector(self) -> np.ndarray:
        data = self.to_dict()
        return np.array([float(data[name]) for name in FEATURE_NAMES], dtype=np.float64)


class ForecastFeatureBuilder:
    def to_dataframe(self, rows: Iterable[ForecastFeatureRow]) -> pd.DataFrame:
        return pd.DataFrame([row.to_dict() for row in rows], columns=list(FEATURE_NAMES))

    @staticmethod
    def to_model_input(row: ForecastFeatureRow) -> np.ndarray:
        return row.to_vector().reshape(1, -1)


def risk_from_metrics(absences: float, leaves: float, presence_rate: float, employee_count: int) -> str:
    total_pressure = absences + leaves
    ratio = total_pressure / max(employee_count, 1)
    if presence_rate < 60 or ratio >= 0.45:
        return "CRITICAL"
    if presence_rate < 75 or ratio >= 0.30:
        return "HIGH"
    if presence_rate < 88 or ratio >= 0.15:
        return "MEDIUM"
    return "LOW"
