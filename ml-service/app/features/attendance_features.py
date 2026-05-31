"""Feature engineering for WeenTime attendance anomaly detection.

The feature vector order is fixed by ``FEATURE_NAMES`` and must NOT change after
a model is trained (the model file is keyed to this layout). New features
append at the end and require a model retrain.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as date_cls, datetime, time, timedelta
from typing import Iterable, Sequence

import numpy as np
import pandas as pd


# Configured by application.yml of presence-service. Kept here so the ML
# service can run without touching Spring config.
WORK_START = time(9, 0)
WORK_END = time(18, 0)
LATE_TOLERANCE_MINUTES = 10
LATE_THRESHOLD_HOUR = 9 + 10 / 60.0  # 09:10


FEATURE_NAMES: tuple[str, ...] = (
    "arrival_hour",
    "departure_hour",
    "worked_hours",
    "late_minutes",
    "weekday",
    "is_weekend",
    "missing_checkout",
    "remote_flag",
    "weekly_hours",
    "avg_checkin_hour_30d",
    "deviation_from_usual",
    "behavior_delta_weekly",
    "night_activity",
    "rapid_session",
    "overtime_excess",
    # Presence-state indicators (appended v2). These let the model tell
    # "0 worked_hours because ABSENT" from "0 worked_hours because anomaly":
    # an all-zero time vector with is_absent=1 is a NORMAL not-checked-in row,
    # whereas missing_checkout=1 (has_checkin=1, has_checkout=0) is suspicious.
    "has_checkin",
    "has_checkout",
    "is_absent",
    "is_late",
    "is_remote",
    "is_working",
)


@dataclass(slots=True)
class AttendanceRecord:
    """Raw attendance row -- mirrors the shape returned by presence-service."""

    employee_id: int
    employee_name: str
    date: date_cls
    check_in: datetime | None
    check_out: datetime | None
    duration_seconds: int | None = None
    expected_minutes: int | None = None
    worked_minutes: int | None = None
    overtime_minutes: int | None = None
    scheduled_start: time | None = None
    scheduled_end: time | None = None
    scheduled_workday: bool | None = None
    approved_leave: bool | None = None
    holiday: bool | None = None
    exceptional_work_allowed: bool | None = None
    daily_status: str | None = None  # WORKING, REMOTE, ON_LEAVE, ...
    late_arrival: bool | None = None
    source: str | None = None
    localisation: str | None = None
    missing_data_warnings: list[str] = field(default_factory=list)

    @property
    def status_upper(self) -> str:
        return (self.daily_status or "").upper()

    @property
    def is_remote(self) -> bool:
        return self.status_upper == "REMOTE"

    @property
    def has_checkin(self) -> bool:
        return self.check_in is not None

    @property
    def has_checkout(self) -> bool:
        return self.check_out is not None

    @property
    def is_absent(self) -> bool:
        # ABSENT either by explicit status or by simply never having checked in.
        if self.status_upper in {"ABSENT", "ON_LEAVE", "CONGE", "LEAVE"}:
            return True
        return self.check_in is None


@dataclass(slots=True)
class AttendanceFeatures:
    employee_id: int
    employee_name: str
    date: date_cls
    arrival_hour: float
    departure_hour: float
    worked_hours: float
    late_minutes: float
    weekday: int
    is_weekend: int
    missing_checkout: int
    remote_flag: int
    weekly_hours: float
    avg_checkin_hour_30d: float
    deviation_from_usual: float
    behavior_delta_weekly: float
    night_activity: int
    rapid_session: int
    overtime_excess: int
    has_checkin: int = 0
    has_checkout: int = 0
    is_absent: int = 0
    is_late: int = 0
    is_remote: int = 0
    is_working: int = 0
    raw: dict[str, object] = field(default_factory=dict)

    def to_vector(self) -> np.ndarray:
        return np.array(
            [
                self.arrival_hour,
                self.departure_hour,
                self.worked_hours,
                self.late_minutes,
                self.weekday,
                self.is_weekend,
                self.missing_checkout,
                self.remote_flag,
                self.weekly_hours,
                self.avg_checkin_hour_30d,
                self.deviation_from_usual,
                self.behavior_delta_weekly,
                self.night_activity,
                self.rapid_session,
                self.overtime_excess,
                self.has_checkin,
                self.has_checkout,
                self.is_absent,
                self.is_late,
                self.is_remote,
                self.is_working,
            ],
            dtype=np.float64,
        )

    def to_dict(self) -> dict[str, float | int]:
        return {name: getattr(self, name) for name in FEATURE_NAMES}


def _hour_of(dt: datetime | None) -> float:
    if dt is None:
        return 0.0
    return dt.hour + dt.minute / 60.0 + dt.second / 3600.0


def _worked_hours(record: AttendanceRecord) -> float:
    if record.worked_minutes is not None and record.worked_minutes > 0:
        return record.worked_minutes / 60.0
    if record.duration_seconds and record.duration_seconds > 0:
        return record.duration_seconds / 3600.0
    if record.check_in and record.check_out and record.check_out > record.check_in:
        return (record.check_out - record.check_in).total_seconds() / 3600.0
    return 0.0


def _late_minutes(record: AttendanceRecord) -> float:
    if not record.check_in:
        return 0.0
    scheduled_start = record.scheduled_start or WORK_START
    threshold_dt = datetime.combine(record.check_in.date(), scheduled_start) + timedelta(
        minutes=LATE_TOLERANCE_MINUTES
    )
    delta = (record.check_in - threshold_dt).total_seconds() / 60.0
    return max(0.0, delta)


class FeatureEngineer:
    """Computes feature vectors for one or many ``AttendanceRecord`` rows.

    History-dependent features (weekly hours, baseline check-in, behavior delta)
    use the records collection itself -- callers pass the relevant slice.
    """

    def compute_features(
        self,
        record: AttendanceRecord,
        employee_history: Sequence[AttendanceRecord] | None = None,
    ) -> AttendanceFeatures:
        history = list(employee_history or [])
        # Exclude the current row if it appears in history.
        history = [h for h in history if not (h.date == record.date and h.check_in == record.check_in)]

        arrival = _hour_of(record.check_in)
        departure = _hour_of(record.check_out)
        worked = _worked_hours(record)
        late = _late_minutes(record)
        weekday = record.date.weekday()
        is_weekend = 1 if weekday >= 5 else 0
        missing_checkout = 1 if (record.check_in and record.check_out is None) else 0
        remote_flag = 1 if record.is_remote else 0

        weekly_hours = self._compute_weekly_hours(record, history)
        avg_checkin = self._avg_checkin_hour(history)
        deviation = abs(arrival - avg_checkin) if arrival > 0 else 0.0
        behavior_delta = self._compute_behavior_delta(record, history)

        night = 1 if (arrival > 0 and (arrival < 6 or arrival > 22)) else 0
        rapid = 1 if 0 < worked < 0.5 and missing_checkout == 0 else 0
        expected_minutes = record.expected_minutes
        overtime_minutes = record.overtime_minutes
        if overtime_minutes is None and expected_minutes is not None:
            overtime_minutes = max(int(worked * 60) - expected_minutes, 0)
        overtime = 1 if (overtime_minutes is not None and overtime_minutes >= 30) or worked > 10 else 0

        # Presence-state indicators.
        has_checkin = 1 if record.has_checkin else 0
        has_checkout = 1 if record.has_checkout else 0
        is_absent = 1 if record.is_absent else 0
        is_late = 1 if (record.status_upper == "LATE" or bool(record.late_arrival) or late > 0) else 0
        is_remote = remote_flag
        # "Working" = physically present and not flagged absent/late/remote.
        is_working = 1 if (has_checkin and not is_absent and record.status_upper in {"WORKING", "PRESENT", ""}) else 0

        return AttendanceFeatures(
            employee_id=record.employee_id,
            employee_name=record.employee_name,
            date=record.date,
            arrival_hour=arrival,
            departure_hour=departure,
            worked_hours=worked,
            late_minutes=late,
            weekday=weekday,
            is_weekend=is_weekend,
            missing_checkout=missing_checkout,
            remote_flag=remote_flag,
            weekly_hours=weekly_hours,
            avg_checkin_hour_30d=avg_checkin,
            deviation_from_usual=deviation,
            behavior_delta_weekly=behavior_delta,
            night_activity=night,
            rapid_session=rapid,
            overtime_excess=overtime,
            has_checkin=has_checkin,
            has_checkout=has_checkout,
            is_absent=is_absent,
            is_late=is_late,
            is_remote=is_remote,
            is_working=is_working,
            raw={
                "source": record.source,
                "localisation": record.localisation,
                "late_arrival": record.late_arrival,
                "daily_status": record.daily_status,
            },
        )

    def compute_batch_features(self, records: Iterable[AttendanceRecord]) -> pd.DataFrame:
        records_list = list(records)
        per_employee: dict[int, list[AttendanceRecord]] = {}
        for r in records_list:
            per_employee.setdefault(r.employee_id, []).append(r)
        for rows in per_employee.values():
            rows.sort(key=lambda x: (x.date, x.check_in or datetime.min))

        rows_out: list[dict[str, object]] = []
        for rec in records_list:
            history = per_employee.get(rec.employee_id, [])
            features = self.compute_features(rec, history)
            row = {
                "employee_id": features.employee_id,
                "employee_name": features.employee_name,
                "date": features.date.isoformat(),
                **features.to_dict(),
            }
            rows_out.append(row)
        return pd.DataFrame(rows_out)

    @staticmethod
    def to_model_input(features: AttendanceFeatures) -> np.ndarray:
        return features.to_vector().reshape(1, -1)

    # -- private helpers --------------------------------------------------

    @staticmethod
    def _avg_checkin_hour(history: Sequence[AttendanceRecord]) -> float:
        hours = [_hour_of(h.check_in) for h in history if h.check_in is not None]
        hours = [h for h in hours if h > 0]
        if not hours:
            return 9.0  # WeenTime default expected start
        return float(np.mean(hours[-30:]))  # last 30 entries

    @staticmethod
    def _compute_weekly_hours(
        record: AttendanceRecord,
        history: Sequence[AttendanceRecord],
    ) -> float:
        cutoff = record.date - timedelta(days=7)
        total = 0.0
        for h in history:
            if cutoff <= h.date <= record.date:
                total += _worked_hours(h)
        # Include the current record's own contribution.
        total += _worked_hours(record)
        return float(total)

    @staticmethod
    def _compute_behavior_delta(
        record: AttendanceRecord,
        history: Sequence[AttendanceRecord],
    ) -> float:
        current_week_start = record.date - timedelta(days=record.date.weekday())
        current_week_total = 0.0
        prior_weeks: dict[date_cls, float] = {}
        for h in history:
            week_start = h.date - timedelta(days=h.date.weekday())
            if week_start == current_week_start:
                current_week_total += _worked_hours(h)
            elif week_start < current_week_start:
                prior_weeks[week_start] = prior_weeks.get(week_start, 0.0) + _worked_hours(h)
        current_week_total += _worked_hours(record)
        if not prior_weeks:
            return 0.0
        # Average of up to last 4 prior weeks.
        recent_keys = sorted(prior_weeks.keys(), reverse=True)[:4]
        recent_avg = float(np.mean([prior_weeks[k] for k in recent_keys]))
        return float(current_week_total - recent_avg)
