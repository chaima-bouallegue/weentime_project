"""Pydantic schemas for absence and leave forecasting endpoints."""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ForecastRiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ForecastWorkloadLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ForecastDataQualityStatus(str, Enum):
    OK = "OK"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    UNAVAILABLE = "UNAVAILABLE"


class ForecastDataQuality(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: ForecastDataQualityStatus = ForecastDataQualityStatus.OK
    fallback_used: bool = Field(default=False, serialization_alias="fallbackUsed")
    message: str | None = None
    historical_days: int = Field(default=0, serialization_alias="historicalDays")
    source: str = "database"


class ForecastSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    predicted_absences: float = Field(default=0.0, serialization_alias="predictedAbsences")
    predicted_leaves: float = Field(default=0.0, serialization_alias="predictedLeaves")
    predicted_presence_rate: float = Field(default=100.0, serialization_alias="predictedPresenceRate")
    risk_level: ForecastRiskLevel = Field(default=ForecastRiskLevel.LOW, serialization_alias="riskLevel")
    predicted_workload: ForecastWorkloadLevel = Field(
        default=ForecastWorkloadLevel.LOW,
        serialization_alias="predictedWorkload",
    )


class ForecastSeriesPoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    date: str
    predicted_absences: float = Field(default=0.0, serialization_alias="predictedAbsences")
    predicted_leaves: float = Field(default=0.0, serialization_alias="predictedLeaves")
    predicted_presence_rate: float = Field(default=100.0, serialization_alias="predictedPresenceRate")
    actual_absences: float | None = Field(default=None, serialization_alias="actualAbsences")
    actual_leaves: float | None = Field(default=None, serialization_alias="actualLeaves")


class ForecastTeamPrediction(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    team_id: int | None = Field(default=None, serialization_alias="teamId")
    team_name: str = Field(default="Non assigne", serialization_alias="teamName")
    department_id: int | None = Field(default=None, serialization_alias="departmentId")
    department_name: str | None = Field(default=None, serialization_alias="departmentName")
    predicted_absences: float = Field(default=0.0, serialization_alias="predictedAbsences")
    predicted_leaves: float = Field(default=0.0, serialization_alias="predictedLeaves")
    predicted_presence_rate: float = Field(default=100.0, serialization_alias="predictedPresenceRate")
    risk_level: ForecastRiskLevel = Field(default=ForecastRiskLevel.LOW, serialization_alias="riskLevel")
    explanation: str


class ForecastEmployeeRisk(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    employee_id: int = Field(serialization_alias="employeeId")
    employee_name: str = Field(serialization_alias="employeeName")
    team_id: int | None = Field(default=None, serialization_alias="teamId")
    team_name: str | None = Field(default=None, serialization_alias="teamName")
    department_id: int | None = Field(default=None, serialization_alias="departmentId")
    department_name: str | None = Field(default=None, serialization_alias="departmentName")
    absence_count_last_30_days: int = Field(default=0, serialization_alias="absenceCountLast30Days")
    leave_count_last_30_days: int = Field(default=0, serialization_alias="leaveCountLast30Days")
    late_count_last_30_days: int = Field(default=0, serialization_alias="lateCountLast30Days")
    planned_leave_days: int = Field(default=0, serialization_alias="plannedLeaveDays")
    risk_level: ForecastRiskLevel = Field(default=ForecastRiskLevel.LOW, serialization_alias="riskLevel")
    score: float = Field(default=0.0, ge=0.0, le=1.0)
    explanation: str


class ForecastDashboardResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    period: str
    generated_at: datetime = Field(serialization_alias="generatedAt")
    summary: ForecastSummary
    series: list[ForecastSeriesPoint] = Field(default_factory=list)
    teams: list[ForecastTeamPrediction] = Field(default_factory=list)
    explanations: list[str] = Field(default_factory=list)
    data_quality: ForecastDataQuality = Field(
        default_factory=ForecastDataQuality,
        serialization_alias="dataQuality",
    )


class ForecastListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    period: str
    generated_at: datetime = Field(serialization_alias="generatedAt")
    items: list[ForecastSeriesPoint] = Field(default_factory=list)
    data_quality: ForecastDataQuality = Field(
        default_factory=ForecastDataQuality,
        serialization_alias="dataQuality",
    )


class ForecastTeamPresenceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    period: str
    generated_at: datetime = Field(serialization_alias="generatedAt")
    teams: list[ForecastTeamPrediction] = Field(default_factory=list)
    data_quality: ForecastDataQuality = Field(
        default_factory=ForecastDataQuality,
        serialization_alias="dataQuality",
    )


class ForecastWorkloadResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    period: str
    generated_at: datetime = Field(serialization_alias="generatedAt")
    predicted_workload: ForecastWorkloadLevel = Field(serialization_alias="predictedWorkload")
    pending_requests_count: int = Field(default=0, serialization_alias="pendingRequestsCount")
    approved_requests_count: int = Field(default=0, serialization_alias="approvedRequestsCount")
    explanation: str
    data_quality: ForecastDataQuality = Field(
        default_factory=ForecastDataQuality,
        serialization_alias="dataQuality",
    )


class ForecastEmployeeRiskResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    period: str
    generated_at: datetime = Field(serialization_alias="generatedAt")
    employees: list[ForecastEmployeeRisk] = Field(default_factory=list)
    data_quality: ForecastDataQuality = Field(
        default_factory=ForecastDataQuality,
        serialization_alias="dataQuality",
    )


class ForecastHealthResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    status: str = "ok"
    model_loaded: bool = Field(default=False, serialization_alias="modelLoaded")
    model_version: str | None = Field(default=None, serialization_alias="modelVersion")
    metrics: dict[str, object] = Field(default_factory=dict)
