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
