"""Forecast HTTP routes for absences and leave planning."""
from __future__ import annotations

from dataclasses import replace
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.inference.backend_client import decode_jwt_claims, decode_jwt_roles
from app.inference.forecast_service import (
    ForecastAccessContext,
    ForecastQuery,
    ForecastService,
    get_forecast_service,
)
from app.observability.tracing import traced_ml_endpoint
from app.schemas.anomaly_schemas import TrainResponse
from app.schemas.forecast_schemas import (
    ForecastDashboardResponse,
    ForecastEmployeeRiskResponse,
    ForecastHealthResponse,
    ForecastListResponse,
    ForecastTeamPresenceResponse,
    ForecastWorkloadResponse,
)

router = APIRouter(prefix="/api/ml/forecast", tags=["absence-leave-forecast"])

_ADMIN_ROLES = {"ADMIN", "ROLE_ADMIN", "SUPER_ADMIN", "ROLE_SUPER_ADMIN"}
_RH_ROLES = {"RH", "ROLE_RH", "HR", "ROLE_HR"}
_MANAGER_ROLES = {"MANAGER", "ROLE_MANAGER", "RESPONSABLE", "ROLE_RESPONSABLE"}
_EMPLOYEE_ROLES = {"EMPLOYEE", "ROLE_EMPLOYEE", "SALARIE", "ROLE_SALARIE"}


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return authorization.strip() or None


def _claim_int(claims: dict[str, Any], *names: str) -> int | None:
    for name in names:
        value = claims.get(name)
        if value is None:
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def _normalize_header_role(role: str | None) -> list[str]:
    if not role:
        return []
    parts = [part.strip().upper() for part in role.replace(";", ",").split(",")]
    return [part for part in parts if part]


def _effective_role(roles: list[str]) -> str | None:
    role_set = {role.strip().upper() for role in roles if role and role.strip()}
    if role_set & _ADMIN_ROLES:
        return "ADMIN"
    if role_set & _RH_ROLES:
        return "RH"
    if role_set & _MANAGER_ROLES:
        return "MANAGER"
    if role_set & _EMPLOYEE_ROLES:
        return "EMPLOYEE"
    return None


def _authorize(
    authorization: str | None,
    *,
    x_user_id: int | None,
    x_tenant_id: int | None,
    x_entreprise_id: int | None,
    x_user_role: str | None,
) -> ForecastAccessContext:
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_bearer_token")

    claims = decode_jwt_claims(token)
    roles = decode_jwt_roles(token) or _normalize_header_role(x_user_role)
    role = _effective_role(roles)
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forecast_role_required")
    if role == "EMPLOYEE":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forecast_role_required")

    user_id = x_user_id or _claim_int(claims, "userId", "user_id", "id")
    company_id = (
        x_tenant_id
        if x_tenant_id is not None
        else x_entreprise_id
        if x_entreprise_id is not None
        else _claim_int(claims, "entrepriseId", "entreprise_id", "tenantId", "tenant_id")
    )
    return ForecastAccessContext(
        role=role,
        user_id=user_id,
        company_id=company_id,
        manager_id=user_id if role == "MANAGER" else None,
    )


def _query(
    *,
    period: str,
    start_date: date | None,
    end_date: date | None,
    company_id: int | None,
    department_id: int | None,
    team_id: int | None,
    employee_id: int | None,
    context: ForecastAccessContext,
) -> ForecastQuery:
    query = ForecastQuery(
        period=period,
        start_date=start_date,
        end_date=end_date,
        company_id=company_id,
        department_id=department_id,
        team_id=team_id,
        employee_id=employee_id,
    )
    if context.role in {"RH", "MANAGER"} and context.company_id is not None:
        query = replace(query, company_id=context.company_id)
    elif context.role == "ADMIN" and query.company_id is None:
        query = replace(query, company_id=context.company_id)
    return query


def _context(
    authorization: str | None,
    x_user_id: int | None,
    x_tenant_id: int | None,
    x_entreprise_id: int | None,
    x_user_role: str | None,
) -> ForecastAccessContext:
    return _authorize(
        authorization,
        x_user_id=x_user_id,
        x_tenant_id=x_tenant_id,
        x_entreprise_id=x_entreprise_id,
        x_user_role=x_user_role,
    )


def _run(handler):
    try:
        return handler()
    except ValueError as exc:
        if str(exc) == "invalid_date_range":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_date_range") from exc
        raise


@router.get("/health", response_model=ForecastHealthResponse)
def forecast_health(service: ForecastService = Depends(get_forecast_service)) -> ForecastHealthResponse:
    return service.health()


