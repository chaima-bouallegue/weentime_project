"""Schema contract test for the ai-service <-> ml-service handshake.

We don't import the ai-service code here (different venv); instead we assert
that the schemas the ai-service ``anomaly_tools`` consumes match what the
ml-service emits.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.anomaly_schemas import (
    AnomalyDashboardResponse,
    AnomalyRecord,
    EmployeeRiskResponse,
    RiskLevel,
)


def test_anomaly_record_serialization():
    record = AnomalyRecord(
        employee_id=1001,
        employee_name="Test Employee",
        date="2026-05-19",
        score=0.82,
        risk=RiskLevel.HIGH,
        reasons=["Test reason"],
        explanation="Test explanation",
        features={"arrival_hour": 9.0},
    )
    payload = record.model_dump()
    assert payload["employee_id"] == 1001
    assert payload["risk"] == "HIGH"
    assert "reasons" in payload


def test_dashboard_keys_match_ai_tool_expectations():
    response = AnomalyDashboardResponse(generated_at=datetime.now(timezone.utc))
    payload = response.model_dump()
    expected = {
        "success", "generated_at", "total_anomalies",
        "critical", "high", "medium", "low", "anomalies",
    }
    assert expected.issubset(payload.keys())


def test_employee_risk_envelope():
    response = EmployeeRiskResponse(
        employee_id=42,
        employee_name="Test",
        current_risk=RiskLevel.LOW,
        score=0.1,
        anomalies_last_30_days=0,
        trend="STABLE",
    )
    payload = response.model_dump()
    assert payload["current_risk"] == "LOW"
    assert payload["trend"] == "STABLE"
