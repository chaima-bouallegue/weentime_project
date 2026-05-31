"""Pydantic schemas for ML anomaly endpoints.

The older Angular and ai-service contracts expect ``risk``, ``reasons`` and
``explanation``. The RH/Manager dashboards now also receive business-readable
fields such as category, title, detected reasons, attendance snapshot and
recommendations.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AnomalyCategory(str, Enum):
    NONE = "NONE"
    ABSENCE = "ABSENCE"
    LATE = "LATE"
    MISSING_CHECKOUT = "MISSING_CHECKOUT"
    RAPID_SESSION = "RAPID_SESSION"
    OVERTIME_EXCESS = "OVERTIME_EXCESS"
    NIGHT_ACTIVITY = "NIGHT_ACTIVITY"
    WEEKEND_ACTIVITY = "WEEKEND_ACTIVITY"
    HOLIDAY_ACTIVITY = "HOLIDAY_ACTIVITY"
    BEHAVIORAL_ANOMALY = "BEHAVIORAL_ANOMALY"


class DetectedReason(BaseModel):
    code: str
    label: str
    description: str
    value: str | None = None
    expected: str | None = None


class AttendanceSnapshot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    scheduled_start: str | None = Field(default=None, serialization_alias="scheduledStart")
    scheduled_end: str | None = Field(default=None, serialization_alias="scheduledEnd")
    check_in: str | None = Field(default=None, serialization_alias="checkIn")
    check_out: str | None = Field(default=None, serialization_alias="checkOut")
    worked_minutes: int | None = Field(default=None, serialization_alias="workedMinutes")
    late_minutes: int = Field(default=0, serialization_alias="lateMinutes")
    overtime_minutes: int = Field(default=0, serialization_alias="overtimeMinutes")
    missing_checkout: bool = Field(default=False, serialization_alias="missingCheckout")
    is_absent: bool = Field(default=False, serialization_alias="isAbsent")


class AnomalyRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    employee_id: int
    employee_name: str
    date: str
    score: float = Field(ge=0.0, le=1.0)
    risk: RiskLevel
    severity: RiskLevel | None = None
    category: AnomalyCategory | str = AnomalyCategory.BEHAVIORAL_ANOMALY
    title: str = ""
    summary: str = ""
    reasons: list[str] = Field(default_factory=list)
    detected_reasons: list[DetectedReason] = Field(
        default_factory=list,
        serialization_alias="detectedReasons",
    )
    attendance_snapshot: AttendanceSnapshot | None = Field(
        default=None,
        serialization_alias="attendanceSnapshot",
    )
    recommendation: str = ""
    actions: list[str] = Field(default_factory=lambda: ["IGNORE", "CONTACT_EMPLOYEE", "VIEW_DETAILS"])
    missing_data_warnings: list[str] = Field(
        default_factory=list,
        serialization_alias="missingDataWarnings",
    )
    explanation: str
    # Raw feature vectors are useful for diagnostics but should stay empty in
    # normal UI calls. Routes pass ?debug=true when they intentionally expose it.
    features: dict[str, Any] = Field(default_factory=dict)

    def model_post_init(self, __context: Any) -> None:
        if self.severity is None:
            self.severity = self.risk
        if not self.summary:
            self.summary = self.explanation
        if not self.title:
            self.title = str(self.category).replace("_", " ").title()


class AnomalyDashboardResponse(BaseModel):
    success: bool = True
    # Retained for backward-compat with the Angular contract. The service no
    # longer fabricates synthetic anomalies, so this is always False.
    is_demo: bool = False
    # "ok" when the presence backend answered; "unavailable" when it could not
    # be reached / errored (the UI shows an honest banner instead of fake data).
    backend_status: str = "ok"
    generated_at: datetime
    total_anomalies: int = 0
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    anomalies: list[AnomalyRecord] = Field(default_factory=list)
    grouped_by_severity: dict[str, int] = Field(default_factory=dict, serialization_alias="groupedBySeverity")
    grouped_by_category: dict[str, int] = Field(default_factory=dict, serialization_alias="groupedByCategory")
    top_anomalies: list[AnomalyRecord] = Field(default_factory=list, serialization_alias="topAnomalies")


class EmployeeRiskResponse(BaseModel):
    success: bool = True
    employee_id: int
    employee_name: str
    current_risk: RiskLevel
    score: float = Field(ge=0.0, le=1.0)
    anomalies_last_30_days: int = 0
    trend: str = "STABLE"  # IMPROVING | STABLE | WORSENING
    latest_anomaly: AnomalyRecord | None = None


class TrainResponse(BaseModel):
    success: bool
    message: str
    records_used: int
    model_version: str
    training_duration_seconds: float
    contamination_observed: float | None = None


class HealthResponse(BaseModel):
    success: bool = True
    status: str = "ok"
    model_loaded: bool = False
    model_version: str | None = None
    version: str


class AnomalyActionResponse(BaseModel):
    success: bool = True
    anomaly_id: str = Field(serialization_alias="anomalyId")
    action: str
    message: str