@router.get("/dashboard", response_model=ForecastDashboardResponse)
@traced_ml_endpoint("/api/ml/forecast/dashboard")
def forecast_dashboard(
    period: str = Query(default="next_30_days"),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    company_id: int | None = Query(default=None, alias="companyId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    service: ForecastService = Depends(get_forecast_service),
) -> ForecastDashboardResponse:
    context = _context(authorization, x_user_id, x_tenant_id, x_entreprise_id, x_user_role)
    query = _query(
        period=period,
        start_date=start_date,
        end_date=end_date,
        company_id=company_id,
        department_id=department_id,
        team_id=team_id,
        employee_id=employee_id,
        context=context,
    )
    return _run(lambda: service.build_dashboard(query, context))


@router.get("/leaves", response_model=ForecastListResponse)
@traced_ml_endpoint("/api/ml/forecast/leaves")
def forecast_leaves(
    period: str = Query(default="next_30_days"),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    company_id: int | None = Query(default=None, alias="companyId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    service: ForecastService = Depends(get_forecast_service),
) -> ForecastListResponse:
    context = _context(authorization, x_user_id, x_tenant_id, x_entreprise_id, x_user_role)
    query = _query(
        period=period,
        start_date=start_date,
        end_date=end_date,
        company_id=company_id,
        department_id=department_id,
        team_id=team_id,
        employee_id=employee_id,
        context=context,
    )
    return _run(lambda: service.build_list("leaves", query, context))


@router.get("/absences", response_model=ForecastListResponse)
@traced_ml_endpoint("/api/ml/forecast/absences")
def forecast_absences(
    period: str = Query(default="next_30_days"),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    company_id: int | None = Query(default=None, alias="companyId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    service: ForecastService = Depends(get_forecast_service),
) -> ForecastListResponse:
    context = _context(authorization, x_user_id, x_tenant_id, x_entreprise_id, x_user_role)
    query = _query(
        period=period,
        start_date=start_date,
        end_date=end_date,
        company_id=company_id,
        department_id=department_id,
        team_id=team_id,
        employee_id=employee_id,
        context=context,
    )
    return _run(lambda: service.build_list("absences", query, context))


@router.get("/team-presence", response_model=ForecastTeamPresenceResponse)
@traced_ml_endpoint("/api/ml/forecast/team-presence")
def forecast_team_presence(
    period: str = Query(default="next_30_days"),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    company_id: int | None = Query(default=None, alias="companyId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    service: ForecastService = Depends(get_forecast_service),
) -> ForecastTeamPresenceResponse:
    context = _context(authorization, x_user_id, x_tenant_id, x_entreprise_id, x_user_role)
    query = _query(
        period=period,
        start_date=start_date,
        end_date=end_date,
        company_id=company_id,
        department_id=department_id,
        team_id=team_id,
        employee_id=employee_id,
        context=context,
    )
    return _run(lambda: service.team_presence(query, context))


@router.get("/workload", response_model=ForecastWorkloadResponse)
@traced_ml_endpoint("/api/ml/forecast/workload")
def forecast_workload(
    period: str = Query(default="next_30_days"),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    company_id: int | None = Query(default=None, alias="companyId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    service: ForecastService = Depends(get_forecast_service),
) -> ForecastWorkloadResponse:
    context = _context(authorization, x_user_id, x_tenant_id, x_entreprise_id, x_user_role)
    query = _query(
        period=period,
        start_date=start_date,
        end_date=end_date,
        company_id=company_id,
        department_id=department_id,
        team_id=team_id,
        employee_id=employee_id,
        context=context,
    )
    return _run(lambda: service.workload(query, context))


@router.get("/risk-by-employee", response_model=ForecastEmployeeRiskResponse)
@traced_ml_endpoint("/api/ml/forecast/risk-by-employee")
def forecast_risk_by_employee(
    period: str = Query(default="next_30_days"),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    company_id: int | None = Query(default=None, alias="companyId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    service: ForecastService = Depends(get_forecast_service),
) -> ForecastEmployeeRiskResponse:
    context = _context(authorization, x_user_id, x_tenant_id, x_entreprise_id, x_user_role)
    query = _query(
        period=period,
        start_date=start_date,
        end_date=end_date,
        company_id=company_id,
        department_id=department_id,
        team_id=team_id,
        employee_id=employee_id,
        context=context,
    )
    return _run(lambda: service.employee_risks(query, context))


@router.post("/train", response_model=TrainResponse)
def train_forecast_model(
    days: int = Query(default=730, ge=120, le=3650),
    company_id: int | None = Query(default=None, alias="companyId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    min_records: int | None = Query(default=None, alias="minRecords", ge=10),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    service: ForecastService = Depends(get_forecast_service),
) -> TrainResponse:
    context = _context(authorization, x_user_id, x_tenant_id, x_entreprise_id, x_user_role)
    if context.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_role_required")
    effective_company_id = company_id if company_id is not None else context.company_id
    try:
        from app.training.pipelines.train_absence_leave_forecast import train_pipeline

        result = train_pipeline(
            days=days,
            company_id=effective_company_id,
            department_id=department_id,
            team_id=team_id,
            min_records=min_records,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"training_failed: {exc}") from exc
    service.reload_model()
    return TrainResponse(
        success=True,
        message=f"Forecast model {result.model_version} trained on {result.records_used} real rows.",
        records_used=result.records_used,
        model_version=result.model_version,
        training_duration_seconds=result.training_duration_seconds,
        contamination_observed=None,
    )
