"""FastAPI route tests using the TestClient."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def test_health_returns_200(client: TestClient):
    response = client.get("/api/ml/health")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "version" in body


def test_employee_endpoint_rejects_bad_id(client: TestClient):
    response = client.get("/api/ml/anomalies/employee/0")
    assert response.status_code == 400


def test_dashboard_endpoint_returns_envelope(client: TestClient):
    # Without backend connectivity the route should still return a valid
    # AnomalyDashboardResponse envelope (empty) rather than 500.
    response = client.get("/api/ml/anomalies/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "total_anomalies" in body
    assert isinstance(body["anomalies"], list)


def test_manager_and_rh_endpoints_return_dashboard_envelope(client: TestClient):
    for path in ("/api/ml/anomalies/manager", "/api/ml/anomalies/rh"):
        response = client.get(path)
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "groupedBySeverity" in body
        assert "groupedByCategory" in body


def test_anomaly_action_endpoints_are_stable(client: TestClient):
    response = client.post("/api/ml/anomalies/24:2026-05-31:RAPID_SESSION/ignore")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["action"] == "IGNORE"

    response = client.post("/api/ml/anomalies/24:2026-05-31:RAPID_SESSION/contact")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["action"] == "CONTACT_EMPLOYEE"
