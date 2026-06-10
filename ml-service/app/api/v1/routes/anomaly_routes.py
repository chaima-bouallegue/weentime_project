"""Anomaly detection HTTP routes."""
from __future__ import annotations

import csv
import io
import json
import logging
import math
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status

from app.core.config import get_settings
from app.features.attendance_features import AttendanceRecord
from app.inference.anomaly_detector import (
    AnomalyDetector,
    AttendanceFetchResult,
    ParsedPresencePayload,
    _team_status_to_parse_result,
    get_detector,
)
from app.inference.backend_client import decode_jwt_roles
from app.observability.tracing import traced_ml_endpoint
from app.schemas.anomaly_schemas import (
    AnomalyActionResponse,
    AnomalyStatus,
    AdminAnomalyDashboardResponse,
    AdminAnomalyItem,
    AdminAnomalyListResponse,
    AdminAnomalySummary,
    AdminDayBucket,
    AdminRiskBucket,
    AdminStatusUpdateRequest,
    AdminStatusUpdateResponse,
    AdminTopEmployee,
    AdminTypeBucket,
    AnomalyDashboardResponse,
    AnomalyRecord,
    EmployeeRiskResponse,
    RiskLevel,
    TrainResponse,
)
from app.training.pipelines.train_attendance_anomaly import train_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ml", tags=["anomaly-detection"])


def _list_trace_endpoint(arguments: dict[str, Any]) -> str:
    request = arguments.get("request")
    path = getattr(getattr(request, "url", None), "path", "")
    if path == "/api/ml/anomalies/by-employee":
        return path
    return "/api/ml/anomalies/list"


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
    scope_override: str | None = None,
    endpoint_name: str = "dashboard",
    user_role: str | None = None,
) -> AnomalyDashboardResponse:
    token = _extract_bearer(authorization)
    jwt_roles = decode_jwt_roles(token)
    logger.info(
        "anomaly endpoint=%s user_role=%s jwt_roles=%s user_id=%s entrepriseId=%s scope_override=%s",
        endpoint_name,
        user_role,
        jwt_roles,
        user_id,
        tenant_id,
        scope_override,
    )
    fetch = await detector.fetch_today_for_scope(
        token=token,
        user_id=user_id or 0,
        tenant_id=tenant_id,
        scope_override=scope_override,
    )
    logger.info(
        "anomaly endpoint=%s source=%s raw_records=%d parsed_records=%d skipped_records=%d",
        endpoint_name,
        fetch.endpoint,
        fetch.raw_records_count,
        fetch.parsed_records_count,
        len(fetch.skipped_records),
    )
    if fetch.records:
        # Backend returned members (even all-absent) -> analyze. The absent
        # short-circuit yields LOW/filtered, so total_anomalies=0 when nobody
        # is anomalous, with backend_status="ok".
        dashboard = await detector.analyze_today(fetch.records, debug=debug)
        _attach_source_debug(dashboard, fetch, endpoint_name, tenant_id, debug=debug)
        return dashboard
    if not fetch.backend_ok:
        # Honest empty state -- never synthetic data.
        logger.warning("presence backend unavailable (scope=%s) -> honest empty state", fetch.scope)
        dashboard = _unavailable_dashboard()
        dashboard.zero_reason = "presence_backend_unavailable"
        _attach_source_debug(dashboard, fetch, endpoint_name, tenant_id, debug=debug)
        return dashboard
    # Backend OK but no members returned -- legitimately empty.
    zero_reason = "all_raw_records_skipped_by_parser" if fetch.raw_records_count > 0 else "no_records_from_presence"
    logger.info("presence backend ok but no parsed members (scope=%s reason=%s)", fetch.scope, zero_reason)
    dashboard = _empty_dashboard()
    dashboard.zero_reason = zero_reason
    _attach_source_debug(dashboard, fetch, endpoint_name, tenant_id, debug=debug)
    return dashboard


def _attach_source_debug(
    dashboard: AnomalyDashboardResponse,
    fetch: object,
    endpoint_name: str,
    entreprise_id: int | None,
    *,
    debug: bool,
) -> None:
    dashboard.source_endpoint = getattr(fetch, "endpoint", None)
    dashboard.endpoint_name = endpoint_name
    dashboard.scope = getattr(fetch, "scope", None)
    dashboard.role = getattr(fetch, "role", None)
    dashboard.entreprise_id = entreprise_id
    dashboard.raw_records_count = int(getattr(fetch, "raw_records_count", 0) or 0)
    dashboard.parsed_records_count = int(getattr(fetch, "parsed_records_count", dashboard.parsed_records_count) or 0)
    dashboard.anomalies_count = int(dashboard.total_anomalies)
    dashboard.returned_anomalies_count = int(dashboard.total_anomalies)
    if not dashboard.date_used:
        dashboard.date_used = datetime.now(timezone.utc).date().isoformat()
    if debug:
        dashboard.skipped_records = list(getattr(fetch, "skipped_records", []) or [])
    logger.info(
        "anomaly endpoint=%s raw=%d parsed=%d rule=%d ml=%d total=%d zero_reason=%s",
        endpoint_name,
        dashboard.raw_records_count,
        dashboard.parsed_records_count,
        dashboard.rule_anomalies_count,
        dashboard.ml_anomalies_count,
        dashboard.total_anomalies,
        dashboard.zero_reason,
    )


