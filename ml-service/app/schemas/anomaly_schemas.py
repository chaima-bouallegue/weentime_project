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


class AnomalyStatus(str, Enum):
    UNVERIFIED = "UNVERIFIED"
    IN_PROGRESS = "IN_PROGRESS"
    JUSTIFIED = "JUSTIFIED"
    SUSPICIOUS = "SUSPICIOUS"
    CLOSED = "CLOSED"


class AnomalyCategory(str, Enum):
    NONE = "NONE"
    ABSENCE = "ABSENCE"
    LATE_ARRIVAL = "LATE_ARRIVAL"
    # Backward-compatible legacy value kept for older tests/clients.
    LATE = "LATE"
    MISSING_CHECKOUT = "MISSING_CHECKOUT"
    REPEATED_MISSING_CHECKOUT = "REPEATED_MISSING_CHECKOUT"
    RAPID_SESSION = "RAPID_SESSION"
    OVERTIME_EXCESS = "OVERTIME_EXCESS"
    UNUSUAL_WORKING_HOURS = "UNUSUAL_WORKING_HOURS"
    NIGHT_ACTIVITY = "NIGHT_ACTIVITY"
    WEEKEND_ACTIVITY = "WEEKEND_ACTIVITY"
    HOLIDAY_ACTIVITY = "HOLIDAY_ACTIVITY"
    SUSPICIOUS_POINTAGE = "SUSPICIOUS_POINTAGE"
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
    is_weekend: bool = Field(default=False, serialization_alias="isWeekend")
    location: str | None = None


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
    ml_score: float | None = Field(default=None, ge=0.0, le=1.0, serialization_alias="mlScore")
    ml_prediction: bool | None = Field(default=None, serialization_alias="mlPrediction")
    detection_source: str = Field(default="RULE", serialization_alias="detectionSource")
    model_version: str | None = Field(default=None, serialization_alias="modelVersion")
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
    model_config = ConfigDict(populate_by_name=True)

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
    by_risk: dict[str, int] = Field(default_factory=dict, serialization_alias="byRisk")
    by_type: dict[str, int] = Field(default_factory=dict, serialization_alias="byType")
    by_day: dict[str, int] = Field(default_factory=dict, serialization_alias="byDay")
    top_anomalies: list[AnomalyRecord] = Field(default_factory=list, serialization_alias="topAnomalies")
    source_endpoint: str | None = Field(default=None, serialization_alias="sourceEndpoint")
    endpoint_name: str | None = Field(default=None, serialization_alias="endpointName")
    scope: str | None = None
    role: str | None = None
    entreprise_id: int | None = Field(default=None, serialization_alias="entrepriseId")
    raw_records_count: int = Field(default=0, serialization_alias="rawRecordsCount")
    parsed_records_count: int = Field(default=0, serialization_alias="parsedRecordsCount")
    returned_anomalies_count: int = Field(default=0, serialization_alias="returnedAnomaliesCount")
    duplicates_removed: int = Field(default=0, serialization_alias="duplicatesRemoved")
    anomalies_count: int = Field(default=0, serialization_alias="anomaliesCount")
    rule_anomalies_count: int = Field(default=0, serialization_alias="ruleAnomaliesCount")
    ml_anomalies_count: int = Field(default=0, serialization_alias="mlAnomaliesCount")
    skipped_records: list[dict[str, Any]] = Field(default_factory=list, serialization_alias="skippedRecords")
    zero_reason: str | None = Field(default=None, serialization_alias="zeroReason")
    date_used: str | None = Field(default=None, serialization_alias="dateUsed")


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
    model_config = ConfigDict(populate_by_name=True)

    success: bool
    message: str
    records_used: int
    model_version: str
    training_duration_seconds: float
    contamination_observed: float | None = None
    data_source: str = Field(default="unknown", serialization_alias="dataSource")
    thresholds: dict[str, float] = Field(default_factory=dict)


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


class AdminAnomalySummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_anomalies: int = Field(default=0, serialization_alias="totalAnomalies")
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    employees_concerned: int = Field(default=0, serialization_alias="employeesConcerned")
    anomaly_rate: float = Field(default=0.0, serialization_alias="anomalyRate")
    unverified: int = 0
    in_progress: int = Field(default=0, serialization_alias="inProgress")
    justified: int = 0
    suspicious: int = 0
    closed: int = 0


class AdminRiskBucket(BaseModel):
    risk: RiskLevel
    count: int
    percentage: float = 0.0


