"""Pydantic contracts for Smart Approval AI.

The ML service is context-agnostic: the backend assembles the full
``ApprovalAnalysisRequest`` (employee history, team coverage, anomaly score) and
the model returns a recommendation + explainable risk factors.
"""
from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class RequestType(str, Enum):
    CONGE = "CONGE"
    TELETRAVAIL = "TELETRAVAIL"
    AUTORISATION = "AUTORISATION"


class AiDecision(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    REVIEW = "REVIEW"  # AI uncertain -> human decides


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ApprovalAnalysisRequest(BaseModel):
    request_id: int
    request_type: RequestType
    employee_id: int
    employee_name: str = ""
    start_date: date
    end_date: date
    duration_days: int = Field(ge=0)

    # Employee context (supplied by the Java backend)
    employee_seniority_months: int = Field(default=0, ge=0)
    employee_department: str = ""
    employee_role: str = ""

    # Team context
    team_size: int = Field(default=1, ge=0)
    team_members_absent_same_period: int = Field(default=0, ge=0)
    team_critical_employees_absent: int = Field(default=0, ge=0)

    # Employee history
    absences_last_6_months: int = Field(default=0, ge=0)
    late_arrivals_last_30_days: int = Field(default=0, ge=0)
    approved_requests_last_year: int = Field(default=0, ge=0)
    rejected_requests_last_year: int = Field(default=0, ge=0)

    # Temporal context
    is_critical_period: bool = False
    days_until_period_end: int = Field(default=0, ge=0)

    # From the attendance anomaly service
    anomaly_score_last_30_days: float | None = None


class RiskFactor(BaseModel):
    code: str
    label: str
    severity: Severity
    value: str | None = None


class ApprovalAnalysisResponse(BaseModel):
    # 'model_version' would collide with pydantic's protected model_ namespace.
    model_config = ConfigDict(protected_namespaces=())

    request_id: int
    request_type: RequestType
    employee_id: int
    employee_name: str = ""

    recommendation: AiDecision
    confidence: float = Field(ge=0.0, le=1.0)
    risk_score: float = Field(ge=0.0, le=1.0)

    risk_factors: list[RiskFactor] = Field(default_factory=list)
    explanation: str = ""

    team_coverage_after: float = Field(default=1.0, ge=0.0, le=1.0)

    model_version: str | None = None
    features_used: dict = Field(default_factory=dict)


class ApprovalTrainResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    success: bool
    message: str
    records_used: int
    model_version: str
    accuracy: float | None = None
    training_duration_seconds: float


class ApprovalHealthResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    success: bool = True
    status: str = "ok"
    model_loaded: bool = False
    model_version: str | None = None
    fallback_active: bool = True
