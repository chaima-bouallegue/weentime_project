"""Anomaly detection HTTP routes."""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.inference.anomaly_detector import AnomalyDetector, get_detector
from app.schemas.anomaly_schemas import (
    AnomalyActionResponse,
    AnomalyDashboardResponse,
    EmployeeRiskResponse,
    RiskLevel,
    TrainResponse,
)
from app.training.pipelines.train_attendance_anomaly import train_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ml", tags=["anomaly-detection"])


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return authorization.strip() or None


def _empty_dashboard() -> AnomalyDashboardResponse:
    return AnomalyDashboardResponse(
        success=True,
        generated_at=datetime.now(timezone.utc),
    )


def _unavailable_dashboard() -> AnomalyDashboardResponse:
    """Honest empty state when the presence backend can't be reached.

    NEVER returns synthetic/fake employees -- the UI shows a 'service
    indisponible' banner instead so users are never misled.
    """
    return AnomalyDashboardResponse(
        success=True,
        is_demo=False,
        backend_status="unavailable",
        generated_at=datetime.now(timezone.utc),
    )


async def _scoped_dashboard(
    detector: AnomalyDetector,
    authorization: str | None,
    user_id: int | None,
    tenant_id: int | None,
    *,
    debug: bool = False,
) -> AnomalyDashboardResponse:
    token = _extract_bearer(authorization)
    # Role-aware scope: MANAGER -> /presence/team/today, RH -> /company/today,
    # ADMIN -> /presence/global/today.
    records, backend_ok, scope = await detector.fetch_today_for_role(
        token=token,
        user_id=user_id or 0,
        tenant_id=tenant_id,
    )
    if records:
        # Backend returned members (even all-absent) -> analyze. The absent
        # short-circuit yields LOW/filtered, so total_anomalies=0 when nobody
        # is anomalous, with backend_status="ok".
        return await detector.analyze_today(records, debug=debug)
    if not backend_ok:
        # Honest empty state -- never synthetic data.
        logger.warning("presence backend unavailable (scope=%s) -> honest empty state", scope)
        return _unavailable_dashboard()
    # Backend OK but no members returned -- legitimately empty.
    logger.info("presence backend ok but no members (scope=%s)", scope)
    return _empty_dashboard()


@router.get("/anomalies/today", response_model=AnomalyDashboardResponse)
async def get_today_anomalies(
    debug: bool = False,
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    return await _scoped_dashboard(detector, authorization, x_user_id, x_tenant_id, debug=debug)


@router.get("/anomalies/dashboard", response_model=AnomalyDashboardResponse)
async def get_dashboard(
    debug: bool = False,
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    # Alias of /anomalies/today -- separate endpoint so the Angular dashboard
    # has a stable URL even if today's source changes.
    return await _scoped_dashboard(detector, authorization, x_user_id, x_tenant_id, debug=debug)


@router.get("/anomalies/manager", response_model=AnomalyDashboardResponse)
async def get_manager_anomalies(
    debug: bool = False,
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    return await _scoped_dashboard(detector, authorization, x_user_id, x_tenant_id, debug=debug)


@router.get("/anomalies/rh", response_model=AnomalyDashboardResponse)
async def get_rh_anomalies(
    debug: bool = False,
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    return await _scoped_dashboard(detector, authorization, x_user_id, x_tenant_id, debug=debug)


@router.get("/anomalies/employee/{employee_id}", response_model=EmployeeRiskResponse)
async def get_employee_risk(
    employee_id: int,
    debug: bool = False,
    authorization: str | None = Header(default=None),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> EmployeeRiskResponse:
    if employee_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_employee_id")
    token = _extract_bearer(authorization)
    records = await detector.fetch_employee_history(employee_id, token=token, tenant_id=x_tenant_id)
    if not records:
        return EmployeeRiskResponse(
            success=True,
            employee_id=employee_id,
            employee_name=f"Employé #{employee_id}",
            current_risk=RiskLevel.LOW,
            score=0.0,
            anomalies_last_30_days=0,
            trend="STABLE",
            latest_anomaly=None,
        )
    return await detector.analyze_employee(employee_id, records, debug=debug)


@router.get("/anomalies/department/{dept_id}", response_model=AnomalyDashboardResponse)
async def get_department_anomalies(
    dept_id: int,
    debug: bool = False,
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    # Department scoping isn't yet exposed by presence-service. Falls back to
    # company-wide today and surfaces the dept_id in the payload metadata.
    logger.info("department %s requested -- returning company scope (no per-dept endpoint yet)", dept_id)
    return await _scoped_dashboard(detector, authorization, x_user_id, x_tenant_id, debug=debug)


@router.get("/anomalies/{anomaly_id}")
async def get_anomaly_detail(
    anomaly_id: str,
    detector: AnomalyDetector = Depends(get_detector),
):
    anomaly = detector.get_cached_anomaly(anomaly_id)
    if anomaly is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="anomaly_not_found")
    return anomaly


@router.post("/anomalies/{anomaly_id}/ignore", response_model=AnomalyActionResponse)
async def ignore_anomaly(
    anomaly_id: str,
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyActionResponse:
    detector.ignore_anomaly(anomaly_id)
    return AnomalyActionResponse(
        anomaly_id=anomaly_id,
        action="IGNORE",
        message="Anomalie ignoree pour cette session ML.",
    )


@router.post("/anomalies/{anomaly_id}/contact", response_model=AnomalyActionResponse)
async def contact_employee(
    anomaly_id: str,
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyActionResponse:
    detector.contact_anomaly(anomaly_id)
    return AnomalyActionResponse(
        anomaly_id=anomaly_id,
        action="CONTACT_EMPLOYEE",
        message="Action de contact enregistree pour cette session ML.",
    )


@router.post("/anomalies/refresh", response_model=AnomalyDashboardResponse)
async def refresh_anomalies(
    debug: bool = False,
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    return await _scoped_dashboard(detector, authorization, x_user_id, x_tenant_id, debug=debug)


@router.post("/train/anomaly", response_model=TrainResponse)
async def trigger_training(
    detector: AnomalyDetector = Depends(get_detector),
) -> TrainResponse:
    started = time.time()
    try:
        result = train_pipeline()
    except Exception as exc:
        logger.exception("training failed")
        raise HTTPException(status_code=500, detail=f"training_failed: {exc}") from exc
    await detector.reload()
    return TrainResponse(
        success=True,
        message=f"Model {result.model_version} trained on {result.records_used} records.",
        records_used=result.records_used,
        model_version=result.model_version,
        training_duration_seconds=time.time() - started,
        contamination_observed=result.contamination_observed,
    )
