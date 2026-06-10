"""Forecast API and service tests."""
from __future__ import annotations

import base64
import json
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.api.v1.routes import forecast_routes
from app.inference.forecast_data import (
    EmployeeProfile,
    ForecastDataset,
    ForecastEvent,
    ForecastDataFilters,
    PresenceEvent,
)
from app.inference.forecast_service import ForecastAccessContext, ForecastQuery, ForecastService
from app.main import app
from app.models.forecast_model import AbsenceLeaveForecastModel
from app.schemas.forecast_schemas import (
    ForecastDashboardResponse,
    ForecastDataQuality,
    ForecastSummary,
)


def _mint(roles: list[str], *, user_id: int = 7, company_id: int = 42) -> str:
    def b64(obj) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    return (
        f"{b64({'alg': 'HS256', 'typ': 'JWT'})}."
        f"{b64({'sub': 'u', 'roles': roles, 'userId': user_id, 'entrepriseId': company_id})}."
        "sig"
    )


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


class _CapturingForecastService:
    def __init__(self) -> None:
        self.query: ForecastQuery | None = None
        self.context: ForecastAccessContext | None = None

    def health(self):
        from app.schemas.forecast_schemas import ForecastHealthResponse

        return ForecastHealthResponse(success=True, status="ok", model_loaded=False, metrics={})

    def build_dashboard(self, query: ForecastQuery, context: ForecastAccessContext):
        self.query = query
        self.context = context
        return ForecastDashboardResponse(
            success=True,
            period=query.period,
            generated_at=datetime.now(timezone.utc),
            summary=ForecastSummary(),
            series=[],
            teams=[],
            explanations=[],
            data_quality=ForecastDataQuality(),
        )


@pytest.fixture()
def capturing_service():
    service = _CapturingForecastService()
    app.dependency_overrides[forecast_routes.get_forecast_service] = lambda: service
    try:
        yield service
    finally:
        app.dependency_overrides.pop(forecast_routes.get_forecast_service, None)


def test_forecast_health_returns_200(client: TestClient):
    response = client.get("/api/ml/forecast/health")

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_forecast_preflight_accepts_custom_headers(client: TestClient):
    response = client.options(
        "/api/ml/forecast/dashboard?period=next_30_days",
        headers={
            "Origin": "http://localhost:4200",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": (
                "authorization,x-user-id,x-user-role,x-tenant-id,"
                "x-entreprise-id,x-role,x-dashboard-scope"
            ),
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:4200"
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "x-user-id" in allowed_headers
    assert "x-dashboard-scope" in allowed_headers


def test_forecast_dashboard_requires_token(client: TestClient, capturing_service):
    response = client.get("/api/ml/forecast/dashboard")

    assert response.status_code == 401


def test_forecast_dashboard_rejects_employee_role(client: TestClient, capturing_service):
    response = client.get(
        "/api/ml/forecast/dashboard",
        headers={"Authorization": f"Bearer {_mint(['ROLE_EMPLOYEE'])}"},
    )

    assert response.status_code == 403


def test_forecast_dashboard_accepts_rh_and_scopes_company(client: TestClient, capturing_service):
    response = client.get(
        "/api/ml/forecast/dashboard?companyId=99&period=next_week",
        headers={"Authorization": f"Bearer {_mint(['ROLE_RH'], company_id=42)}"},
    )

    assert response.status_code == 200
    assert capturing_service.query is not None
    assert capturing_service.context is not None
    assert capturing_service.query.company_id == 42
    assert capturing_service.context.role == "RH"


def test_forecast_dashboard_manager_context_sets_manager_scope(client: TestClient, capturing_service):
    response = client.get(
        "/api/ml/forecast/dashboard",
        headers={"Authorization": f"Bearer {_mint(['ROLE_MANAGER'], user_id=12, company_id=42)}"},
    )

    assert response.status_code == 200
    assert capturing_service.context is not None
    assert capturing_service.context.role == "MANAGER"
    assert capturing_service.context.manager_id == 12


class _FakeForecastRepository:
    def __init__(self) -> None:
        self.filters: ForecastDataFilters | None = None

    def load_dataset(self, *, history_start: date, forecast_end: date, filters: ForecastDataFilters):
        self.filters = filters
        start = date(2026, 6, 10)
        presence_events = [
            PresenceEvent(
                employee_id=1,
                event_date=start - timedelta(days=offset),
                company_id=42,
                team_id=5,
                daily_status="PRESENT",
            )
            for offset in range(1, 10)
        ]
        return ForecastDataset(
            employees=[
                EmployeeProfile(
                    employee_id=1,
                    employee_name="Amina RH",
                    company_id=42,
                    department_id=3,
                    department_name="People",
                    team_id=5,
                    team_name="Ops",
                    manager_id=12,
                ),
                EmployeeProfile(
                    employee_id=2,
                    employee_name="Karim Ops",
                    company_id=42,
                    department_id=3,
                    department_name="People",
                    team_id=5,
                    team_name="Ops",
                    manager_id=12,
                ),
            ],
            leave_events=[
                ForecastEvent("LEAVE", 1, date(2026, 6, 3), date(2026, 6, 3), "APPROUVE", company_id=42, team_id=5),
                ForecastEvent("LEAVE", 2, date(2026, 6, 12), date(2026, 6, 12), "EN_ATTENTE", company_id=42, team_id=5),
            ],
            absence_events=[
                ForecastEvent("ABSENCE", 2, date(2026, 6, 4), date(2026, 6, 4), "APPROUVE", company_id=42, team_id=5),
            ],
            presence_events=presence_events,
            holidays={date(2026, 6, 16)},
            leave_balances={1: 12.0, 2: 8.0},
            source_ok={"organisation": True, "rh": True, "presence": True},
        )


def test_forecast_service_uses_real_dataset_and_fallback_without_model():
    repository = _FakeForecastRepository()
    service = ForecastService(repository=repository, model=AbsenceLeaveForecastModel())

    response = service.build_dashboard(
        ForecastQuery(start_date=date(2026, 6, 10), end_date=date(2026, 6, 16), company_id=42),
        ForecastAccessContext(role="RH", user_id=1, company_id=42),
    )

    assert repository.filters is not None
    assert repository.filters.company_id == 42
    assert response.success is True
    assert response.data_quality.fallback_used is True
    assert response.data_quality.historical_days >= 7
    assert response.summary.predicted_leaves > 0
    assert response.teams[0].team_name == "Ops"