class AdminTypeBucket(BaseModel):
    category: str
    label: str
    count: int
    percentage: float = 0.0


class AdminDayBucket(BaseModel):
    date: str
    count: int


class AdminTopEmployee(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    employee_id: int = Field(serialization_alias="employeeId")
    employee_name: str = Field(serialization_alias="employeeName")
    count: int
    highest_risk: RiskLevel = Field(serialization_alias="highestRisk")
    max_score: float = Field(serialization_alias="maxScore")
    department_name: str | None = Field(default=None, serialization_alias="departmentName")


class AdminAnomalyItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    employee_id: int = Field(serialization_alias="employeeId")
    employee_name: str = Field(serialization_alias="employeeName")
    date: str
    category: str
    category_label: str = Field(serialization_alias="categoryLabel")
    risk: RiskLevel
    score: float = Field(ge=0.0, le=1.0)
    ml_score: float | None = Field(default=None, ge=0.0, le=1.0, serialization_alias="mlScore")
    ml_prediction: bool | None = Field(default=None, serialization_alias="mlPrediction")
    detection_source: str = Field(default="RULE", serialization_alias="detectionSource")
    model_version: str | None = Field(default=None, serialization_alias="modelVersion")
    title: str
    summary: str
    explanation: str
    reasons: list[str] = Field(default_factory=list)
    detected_reasons: list[DetectedReason] = Field(
        default_factory=list,
        serialization_alias="detectedReasons",
    )
    recommendation: str = ""
    actions: list[str] = Field(default_factory=list)
    status: AnomalyStatus = AnomalyStatus.UNVERIFIED
    status_comment: str | None = Field(default=None, serialization_alias="statusComment")
    status_updated_at: datetime | None = Field(default=None, serialization_alias="statusUpdatedAt")
    attendance_snapshot: AttendanceSnapshot | None = Field(
        default=None,
        serialization_alias="attendanceSnapshot",
    )
    missing_data_warnings: list[str] = Field(default_factory=list, serialization_alias="missingDataWarnings")
    entreprise_id: int | None = Field(default=None, serialization_alias="entrepriseId")
    entreprise_name: str | None = Field(default=None, serialization_alias="entrepriseName")
    manager_id: int | None = Field(default=None, serialization_alias="managerId")
    team_id: int | None = Field(default=None, serialization_alias="teamId")
    team_name: str | None = Field(default=None, serialization_alias="teamName")
    department_id: int | None = Field(default=None, serialization_alias="departmentId")
    department_name: str | None = Field(default=None, serialization_alias="departmentName")
    source: str | None = None


class AdminAnomalyDashboardResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    generated_at: datetime = Field(serialization_alias="generatedAt")
    backend_status: str = Field(default="ok", serialization_alias="backendStatus")
    source_endpoint: str | None = Field(default=None, serialization_alias="sourceEndpoint")
    scope: str | None = None
    raw_records_count: int = Field(default=0, serialization_alias="rawRecordsCount")
    parsed_records_count: int = Field(default=0, serialization_alias="parsedRecordsCount")
    summary: AdminAnomalySummary = Field(default_factory=AdminAnomalySummary)
    by_risk: list[AdminRiskBucket] = Field(default_factory=list, serialization_alias="byRisk")
    by_type: list[AdminTypeBucket] = Field(default_factory=list, serialization_alias="byType")
    by_day: list[AdminDayBucket] = Field(default_factory=list, serialization_alias="byDay")
    top_employees: list[AdminTopEmployee] = Field(default_factory=list, serialization_alias="topEmployees")
    top_anomalies: list[AdminAnomalyItem] = Field(default_factory=list, serialization_alias="topAnomalies")


class AdminAnomalyListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    generated_at: datetime = Field(serialization_alias="generatedAt")
    backend_status: str = Field(default="ok", serialization_alias="backendStatus")
    total: int = 0
    page: int = 1
    size: int = 20
    total_pages: int = Field(default=0, serialization_alias="totalPages")
    summary: AdminAnomalySummary = Field(default_factory=AdminAnomalySummary)
    items: list[AdminAnomalyItem] = Field(default_factory=list)


class AdminStatusUpdateRequest(BaseModel):
    status: AnomalyStatus
    comment: str | None = None


class AdminStatusUpdateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    anomaly_id: str = Field(serialization_alias="anomalyId")
    status: AnomalyStatus
    comment: str | None = None
    updated_at: datetime = Field(serialization_alias="updatedAt")