@dataclass(slots=True)
class _AdminCollection:
    fetch: AttendanceFetchResult
    items: list[AdminAnomalyItem]
    dashboard: AnomalyDashboardResponse


_ADMIN_LAST_ITEMS: dict[str, AdminAnomalyItem] = {}

_CATEGORY_LABELS = {
    "ABSENCE": "Absence",
    "LATE": "Retard inhabituel",
    "LATE_ARRIVAL": "Retard inhabituel",
    "MISSING_CHECKOUT": "Checkout manquant",
    "REPEATED_MISSING_CHECKOUT": "Checkouts manquants repetes",
    "RAPID_SESSION": "Session trop courte",
    "OVERTIME_EXCESS": "Duree excessive",
    "UNUSUAL_WORKING_HOURS": "Duree excessive",
    "NIGHT_ACTIVITY": "Pointage hors plage",
    "WEEKEND_ACTIVITY": "Pointage hors plage",
    "HOLIDAY_ACTIVITY": "Pointage hors plage",
    "SUSPICIOUS_POINTAGE": "Pointage suspect",
    "BEHAVIORAL_ANOMALY": "Comportement inhabituel",
}

_RISK_ORDER = {
    RiskLevel.CRITICAL.value: 4,
    RiskLevel.HIGH.value: 3,
    RiskLevel.MEDIUM.value: 2,
    RiskLevel.LOW.value: 1,
}


def _require_admin(authorization: str | None) -> str:
    return _require_roles(
        authorization,
        {"ADMIN", "ROLE_ADMIN"},
        detail="admin_role_required",
    )


