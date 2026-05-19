"""Pydantic schemas for ML anomaly endpoints. Stable contract — consumed by ai-service tools and Angular."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AnomalyRecord(BaseModel):
    employee_id: int
    employee_name: str
    date: str
    score: float = Field(ge=0.0, le=1.0)
    risk: RiskLevel
    reasons: list[str] = Field(default_factory=list)
    explanation: str
    features: dict[str, Any] = Field(default_factory=dict)


class AnomalyDashboardResponse(BaseModel):
    success: bool = True
    # True when records come from the synthetic parquet because the Spring
    # backend was unreachable -- the UI surfaces a discreet banner.
    is_demo: bool = False
    generated_at: datetime
    total_anomalies: int = 0
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    anomalies: list[AnomalyRecord] = Field(default_factory=list)


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
