"""Main inference engine. Loaded once at FastAPI startup.

Pulls attendance rows from the Spring backend, runs them through the
``FeatureEngineer`` and the loaded Isolation Forest, then composes the
schema-typed response objects the API surfaces.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from app.core.config import get_settings  # noqa: F401 -- used by helpers below
from app.features.attendance_features import AttendanceRecord, FeatureEngineer
from app.inference.backend_client import WeenTimeBackendClient, decode_jwt_roles, select_scope
from app.models.isolation_forest_model import AttendanceAnomalyModel
from app.schemas.anomaly_schemas import (
    AnomalyDashboardResponse,
    AnomalyRecord,
    EmployeeRiskResponse,
    RiskLevel,
)

logger = logging.getLogger(__name__)


class AnomalyDetector:
    """Singleton-style detector. Construct once, share across requests."""

    def __init__(
        self,
        model: AttendanceAnomalyModel | None = None,
        feature_engineer: FeatureEngineer | None = None,
        backend: WeenTimeBackendClient | None = None,
    ) -> None:
        self.model = model
        self.feature_engineer = feature_engineer or FeatureEngineer()
        self.backend = backend or WeenTimeBackendClient()
        self._lock = asyncio.Lock()

    @property
    def is_ready(self) -> bool:
        return self.model is not None and self.model.model is not None

    async def initialize(self) -> None:
        async with self._lock:
            if self.is_ready:
                return
            settings = get_settings()
            loaded = AttendanceAnomalyModel.load_latest(settings.model_dir_path)
            if loaded is None:
                logger.warning(
                    "no trained model found in %s -- POST /api/ml/train/anomaly to bootstrap",
                    settings.model_dir_path,
                )
                return
            self.model = loaded

    async def reload(self) -> None:
        async with self._lock:
            settings = get_settings()
            loaded = AttendanceAnomalyModel.load_latest(settings.model_dir_path)
            if loaded is not None:
                self.model = loaded
                logger.info("reloaded model %s", self.model.model_version)

    # -- core ops ---------------------------------------------------------

    def analyze_record(
        self,
        record: AttendanceRecord,
        employee_history: list[AttendanceRecord] | None = None,
    ) -> AnomalyRecord:
        if not self.is_ready or self.model is None:
            return self._unready_record(record)

        history = employee_history or []

        # Benign absence short-circuit: an employee who simply hasn't checked in
        # is NOT an anomaly. Without this, the all-zero time vector lands far from
        # every training cluster and the Isolation Forest flags every absent
        # employee CRITICAL with the same score. We only skip when there's no
        # suspicious signal (weekend activity, repeated absences, or a history of
        # missing checkouts) -- those still get scored.
        if self._is_benign_absence(record, history):
            return self._benign_absence_record(record)

        features = self.feature_engineer.compute_features(record, history)
        prediction = self.model.predict(features.to_vector())
        feature_map = features.to_dict()
        reasons = self.model.generate_reasons(feature_map, prediction["score"])
        risk = RiskLevel(prediction["risk"])
        return AnomalyRecord(
            employee_id=record.employee_id,
            employee_name=record.employee_name,
            date=record.date.isoformat(),
            score=prediction["score"],
            risk=risk,
            reasons=reasons,
            explanation=self._compose_explanation(risk, reasons),
            features=feature_map,
        )

    @staticmethod
    def _is_benign_absence(record: AttendanceRecord, history: list[AttendanceRecord]) -> bool:
        # Must be a fully-absent row: no check-in, no check-out, no worked time.
        if record.check_in is not None or record.check_out is not None:
            return False
        if record.duration_seconds and record.duration_seconds > 0:
            return False
        if not record.is_absent:
            return False

        # Weekend "absence" is actually weekend activity territory -> let it score.
        if record.date.weekday() >= 5:
            return False

        # Suspicious pattern: repeated absences in the recent window.
        recent_absences = sum(
            1
            for h in history
            if h is not record
            and h.check_in is None
            and (h.daily_status or "").upper() in {"ABSENT", "ON_LEAVE"}
        )
        if recent_absences >= 5:
            return False

        # Suspicious pattern: a history of missing checkouts (checked in, never out).
        missing_checkout_history = sum(
            1 for h in history if h.check_in is not None and h.check_out is None
        )
        if missing_checkout_history >= 3:
            return False

        return True

    def _benign_absence_record(self, record: AttendanceRecord) -> AnomalyRecord:
        # Still expose the feature snapshot for transparency/debugging.
        features = self.feature_engineer.compute_features(record, [])
        return AnomalyRecord(
            employee_id=record.employee_id,
            employee_name=record.employee_name,
            date=record.date.isoformat(),
            score=0.0,
            risk=RiskLevel.LOW,
            reasons=["Absence du jour"],
            explanation="Employé absent aujourd'hui — aucun comportement anormal détecté.",
            features=features.to_dict(),
        )

    async def analyze_today(self, records: Iterable[AttendanceRecord]) -> AnomalyDashboardResponse:
        await self._ensure_ready()
        rows = list(records)
        per_employee: dict[int, list[AttendanceRecord]] = {}
        for r in rows:
            per_employee.setdefault(r.employee_id, []).append(r)
        for history in per_employee.values():
            history.sort(key=lambda x: (x.date, x.check_in or datetime.min))

        anomalies: list[AnomalyRecord] = []
        for r in rows:
            result = self.analyze_record(r, per_employee.get(r.employee_id))
            if result.risk in {RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL}:
                anomalies.append(result)

        anomalies.sort(key=lambda a: a.score, reverse=True)
        return self._build_dashboard(anomalies)

    async def analyze_employee(
        self,
        employee_id: int,
        records: list[AttendanceRecord],
        days: int = 30,
    ) -> EmployeeRiskResponse:
        await self._ensure_ready()
        employee_name = records[0].employee_name if records else f"Employé #{employee_id}"
        cutoff = date.today() - timedelta(days=days)
        relevant = [r for r in records if r.date >= cutoff]
        analyzed = [self.analyze_record(r, relevant) for r in relevant]
        anomalies_30d = sum(1 for a in analyzed if a.risk != RiskLevel.LOW)

        if not analyzed:
            return EmployeeRiskResponse(
                employee_id=employee_id,
                employee_name=employee_name,
                current_risk=RiskLevel.LOW,
                score=0.0,
                anomalies_last_30_days=0,
                trend="STABLE",
                latest_anomaly=None,
            )

        analyzed_sorted = sorted(analyzed, key=lambda a: a.date, reverse=True)
        latest = analyzed_sorted[0]
        midpoint = max(1, len(analyzed_sorted) // 2)
        recent_avg = sum(a.score for a in analyzed_sorted[:midpoint]) / midpoint
        older_avg = sum(a.score for a in analyzed_sorted[midpoint:]) / max(1, len(analyzed_sorted) - midpoint)
        if recent_avg < older_avg - 0.05:
            trend = "IMPROVING"
        elif recent_avg > older_avg + 0.05:
            trend = "WORSENING"
        else:
            trend = "STABLE"

        latest_anomaly = latest if latest.risk != RiskLevel.LOW else None
        return EmployeeRiskResponse(
            employee_id=employee_id,
            employee_name=employee_name,
            current_risk=latest.risk,
            score=latest.score,
            anomalies_last_30_days=anomalies_30d,
            trend=trend,
            latest_anomaly=latest_anomaly,
        )

    # -- backend bridge ---------------------------------------------------

    async def _fetch_scope(
        self,
        endpoint: str,
        mint_role: str,
        token: str | None,
        user_id: int,
        tenant_id: int | None,
    ) -> tuple[list[AttendanceRecord], bool]:
        payload = await self.backend.get(
            endpoint,
            token=token,
            user_id=user_id,
            role=mint_role,
            tenant_id=tenant_id,
        )
        backend_ok = (
            bool(payload)
            and payload.get("success") is not False
            and not payload.get("error")
        )
        records = _team_status_to_records(payload, today=date.today())
        return records, backend_ok

    async def fetch_today_company(
        self,
        token: str | None,
        user_id: int,
        tenant_id: int | None,
    ) -> tuple[list[AttendanceRecord], bool]:
        """Company-wide presence (RH/ADMIN scope) via /presence/company/today."""
        return await self._fetch_scope("presence/company/today", "RH", token, user_id, tenant_id)

    async def fetch_today_team(
        self,
        token: str | None,
        user_id: int,
        tenant_id: int | None,
    ) -> tuple[list[AttendanceRecord], bool]:
        """Manager team presence (MANAGER scope) via /presence/team/today."""
        return await self._fetch_scope("presence/team/today", "MANAGER", token, user_id, tenant_id)

    async def fetch_today_for_role(
        self,
        token: str | None,
        user_id: int,
        tenant_id: int | None,
    ) -> tuple[list[AttendanceRecord], bool, str]:
        """Choose the Spring endpoint from the caller's JWT role.

        MANAGER -> /presence/team/today; RH/ADMIN (or unknown) -> /company/today.
        Returns ``(records, backend_ok, scope)`` so the route can log/branch.
        """
        scope, endpoint, mint_role = select_scope(decode_jwt_roles(token))
        logger.info("fetching attendance scope=%s endpoint=%s", scope, endpoint)
        records, backend_ok = await self._fetch_scope(endpoint, mint_role, token, user_id, tenant_id)
        return records, backend_ok, scope

    def synthetic_demo_dashboard(self, limit: int = 8) -> AnomalyDashboardResponse:
        """Produce a populated dashboard from the synthetic parquet.

        Used as a fallback when the Spring backend is unreachable so the UI
        can still demonstrate the AI surface. Records are flagged
        ``is_demo=True`` so the Angular client renders a discreet banner.
        """
        records = _load_synthetic_anomaly_records(limit=limit)
        if not records or self.model is None or self.model.model is None:
            return AnomalyDashboardResponse(
                success=True,
                is_demo=True,
                generated_at=datetime.now(timezone.utc),
            )

        per_employee: dict[int, list[AttendanceRecord]] = {}
        for r in records:
            per_employee.setdefault(r.employee_id, []).append(r)

        anomalies: list[AnomalyRecord] = []
        for r in records:
            result = self.analyze_record(r, per_employee.get(r.employee_id))
            # Force a non-LOW risk for the synthetic ones so the demo card
            # surface is meaningful (the parquet rows here are pre-selected
            # anomaly-injected samples).
            if result.risk == RiskLevel.LOW:
                result.risk = RiskLevel.MEDIUM
            anomalies.append(result)

        anomalies.sort(key=lambda a: a.score, reverse=True)
        dashboard = self._build_dashboard(anomalies)
        dashboard.is_demo = True
        return dashboard

    async def fetch_employee_history(
        self,
        employee_id: int,
        token: str | None,
        tenant_id: int | None,
        days: int = 30,
    ) -> list[AttendanceRecord]:
        # Without a per-id endpoint, derive from a paginated history call.
        payload = await self.backend.get(
            "presence/history",
            token=token,
            user_id=employee_id,
            role="EMPLOYEE",
            tenant_id=tenant_id,
            params={"page": 0, "size": min(200, days * 4)},
        )
        return _history_to_records(payload)

    # -- internals --------------------------------------------------------

    async def _ensure_ready(self) -> None:
        if not self.is_ready:
            await self.initialize()

    def _build_dashboard(self, anomalies: list[AnomalyRecord]) -> AnomalyDashboardResponse:
        counts = {RiskLevel.CRITICAL: 0, RiskLevel.HIGH: 0, RiskLevel.MEDIUM: 0, RiskLevel.LOW: 0}
        for a in anomalies:
            counts[a.risk] += 1
        return AnomalyDashboardResponse(
            success=True,
            generated_at=datetime.now(timezone.utc),
            total_anomalies=len(anomalies),
            critical=counts[RiskLevel.CRITICAL],
            high=counts[RiskLevel.HIGH],
            medium=counts[RiskLevel.MEDIUM],
            low=counts[RiskLevel.LOW],
            anomalies=anomalies,
        )

    def _unready_record(self, record: AttendanceRecord) -> AnomalyRecord:
        return AnomalyRecord(
            employee_id=record.employee_id,
            employee_name=record.employee_name,
            date=record.date.isoformat(),
            score=0.0,
            risk=RiskLevel.LOW,
            reasons=["Modèle non disponible -- entraînement requis."],
            explanation="Le modèle d'anomalies n'a pas encore été entraîné.",
            features={},
        )

    def _compose_explanation(self, risk: RiskLevel, reasons: list[str]) -> str:
        prefix = {
            RiskLevel.CRITICAL: "Anomalie critique",
            RiskLevel.HIGH: "Anomalie importante",
            RiskLevel.MEDIUM: "Anomalie modérée",
            RiskLevel.LOW: "Comportement normal",
        }[risk]
        joined = "; ".join(reasons) if reasons else "aucun signal saillant"
        return f"{prefix}: {joined}"


# -- module-level helpers ----------------------------------------------------

_detector: AnomalyDetector | None = None


def get_detector() -> AnomalyDetector:
    global _detector
    if _detector is None:
        _detector = AnomalyDetector()
    return _detector


def _parse_iso_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value)
        # Spring serializes LocalDateTime without timezone; tolerate trailing Z too.
        if text.endswith("Z"):
            text = text.rstrip("Z")
        return datetime.fromisoformat(text)
    except (ValueError, TypeError):
        return None


def _extract_members(payload: Any) -> list[dict[str, Any]]:
    """Pull the member list out of any of the shapes Spring may return.

    Handles: a bare list; an ApiResponse wrapper ({"data": {...}}); and a
    direct object ({"members": [...]}). Member arrays may be named members /
    presences / sessions.
    """
    # Format C: bare list
    if isinstance(payload, list):
        return [m for m in payload if isinstance(m, dict)]
    if not isinstance(payload, dict):
        return []
    # An error envelope from the client wrapper -> no members.
    if payload.get("success") is False or payload.get("error"):
        return []
    # Format A: ApiResponse wrapper with nested data.
    container = payload.get("data") if isinstance(payload.get("data"), (dict, list)) else payload
    if isinstance(container, list):
        return [m for m in container if isinstance(m, dict)]
    if not isinstance(container, dict):
        return []
    for key in ("members", "presences", "sessions"):
        value = container.get(key)
        if isinstance(value, list):
            return [m for m in value if isinstance(m, dict)]
    return []


def _member_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _team_status_to_records(payload: dict[str, Any], today: date) -> list[AttendanceRecord]:
    members = _extract_members(payload)
    records: list[AttendanceRecord] = []
    for m in members:
        user_id = _member_int(
            m.get("utilisateurId") or m.get("employeeId") or m.get("userId") or m.get("id")
        )
        if user_id is None:
            continue

        name = (
            m.get("nomComplet")
            or m.get("fullName")
            or f"{m.get('prenom', '') or ''} {m.get('nom', '') or ''}".strip()
            or f"Employé #{user_id}"
        )

        check_in = _parse_iso_dt(m.get("heureEntree") or m.get("checkInTime") or m.get("heure_entree"))
        check_out = _parse_iso_dt(m.get("heureSortie") or m.get("checkOutTime") or m.get("heure_sortie"))

        # duration may be seconds (duration) or hours (totalHeuresTravaillees).
        duration_seconds: int | None = None
        raw_duration = m.get("durationSeconds") or m.get("duration")
        if raw_duration is not None:
            duration_seconds = _member_int(raw_duration)
        else:
            hours = m.get("totalHeuresTravaillees")
            if isinstance(hours, (int, float)):
                duration_seconds = int(hours * 3600)

        records.append(
            AttendanceRecord(
                employee_id=user_id,
                employee_name=str(name),
                date=today,
                check_in=check_in,
                check_out=check_out,
                duration_seconds=duration_seconds,
                daily_status=m.get("dailyStatus") or m.get("status") or m.get("presenceStatus"),
                late_arrival=m.get("lateArrival") if m.get("lateArrival") is not None else m.get("retard"),
                source=m.get("source"),
                localisation=m.get("localisation"),
            )
        )
    logger.info("parsed %d member record(s) from presence payload", len(records))
    return records


def _load_synthetic_anomaly_records(limit: int = 8) -> list[AttendanceRecord]:
    """Load anomaly-injected rows from the synthetic parquet/csv.

    Returns ``[]`` if no synthetic data is available (e.g. before the first
    training run). Catches every exception so the demo fallback can't itself
    crash the route.
    """
    settings = get_settings()
    base = settings.training_data_dir_path
    parquet = base / "synthetic_attendance.parquet"
    csv = base / "synthetic_attendance.csv"
    try:
        import pandas as pd

        if parquet.exists():
            df = pd.read_parquet(parquet)
        elif csv.exists():
            df = pd.read_csv(csv)
        else:
            return []
        if "anomaly_injected" in df.columns:
            df = df[df["anomaly_injected"].astype(bool)]
        if df.empty:
            return []
        df = df.head(limit)

        def _safe_int(value: Any) -> int | None:
            # pandas reads missing numeric cells as float NaN, which is not None
            # and is truthy -- int(NaN) raises. Guard with pd.isna.
            if value is None or pd.isna(value):
                return None
            try:
                return int(value)
            except (ValueError, TypeError):
                return None

        records: list[AttendanceRecord] = []
        for _, row in df.iterrows():
            check_in = _parse_iso_dt(row.get("check_in"))
            check_out = _parse_iso_dt(row.get("check_out"))
            row_date_raw = row.get("date")
            try:
                row_date = (
                    date.fromisoformat(str(row_date_raw)[:10])
                    if row_date_raw is not None and not pd.isna(row_date_raw)
                    else date.today()
                )
            except ValueError:
                row_date = date.today()
            employee_id = _safe_int(row.get("employee_id")) or 0
            late_raw = row.get("late_arrival")
            records.append(
                AttendanceRecord(
                    employee_id=employee_id,
                    employee_name=str(row.get("employee_name") or f"Demo #{employee_id}"),
                    date=row_date,
                    check_in=check_in,
                    check_out=check_out,
                    duration_seconds=_safe_int(row.get("duration_seconds")),
                    daily_status=str(row.get("daily_status") or "WORKING") or None,
                    late_arrival=(None if late_raw is None or pd.isna(late_raw) else bool(late_raw)),
                    source=str(row.get("source") or "") or None,
                    localisation=str(row.get("localisation") or "") or None,
                )
            )
        return records
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("synthetic fallback load failed: %s", exc)
        return []


def _history_to_records(payload: dict[str, Any]) -> list[AttendanceRecord]:
    if not isinstance(payload, dict):
        return []
    data = payload.get("data") or {}
    items = data.get("content") if isinstance(data, dict) else None
    if items is None and isinstance(data, list):
        items = data
    if not items:
        return []

    records: list[AttendanceRecord] = []
    for row in items:
        user_id = row.get("utilisateurId")
        check_in = _parse_iso_dt(row.get("checkInTime"))
        check_out = _parse_iso_dt(row.get("checkOutTime"))
        row_date_raw = row.get("date") or (check_in.date().isoformat() if check_in else None)
        if not row_date_raw or user_id is None:
            continue
        try:
            row_date = date.fromisoformat(str(row_date_raw)[:10])
        except ValueError:
            continue
        records.append(
            AttendanceRecord(
                employee_id=int(user_id),
                employee_name=str(row.get("employeeName") or f"Employé #{user_id}"),
                date=row_date,
                check_in=check_in,
                check_out=check_out,
                duration_seconds=int(row["duration"]) if row.get("duration") else None,
                daily_status=row.get("dailyStatus"),
                late_arrival=row.get("lateArrival"),
                source=row.get("source"),
                localisation=row.get("localisation"),
            )
        )
    return records