def _require_roles(
    authorization: str | None,
    allowed_roles: set[str],
    *,
    detail: str = "role_not_allowed",
) -> str:
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_bearer_token")
    roles = {role.strip().upper() for role in decode_jwt_roles(token)}
    if not (roles & allowed_roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    return token


def _status_store_path():
    path = get_settings().base_dir / "storage" / "anomaly_statuses.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _load_status_store() -> dict[str, dict[str, Any]]:
    try:
        raw = json.loads(_status_store_path().read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        logger.warning("admin anomaly status store is invalid JSON; ignoring it for this request")
        return {}
    return raw if isinstance(raw, dict) else {}


def _save_status_store(store: dict[str, dict[str, Any]]) -> None:
    path = _status_store_path()
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(store, ensure_ascii=True, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def _status_entry(anomaly_id: str, store: dict[str, dict[str, Any]]) -> tuple[AnomalyStatus, str | None, datetime | None]:
    entry = store.get(anomaly_id) or {}
    try:
        anomaly_status = AnomalyStatus(str(entry.get("status") or AnomalyStatus.UNVERIFIED.value))
    except ValueError:
        anomaly_status = AnomalyStatus.UNVERIFIED
    raw_updated_at = entry.get("updatedAt")
    updated_at = None
    if raw_updated_at:
        try:
            updated_at = datetime.fromisoformat(str(raw_updated_at))
        except ValueError:
            updated_at = None
    comment = entry.get("comment")
    return anomaly_status, str(comment).strip() if comment else None, updated_at


def _payload_backend_ok(payload: Any) -> bool:
    if isinstance(payload, list):
        return True
    if not isinstance(payload, dict):
        return False
    if payload.get("success") is False:
        return False
    if payload.get("error"):
        return False
    return bool(payload)


def _parse_date_text(value: Any) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_status_range_payload(payload: Any, fallback_date: date) -> ParsedPresencePayload:
    direct = _team_status_to_parse_result(payload, today=fallback_date)
    if direct.records or direct.raw_records_count:
        return direct
    if not _payload_backend_ok(payload):
        return direct
    container = payload.get("data", payload) if isinstance(payload, dict) else payload
    if not isinstance(container, dict):
        return direct

    records: list[AttendanceRecord] = []
    raw_records_count = 0
    skipped_records: list[dict[str, Any]] = []
    source_paths: list[str] = []
    for key, value in container.items():
        if not isinstance(value, (dict, list)):
            continue
        parsed = _team_status_to_parse_result(
            {"success": True, "data": value},
            today=_parse_date_text(key) or fallback_date,
        )
        if parsed.source_path:
            source_paths.append(f"$.data.{key}{parsed.source_path.removeprefix('$')}")
        records.extend(parsed.records)
        raw_records_count += parsed.raw_records_count
        skipped_records.extend(parsed.skipped_records)
    return ParsedPresencePayload(
        records=records,
        raw_records_count=raw_records_count,
        skipped_records=skipped_records,
        source_path=", ".join(source_paths[:3]) if source_paths else None,
    )


async def _fetch_admin_attendance(
    detector: AnomalyDetector,
    token: str,
    user_id: int | None,
    tenant_id: int | None,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    entreprise_id: int | None = None,
    team_id: int | None = None,
) -> AttendanceFetchResult:
    start = from_date or to_date
    end = to_date or from_date
    if start and end and start > end:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_date_range")

    effective_entreprise_id = entreprise_id if entreprise_id is not None else tenant_id
    if start and end:
        params: dict[str, Any] = {
            "start": start.isoformat(),
            "end": end.isoformat(),
        }
        if effective_entreprise_id is not None:
            params["entrepriseId"] = effective_entreprise_id
        if team_id is not None and effective_entreprise_id is not None:
            params["equipeId"] = team_id
        endpoint = (
            "presences/pointages/enterprise/status-range"
            if effective_entreprise_id is not None
            else "presences/pointages/global/status-range"
        )
        payload = await detector.backend.get(
            endpoint,
            token=token,
            user_id=user_id or 0,
            role="ADMIN",
            tenant_id=tenant_id,
            params=params,
        )
        parsed = _parse_status_range_payload(payload, fallback_date=start)
        return AttendanceFetchResult(
            records=parsed.records,
            backend_ok=_payload_backend_ok(payload),
            scope="GLOBAL",
            endpoint=endpoint,
            role="ADMIN",
            raw_records_count=parsed.raw_records_count,
            parsed_records_count=len(parsed.records),
            skipped_records=parsed.skipped_records,
            source_path=parsed.source_path,
        )

    return await detector.fetch_today_for_scope(
        token=token,
        user_id=user_id or 0,
        tenant_id=tenant_id,
        scope_override="ADMIN",
    )


async def _fetch_scoped_attendance_range(
    detector: AnomalyDetector,
    token: str,
    user_id: int | None,
    tenant_id: int | None,
    *,
    scope: str,
    from_date: date,
    to_date: date,
    team_id: int | None = None,
) -> AttendanceFetchResult:
    if from_date > to_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_date_range")

    normalized_scope = scope.strip().upper()
    if normalized_scope == "RH":
        endpoint = "presences/pointages/company/status-range"
        role = "RH"
        response_scope = "COMPANY"
    elif normalized_scope == "MANAGER":
        endpoint = "presences/pointages/team/status-range"
        role = "MANAGER"
        response_scope = "TEAM"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_scope")

    params: dict[str, Any] = {
        "start": from_date.isoformat(),
        "end": to_date.isoformat(),
    }
    if normalized_scope == "MANAGER" and team_id is not None:
        params["teamId"] = team_id

    payload = await detector.backend.get(
        endpoint,
        token=token,
        user_id=user_id or 0,
        role=role,
        tenant_id=tenant_id,
        params=params,
    )
    parsed = _parse_status_range_payload(payload, fallback_date=from_date)
    return AttendanceFetchResult(
        records=parsed.records,
        backend_ok=_payload_backend_ok(payload),
        scope=response_scope,
        endpoint=endpoint,
        role=role,
        raw_records_count=parsed.raw_records_count,
        parsed_records_count=len(parsed.records),
        skipped_records=parsed.skipped_records,
        source_path=parsed.source_path,
    )


async def _scoped_range_dashboard(
    detector: AnomalyDetector,
    token: str,
    user_id: int | None,
    tenant_id: int | None,
    *,
    scope: str,
    from_date: date,
    to_date: date,
    team_id: int | None = None,
    debug: bool = False,
    endpoint_name: str,
) -> AnomalyDashboardResponse:
    fetch = await _fetch_scoped_attendance_range(
        detector,
        token,
        user_id,
        tenant_id,
        scope=scope,
        from_date=from_date,
        to_date=to_date,
        team_id=team_id,
    )
    if fetch.records:
        dashboard = await detector.analyze_today(fetch.records, debug=debug)
    elif fetch.backend_ok:
        dashboard = _empty_dashboard()
        dashboard.zero_reason = (
            "all_raw_records_skipped_by_parser"
            if fetch.raw_records_count > 0
            else "no_records_from_presence"
        )
    else:
        dashboard = _unavailable_dashboard()
        dashboard.zero_reason = "presence_backend_unavailable"
    _attach_source_debug(
        dashboard,
        fetch,
        endpoint_name,
        tenant_id,
        debug=debug,
    )
    dashboard.date_used = f"{from_date.isoformat()}..{to_date.isoformat()}"
    return dashboard


def _record_lookup(records: Iterable[AttendanceRecord]) -> dict[tuple[int, str], AttendanceRecord]:
    lookup: dict[tuple[int, str], AttendanceRecord] = {}
    for record in records:
        lookup.setdefault((record.employee_id, record.date.isoformat()), record)
    return lookup


def _category_value(category: Any) -> str:
    return getattr(category, "value", str(category or ""))


def _category_label(category: Any) -> str:
    value = _category_value(category)
    return _CATEGORY_LABELS.get(value, value.replace("_", " ").title())


def _admin_item_from_anomaly(
    anomaly: AnomalyRecord,
    record: AttendanceRecord | None,
    statuses: dict[str, dict[str, Any]],
) -> AdminAnomalyItem:
    anomaly_id = anomaly.id or f"{anomaly.employee_id}:{anomaly.date}:{_category_value(anomaly.category)}"
    anomaly_status, status_comment, status_updated_at = _status_entry(anomaly_id, statuses)
    return AdminAnomalyItem(
        id=anomaly_id,
        employee_id=anomaly.employee_id,
        employee_name=anomaly.employee_name,
        date=anomaly.date,
        category=_category_value(anomaly.category),
        category_label=_category_label(anomaly.category),
        risk=anomaly.risk,
        score=anomaly.score,
        ml_score=anomaly.ml_score,
        ml_prediction=anomaly.ml_prediction,
        detection_source=anomaly.detection_source,
        model_version=anomaly.model_version,
        title=anomaly.title,
        summary=anomaly.summary,
        explanation=anomaly.explanation,
        reasons=anomaly.reasons,
        detected_reasons=anomaly.detected_reasons,
        recommendation=anomaly.recommendation,
        actions=anomaly.actions,
        status=anomaly_status,
        status_comment=status_comment,
        status_updated_at=status_updated_at,
        attendance_snapshot=anomaly.attendance_snapshot,
        missing_data_warnings=anomaly.missing_data_warnings,
        entreprise_id=record.entreprise_id if record else None,
        entreprise_name=record.entreprise_name if record else None,
        manager_id=record.manager_id if record else None,
        team_id=record.team_id if record else None,
        team_name=record.team_name if record else None,
        department_id=record.department_id if record else None,
        department_name=record.department_name or record.team_name if record else None,
        source=record.source if record else None,
    )


def _split_filter(value: str | None) -> set[str]:
    if not value:
        return set()
    return {part.strip().upper() for part in value.split(",") if part.strip()}


def _date_in_range(value: str, from_date: date | None, to_date: date | None) -> bool:
    parsed = _parse_date_text(value)
    if parsed is None:
        return True
    if from_date and parsed < from_date:
        return False
    if to_date and parsed > to_date:
        return False
    return True


def _filter_admin_items(
    items: Iterable[AdminAnomalyItem],
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    risk: str | None = None,
    category: str | None = None,
    anomaly_status: str | None = None,
    employee_id: int | None = None,
    entreprise_id: int | None = None,
    team_id: int | None = None,
) -> list[AdminAnomalyItem]:
    risks = _split_filter(risk)
    categories = _split_filter(category)
    statuses = _split_filter(anomaly_status)
    filtered: list[AdminAnomalyItem] = []
    for item in items:
        if employee_id is not None and item.employee_id != employee_id:
            continue
        if entreprise_id is not None and item.entreprise_id is not None and item.entreprise_id != entreprise_id:
            continue
        if (
            team_id is not None
            and item.team_id is not None
            and item.department_id is not None
            and item.team_id != team_id
            and item.department_id != team_id
        ):
            continue
        if risks and item.risk.value.upper() not in risks:
            continue
        if categories and item.category.upper() not in categories:
            continue
        if statuses and item.status.value.upper() not in statuses:
            continue
        if not _date_in_range(item.date, from_date, to_date):
            continue
        filtered.append(item)
    return filtered


def _sort_admin_items(items: list[AdminAnomalyItem], sort: str | None) -> list[AdminAnomalyItem]:
    key_name = (sort or "-score").strip()
    reverse = key_name.startswith("-")
    normalized = key_name[1:] if reverse else key_name
    if normalized == "date":
        key = lambda item: item.date
    elif normalized == "risk":
        key = lambda item: _RISK_ORDER.get(item.risk.value, 0)
    elif normalized == "employee":
        key = lambda item: item.employee_name.lower()
    elif normalized == "status":
        key = lambda item: item.status.value
    else:
        key = lambda item: item.score
    return sorted(items, key=key, reverse=reverse)


def _percentage(count: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((count / total) * 100, 1)


def _build_admin_summary(items: list[AdminAnomalyItem], parsed_records_count: int) -> AdminAnomalySummary:
    risk_counts = {level.value: 0 for level in RiskLevel}
    status_counts = {status_item.value: 0 for status_item in AnomalyStatus}
    for item in items:
        risk_counts[item.risk.value] = risk_counts.get(item.risk.value, 0) + 1
        status_counts[item.status.value] = status_counts.get(item.status.value, 0) + 1
    return AdminAnomalySummary(
        total_anomalies=len(items),
        critical=risk_counts[RiskLevel.CRITICAL.value],
        high=risk_counts[RiskLevel.HIGH.value],
        medium=risk_counts[RiskLevel.MEDIUM.value],
        low=risk_counts[RiskLevel.LOW.value],
        employees_concerned=len({item.employee_id for item in items}),
        anomaly_rate=_percentage(len(items), parsed_records_count),
        unverified=status_counts[AnomalyStatus.UNVERIFIED.value],
        in_progress=status_counts[AnomalyStatus.IN_PROGRESS.value],
        justified=status_counts[AnomalyStatus.JUSTIFIED.value],
        suspicious=status_counts[AnomalyStatus.SUSPICIOUS.value],
        closed=status_counts[AnomalyStatus.CLOSED.value],
    )


def _risk_buckets(items: list[AdminAnomalyItem]) -> list[AdminRiskBucket]:
    total = len(items)
    buckets = []
    for risk in (RiskLevel.CRITICAL, RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW):
        count = sum(1 for item in items if item.risk == risk)
        buckets.append(AdminRiskBucket(risk=risk, count=count, percentage=_percentage(count, total)))
    return buckets


def _type_buckets(items: list[AdminAnomalyItem]) -> list[AdminTypeBucket]:
    total = len(items)
    counts: dict[str, int] = {}
    for item in items:
        counts[item.category] = counts.get(item.category, 0) + 1
    return [
        AdminTypeBucket(
            category=category,
            label=_category_label(category),
            count=count,
            percentage=_percentage(count, total),
        )
        for category, count in sorted(counts.items(), key=lambda pair: pair[1], reverse=True)
    ]


def _day_buckets(items: list[AdminAnomalyItem]) -> list[AdminDayBucket]:
    counts: dict[str, int] = {}
    for item in items:
        counts[item.date] = counts.get(item.date, 0) + 1
    return [AdminDayBucket(date=day, count=count) for day, count in sorted(counts.items())]


def _top_employees(items: list[AdminAnomalyItem], limit: int = 5) -> list[AdminTopEmployee]:
    grouped: dict[int, list[AdminAnomalyItem]] = {}
    for item in items:
        grouped.setdefault(item.employee_id, []).append(item)
    rows: list[AdminTopEmployee] = []
    for employee_items in grouped.values():
        primary = max(employee_items, key=lambda item: (item.score, _RISK_ORDER.get(item.risk.value, 0)))
        rows.append(
            AdminTopEmployee(
                employee_id=primary.employee_id,
                employee_name=primary.employee_name,
                count=len(employee_items),
                highest_risk=max(employee_items, key=lambda item: _RISK_ORDER.get(item.risk.value, 0)).risk,
                max_score=max(item.score for item in employee_items),
                department_name=primary.department_name,
            )
        )
    rows.sort(key=lambda item: (item.count, item.max_score), reverse=True)
    return rows[:limit]


async def _admin_collection(
    detector: AnomalyDetector,
    token: str,
    user_id: int | None,
    tenant_id: int | None,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    employee_id: int | None = None,
    entreprise_id: int | None = None,
    team_id: int | None = None,
) -> _AdminCollection:
    fetch = await _fetch_admin_attendance(
        detector,
        token,
        user_id,
        tenant_id,
        from_date=from_date,
        to_date=to_date,
        entreprise_id=entreprise_id,
        team_id=team_id,
    )
    records = fetch.records
    if employee_id is not None:
        records = [record for record in records if record.employee_id == employee_id]
    if entreprise_id is not None:
        records = [
            record
            for record in records
            if record.entreprise_id is None or record.entreprise_id == entreprise_id
        ]
    if team_id is not None:
        records = [
            record
            for record in records
            if (
                (record.team_id is None and record.department_id is None)
                or record.team_id == team_id
                or record.department_id == team_id
            )
        ]

    if not records:
        dashboard = _empty_dashboard()
        dashboard.parsed_records_count = fetch.parsed_records_count
        dashboard.raw_records_count = fetch.raw_records_count
        dashboard.source_endpoint = fetch.endpoint
        dashboard.scope = fetch.scope
        dashboard.zero_reason = (
            "presence_backend_unavailable"
            if not fetch.backend_ok
            else "no_records_from_presence"
        )
        return _AdminCollection(fetch=fetch, items=[], dashboard=dashboard)

    dashboard = await detector.analyze_today(records, debug=False)
    statuses = _load_status_store()
    lookup = _record_lookup(records)
    items = [
        _admin_item_from_anomaly(
            anomaly,
            lookup.get((anomaly.employee_id, anomaly.date)),
            statuses,
        )
        for anomaly in dashboard.anomalies
    ]
    _ADMIN_LAST_ITEMS.update({item.id: item for item in items})
    return _AdminCollection(fetch=fetch, items=items, dashboard=dashboard)


def _dashboard_response(fetch: AttendanceFetchResult, items: list[AdminAnomalyItem]) -> AdminAnomalyDashboardResponse:
    sorted_items = _sort_admin_items(items, "-score")
    return AdminAnomalyDashboardResponse(
        generated_at=datetime.now(timezone.utc),
        backend_status="ok" if fetch.backend_ok else "unavailable",
        source_endpoint=fetch.endpoint,
        scope=fetch.scope,
        raw_records_count=fetch.raw_records_count,
        parsed_records_count=fetch.parsed_records_count,
        summary=_build_admin_summary(items, fetch.parsed_records_count),
        by_risk=_risk_buckets(items),
        by_type=_type_buckets(items),
        by_day=_day_buckets(items),
        top_employees=_top_employees(items),
        top_anomalies=sorted_items[:10],
    )


def _csv_response(items: list[AdminAnomalyItem]) -> Response:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id",
        "employeeId",
        "employeeName",
        "date",
        "category",
        "risk",
        "score",
        "status",
        "departmentName",
        "entrepriseName",
        "summary",
    ])
    for item in items:
        writer.writerow([
            item.id,
            item.employee_id,
            item.employee_name,
            item.date,
            item.category,
            item.risk.value,
            f"{item.score:.3f}",
            item.status.value,
            item.department_name or "",
            item.entreprise_name or "",
            item.summary,
        ])
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="admin-anomalies.csv"'},
    )


@router.get("/anomalies/today", response_model=AnomalyDashboardResponse)
async def get_today_anomalies(
    debug: bool = False,
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    tenant_id = x_tenant_id if x_tenant_id is not None else x_entreprise_id
    return await _scoped_dashboard(
        detector,
        authorization,
        x_user_id,
        tenant_id,
        debug=debug,
        endpoint_name="today",
        user_role=x_user_role,
    )


@router.get("/anomalies/dashboard", response_model=AnomalyDashboardResponse)
@traced_ml_endpoint("/api/ml/anomalies/dashboard")
async def get_dashboard(
    debug: bool = False,
    scope: str | None = None,
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    entreprise_id: int | None = Query(default=None, alias="entrepriseId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    tenant_id = x_tenant_id if x_tenant_id is not None else x_entreprise_id
    requested_scope = str(scope or "").strip().upper()
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_bearer_token")
    roles = {role.upper() for role in decode_jwt_roles(token)}

    if requested_scope in {"ADMIN", "GLOBAL"}:
        token = _require_admin(authorization)
        end = to_date or date.today()
        start = from_date or (end - timedelta(days=7))
        collection = await _admin_collection(
            detector,
            token,
            x_user_id,
            tenant_id,
            from_date=start,
            to_date=end,
            employee_id=employee_id,
            entreprise_id=entreprise_id,
            team_id=team_id,
        )
        dashboard = collection.dashboard
        _attach_source_debug(
            dashboard,
            collection.fetch,
            "dashboard",
            entreprise_id if entreprise_id is not None else tenant_id,
            debug=debug,
        )
        dashboard.date_used = f"{start.isoformat()}..{end.isoformat()}"
        return dashboard

    if requested_scope in {"RH", "COMPANY", "HR"}:
        token = _require_roles(
            authorization,
            {"RH", "ROLE_RH"},
            detail="rh_role_required",
        )
        end = to_date or date.today()
        start = from_date or (end - timedelta(days=7))
        return await _scoped_range_dashboard(
            detector,
            token,
            x_user_id,
            tenant_id,
            scope="RH",
            from_date=start,
            to_date=end,
            debug=debug,
            endpoint_name="dashboard",
        )

    if requested_scope in {"MANAGER", "TEAM"}:
        token = _require_roles(
            authorization,
            {"MANAGER", "ROLE_MANAGER"},
            detail="manager_role_required",
        )
        end = to_date or date.today()
        start = from_date or (end - timedelta(days=7))
        return await _scoped_range_dashboard(
            detector,
            token,
            x_user_id,
            tenant_id,
            scope="MANAGER",
            from_date=start,
            to_date=end,
            team_id=team_id,
            debug=debug,
            endpoint_name="dashboard",
        )

    if roles & {"ADMIN", "ROLE_ADMIN"}:
        inferred_scope = "ADMIN"
    elif roles & {"RH", "ROLE_RH"}:
        inferred_scope = "RH"
    elif roles & {"MANAGER", "ROLE_MANAGER"}:
        inferred_scope = "MANAGER"
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="anomaly_dashboard_role_required")

    return await get_dashboard(
        debug=debug,
        scope=inferred_scope,
        from_date=from_date,
        to_date=to_date,
        entreprise_id=entreprise_id,
        team_id=team_id,
        employee_id=employee_id,
        authorization=authorization,
        x_user_id=x_user_id,
        x_tenant_id=x_tenant_id,
        x_entreprise_id=x_entreprise_id,
        x_user_role=x_user_role,
        detector=detector,
    )


@router.get("/anomalies/manager", response_model=AnomalyDashboardResponse)
async def get_manager_anomalies(
    debug: bool = False,
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    team_id: int | None = Query(default=None, alias="teamId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    token = _require_roles(
        authorization,
        {"MANAGER", "ROLE_MANAGER"},
        detail="manager_role_required",
    )
    tenant_id = x_tenant_id if x_tenant_id is not None else x_entreprise_id
    end = to_date or date.today()
    start = from_date or (end - timedelta(days=7))
    return await _scoped_range_dashboard(
        detector,
        token,
        x_user_id,
        tenant_id,
        scope="MANAGER",
        from_date=start,
        to_date=end,
        team_id=team_id,
        debug=debug,
        endpoint_name="manager",
    )


@router.get("/anomalies/rh", response_model=AnomalyDashboardResponse)
async def get_rh_anomalies(
    debug: bool = False,
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AnomalyDashboardResponse:
    token = _require_roles(
        authorization,
        {"RH", "ROLE_RH"},
        detail="rh_role_required",
    )
    tenant_id = x_tenant_id if x_tenant_id is not None else x_entreprise_id
    end = to_date or date.today()
    start = from_date or (end - timedelta(days=7))
    return await _scoped_range_dashboard(
        detector,
        token,
        x_user_id,
        tenant_id,
        scope="RH",
        from_date=start,
        to_date=end,
        debug=debug,
        endpoint_name="rh",
    )


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


@router.get("/anomalies/admin/dashboard", response_model=AdminAnomalyDashboardResponse)
async def get_admin_anomaly_dashboard(
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    risk: str | None = None,
    category: str | None = None,
    anomaly_status: str | None = Query(default=None, alias="status"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    entreprise_id: int | None = Query(default=None, alias="entrepriseId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AdminAnomalyDashboardResponse:
    token = _require_admin(authorization)
    tenant_id = x_tenant_id if x_tenant_id is not None else x_entreprise_id
    collection = await _admin_collection(
        detector,
        token,
        x_user_id,
        tenant_id,
        from_date=from_date,
        to_date=to_date,
        employee_id=employee_id,
        entreprise_id=entreprise_id,
        team_id=team_id,
    )
    items = _filter_admin_items(
        collection.items,
        from_date=from_date,
        to_date=to_date,
        risk=risk,
        category=category,
        anomaly_status=anomaly_status,
        employee_id=employee_id,
        entreprise_id=entreprise_id,
        team_id=team_id,
    )
    return _dashboard_response(collection.fetch, items)


@router.get("/anomalies/by-employee", response_model=AdminAnomalyListResponse)
@router.get("/anomalies/list", response_model=AdminAnomalyListResponse)
@router.get("/anomalies/admin", response_model=AdminAnomalyListResponse)
@traced_ml_endpoint(_list_trace_endpoint)
async def list_admin_anomalies(
    request: Request,
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    risk: str | None = None,
    category: str | None = None,
    anomaly_status: str | None = Query(default=None, alias="status"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    entreprise_id: int | None = Query(default=None, alias="entrepriseId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    sort: str | None = "-score",
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AdminAnomalyListResponse:
    token = _require_admin(authorization)
    tenant_id = x_tenant_id if x_tenant_id is not None else x_entreprise_id
    collection = await _admin_collection(
        detector,
        token,
        x_user_id,
        tenant_id,
        from_date=from_date,
        to_date=to_date,
        employee_id=employee_id,
        entreprise_id=entreprise_id,
        team_id=team_id,
    )
    filtered = _filter_admin_items(
        collection.items,
        from_date=from_date,
        to_date=to_date,
        risk=risk,
        category=category,
        anomaly_status=anomaly_status,
        employee_id=employee_id,
        entreprise_id=entreprise_id,
        team_id=team_id,
    )
    sorted_items = _sort_admin_items(filtered, sort)
    start = (page - 1) * size
    paged = sorted_items[start : start + size]
    return AdminAnomalyListResponse(
        generated_at=datetime.now(timezone.utc),
        backend_status="ok" if collection.fetch.backend_ok else "unavailable",
        total=len(sorted_items),
        page=page,
        size=size,
        total_pages=math.ceil(len(sorted_items) / size) if sorted_items else 0,
        summary=_build_admin_summary(filtered, collection.fetch.parsed_records_count),
        items=paged,
    )


@router.get("/anomalies/admin/export")
async def export_admin_anomalies(
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    risk: str | None = None,
    category: str | None = None,
    anomaly_status: str | None = Query(default=None, alias="status"),
    employee_id: int | None = Query(default=None, alias="employeeId"),
    entreprise_id: int | None = Query(default=None, alias="entrepriseId"),
    team_id: int | None = Query(default=None, alias="teamId"),
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> Response:
    token = _require_admin(authorization)
    tenant_id = x_tenant_id if x_tenant_id is not None else x_entreprise_id
    collection = await _admin_collection(
        detector,
        token,
        x_user_id,
        tenant_id,
        from_date=from_date,
        to_date=to_date,
        employee_id=employee_id,
        entreprise_id=entreprise_id,
        team_id=team_id,
    )
    filtered = _filter_admin_items(
        collection.items,
        from_date=from_date,
        to_date=to_date,
        risk=risk,
        category=category,
        anomaly_status=anomaly_status,
        employee_id=employee_id,
        entreprise_id=entreprise_id,
        team_id=team_id,
    )
    return _csv_response(_sort_admin_items(filtered, "-score"))


@router.get("/anomalies/admin/{anomaly_id}", response_model=AdminAnomalyItem)
async def get_admin_anomaly_detail(
    anomaly_id: str,
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
    x_entreprise_id: int | None = Header(default=None, alias="X-Entreprise-Id"),
    detector: AnomalyDetector = Depends(get_detector),
) -> AdminAnomalyItem:
    token = _require_admin(authorization)
    cached = _ADMIN_LAST_ITEMS.get(anomaly_id)
    if cached is not None:
        return cached
    anomaly = detector.get_cached_anomaly(anomaly_id)
    if anomaly is not None:
        item = _admin_item_from_anomaly(anomaly, None, _load_status_store())
        _ADMIN_LAST_ITEMS[item.id] = item
        return item
    tenant_id = x_tenant_id if x_tenant_id is not None else x_entreprise_id
    collection = await _admin_collection(detector, token, x_user_id, tenant_id)
    for item in collection.items:
        if item.id == anomaly_id:
            return item
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="anomaly_not_found")


@router.patch("/anomalies/admin/{anomaly_id}/status", response_model=AdminStatusUpdateResponse)
async def update_admin_anomaly_status(
    anomaly_id: str,
    payload: AdminStatusUpdateRequest,
    authorization: str | None = Header(default=None),
) -> AdminStatusUpdateResponse:
    _require_admin(authorization)
    updated_at = datetime.now(timezone.utc)
    store = _load_status_store()
    store[anomaly_id] = {
        "status": payload.status.value,
        "comment": payload.comment.strip() if payload.comment else None,
        "updatedAt": updated_at.isoformat(),
    }
    _save_status_store(store)
    cached = _ADMIN_LAST_ITEMS.get(anomaly_id)
    if cached is not None:
        cached.status = payload.status
        cached.status_comment = payload.comment.strip() if payload.comment else None
        cached.status_updated_at = updated_at
    return AdminStatusUpdateResponse(
        anomaly_id=anomaly_id,
        status=payload.status,
        comment=payload.comment.strip() if payload.comment else None,
        updated_at=updated_at,
    )


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
    thresholds = {}
    if detector.model is not None:
        thresholds = {
            "medium": detector.model.medium_threshold,
            "high": detector.model.high_threshold,
            "critical": detector.model.critical_threshold,
        }
    return TrainResponse(
        success=True,
        message=f"Model {result.model_version} trained on {result.records_used} records.",
        records_used=result.records_used,
        model_version=result.model_version,
        training_duration_seconds=time.time() - started,
        contamination_observed=result.contamination_observed,
        data_source=result.data_source,
        thresholds=thresholds,
    )
