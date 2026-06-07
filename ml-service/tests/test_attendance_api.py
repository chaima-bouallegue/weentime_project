"""FastAPI route tests using the TestClient."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.v1.routes import anomaly_routes
from app.inference.anomaly_detector import AnomalyDetector
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


def test_dashboard_endpoint_requires_token(client: TestClient):
    response = client.get("/api/ml/anomalies/dashboard")
    assert response.status_code == 401


def test_manager_and_rh_endpoints_require_token(client: TestClient):
    for path in ("/api/ml/anomalies/manager", "/api/ml/anomalies/rh"):
        response = client.get(path)
        assert response.status_code == 401


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


def _mint(roles: list[str]) -> str:
    import base64
    import json

    def b64(obj) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    return f"{b64({'alg': 'HS256', 'typ': 'JWT'})}.{b64({'sub': 'u', 'roles': roles})}.sig"


class _RapidSessionBackend:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def get(self, path, *, token=None, user_id=0, role="RH", tenant_id=None, params=None):
        self.calls.append(path)
        return {
            "success": True,
            "data": {
                "items": [
                    {
                        "utilisateurId": 77,
                        "nomComplet": "Rapid User",
                        "date": "2026-05-31",
                        "status": "PRESENT",
                        "heureEntree": "09:00",
                        "heureSortie": "09:10",
                        "workedMinutes": 10,
                        "scheduledWorkday": True,
                    }
                ]
            },
            "error": None,
        }


class _RawStatusRangeBackend(_RapidSessionBackend):
    async def get(self, path, *, token=None, user_id=0, role="RH", tenant_id=None, params=None):
        self.calls.append(path)
        return {
            "2026-05-31": {
                "scope": "GLOBAL",
                "members": [
                    {
                        "utilisateurId": 77,
                        "nomComplet": "Rapid User",
                        "date": "2026-05-31",
                        "status": "PRESENT",
                        "heureEntree": "09:00",
                        "heureSortie": "09:10",
                        "workedMinutes": 10,
                        "scheduledWorkday": True,
                    }
                ],
            }
        }


@pytest.fixture()
def rapid_detector():
    backend = _RapidSessionBackend()
    detector = AnomalyDetector(backend=backend)
    app.dependency_overrides[anomaly_routes.get_detector] = lambda: detector
    try:
        yield detector, backend
    finally:
        app.dependency_overrides.pop(anomaly_routes.get_detector, None)


def test_raw_spring_status_range_payload_is_parsed(client: TestClient):
    backend = _RawStatusRangeBackend()
    detector = AnomalyDetector(backend=backend)
    app.dependency_overrides[anomaly_routes.get_detector] = lambda: detector
    try:
        response = client.get(
            "/api/ml/anomalies/dashboard?scope=ADMIN&fromDate=2026-05-31&toDate=2026-05-31",
            headers={"Authorization": f"Bearer {_mint(['ROLE_ADMIN'])}"},
        )
    finally:
        app.dependency_overrides.pop(anomaly_routes.get_detector, None)

    assert response.status_code == 200
    body = response.json()
    assert body["rawRecordsCount"] == 1
    assert body["parsedRecordsCount"] == 1
    assert body["total_anomalies"] >= 1


def test_manager_endpoint_returns_real_anomaly_from_team_payload(client: TestClient, rapid_detector):
    _, backend = rapid_detector
    response = client.get(
        "/api/ml/anomalies/manager?debug=true",
        headers={"Authorization": f"Bearer {_mint(['ROLE_MANAGER'])}", "X-Entreprise-Id": "42"},
    )

    assert response.status_code == 200
    body = response.json()
    assert backend.calls == ["presences/pointages/team/status-range"]
    assert body["sourceEndpoint"] == "presences/pointages/team/status-range"
    assert body["rawRecordsCount"] == 1
    assert body["parsedRecordsCount"] == 1
    assert body["total_anomalies"] >= 1
    assert body["anomalies"][0]["category"] == "RAPID_SESSION"
    assert body["byRisk"]["HIGH"] >= 1
    assert body["byType"]["RAPID_SESSION"] >= 1
    assert body["byDay"]["2026-05-31"] >= 1


def test_rh_endpoint_returns_company_anomalies(client: TestClient, rapid_detector):
    _, backend = rapid_detector
    response = client.get(
        "/api/ml/anomalies/rh?debug=true",
        headers={"Authorization": f"Bearer {_mint(['ROLE_RH'])}", "X-Entreprise-Id": "42"},
    )

    assert response.status_code == 200
    body = response.json()
    assert backend.calls == ["presences/pointages/company/status-range"]
    assert body["sourceEndpoint"] == "presences/pointages/company/status-range"
    assert body["total_anomalies"] >= 1


def test_scope_routes_reject_wrong_roles(client: TestClient, rapid_detector):
    manager_headers = {"Authorization": f"Bearer {_mint(['ROLE_MANAGER'])}"}
    employee_headers = {"Authorization": f"Bearer {_mint(['ROLE_EMPLOYEE'])}"}

    assert client.get("/api/ml/anomalies/rh", headers=manager_headers).status_code == 403
    assert client.get(
        "/api/ml/anomalies/dashboard?scope=ADMIN",
        headers=employee_headers,
    ).status_code == 403
    assert client.get(
        "/api/ml/anomalies/dashboard?scope=MANAGER",
        headers=employee_headers,
    ).status_code == 403


def test_admin_dashboard_scope_returns_global_anomalies(client: TestClient, rapid_detector):
    _, backend = rapid_detector
    response = client.get(
        "/api/ml/anomalies/dashboard?scope=ADMIN&debug=true",
        headers={"Authorization": f"Bearer {_mint(['ROLE_ADMIN'])}", "X-Entreprise-Id": "42"},
    )

    assert response.status_code == 200
    body = response.json()
    assert backend.calls == ["presences/pointages/enterprise/status-range"]
    assert body["sourceEndpoint"] == "presences/pointages/enterprise/status-range"
    assert body["total_anomalies"] >= 1


def test_admin_dashboard_without_tenant_uses_global_status_range(client: TestClient, rapid_detector):
    _, backend = rapid_detector
    response = client.get(
        "/api/ml/anomalies/dashboard?scope=ADMIN&fromDate=2026-05-31&toDate=2026-05-31",
        headers={"Authorization": f"Bearer {_mint(['ROLE_ADMIN'])}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert backend.calls == ["presences/pointages/global/status-range"]
    assert body["sourceEndpoint"] == "presences/pointages/global/status-range"
    assert body["total_anomalies"] >= 1


def test_admin_anomaly_dashboard_requires_admin_role(client: TestClient, rapid_detector):
    response = client.get("/api/ml/anomalies/admin/dashboard")
    assert response.status_code == 401

    response = client.get(
        "/api/ml/anomalies/admin/dashboard",
        headers={"Authorization": f"Bearer {_mint(['ROLE_MANAGER'])}"},
    )
    assert response.status_code == 403


def test_admin_anomaly_dashboard_returns_real_aggregate(client: TestClient, rapid_detector, tmp_path, monkeypatch):
    _, backend = rapid_detector
    monkeypatch.setattr(anomaly_routes, "_status_store_path", lambda: tmp_path / "statuses.json")

    response = client.get(
        "/api/ml/anomalies/admin/dashboard?fromDate=2026-05-31&toDate=2026-05-31&entrepriseId=42",
        headers={"Authorization": f"Bearer {_mint(['ROLE_ADMIN'])}", "X-Entreprise-Id": "42"},
    )

    assert response.status_code == 200
    body = response.json()
    assert backend.calls == ["presences/pointages/enterprise/status-range"]
    assert body["success"] is True
    assert body["sourceEndpoint"] == "presences/pointages/enterprise/status-range"
    assert body["summary"]["totalAnomalies"] >= 1
    assert body["summary"]["employeesConcerned"] == 1
    assert body["topAnomalies"][0]["category"] == "RAPID_SESSION"
    assert body["topAnomalies"][0]["categoryLabel"] == "Session trop courte"


def test_admin_anomaly_status_update_is_loaded_by_list(client: TestClient, rapid_detector, tmp_path, monkeypatch):
    monkeypatch.setattr(anomaly_routes, "_status_store_path", lambda: tmp_path / "statuses.json")
    headers = {"Authorization": f"Bearer {_mint(['ROLE_ADMIN'])}", "X-Entreprise-Id": "42"}

    response = client.get("/api/ml/anomalies/admin?entrepriseId=42", headers=headers)
    assert response.status_code == 200
    anomaly_id = response.json()["items"][0]["id"]

    response = client.patch(
        f"/api/ml/anomalies/admin/{anomaly_id}/status",
        headers=headers,
        json={"status": "SUSPICIOUS", "comment": "Verification requise"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "SUSPICIOUS"

    response = client.get("/api/ml/anomalies/admin?entrepriseId=42&status=SUSPICIOUS", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == anomaly_id
    assert body["items"][0]["status"] == "SUSPICIOUS"
    assert body["items"][0]["statusComment"] == "Verification requise"


def test_required_list_and_by_employee_aliases_return_real_items(client: TestClient, rapid_detector):
    headers = {"Authorization": f"Bearer {_mint(['ROLE_ADMIN'])}", "X-Entreprise-Id": "42"}

    response = client.get(
        "/api/ml/anomalies/list?fromDate=2026-05-31&toDate=2026-05-31",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["score"] > 0
    assert response.json()["items"][0]["explanation"]
    assert "mlScore" in response.json()["items"][0]
    assert "mlPrediction" in response.json()["items"][0]
    assert response.json()["items"][0]["detectionSource"] == "RULE"

    response = client.get(
        "/api/ml/anomalies/by-employee?employeeId=77&fromDate=2026-05-31&toDate=2026-05-31",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["items"][0]["employeeId"] == 77
