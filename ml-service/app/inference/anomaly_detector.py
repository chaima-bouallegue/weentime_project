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
from app.inference.backend_client import WeenTimeBackendClient
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

        features = self.feature_engineer.compute_features(record, employee_history or [])
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

    async def fetch_today_company(
        self,
        token: str | None,
        user_id: int,
        tenant_id: int | None,
    ) -> tuple[list[AttendanceRecord], bool]:
        """Pull today's company-wide presence.

        Returns ``(records, backend_ok)``. ``backend_ok`` is True when the
        Spring backend responded with a 2xx envelope (even if empty) -- this
        lets the route layer decide whether to fall back to synthetic demo
        data when the real backend can't be reached.
        """
        payload = await self.backend.get(
            "presence/company/today",
            token=token,
            user_id=user_id,
            role="RH",
            tenant_id=tenant_id,
        )
        backend_ok = bool(payload) and payload.get("success") is not False and "error" not in payload
        records = _team_status_to_records(payload, today=date.today())
        return records, backend_ok

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


def _team_status_to_records(payload: dict[str, Any], today: date) -> list[AttendanceRecord]:
    if not isinstance(payload, dict) or not payload.get("data"):
        return []
    data = payload["data"]
    members = data.get("members") or []
    records: list[AttendanceRecord] = []
    for m in members:
        user_id = m.get("utilisateurId") or m.get("userId")
        if user_id is None:
            continue
        check_in = _parse_iso_dt(m.get("heureEntree"))
        check_out = _parse_iso_dt(m.get("heureSortie"))
        records.append(
            AttendanceRecord(
                employee_id=int(user_id),
                employee_name=str(m.get("nomComplet") or f"Employé #{user_id}"),
                date=today,
                check_in=check_in,
                check_out=check_out,
                duration_seconds=None,
                daily_status=m.get("status"),
                late_arrival=m.get("lateArrival"),
                source=None,
                localisation=None,
            )
        )
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
        records: list[AttendanceRecord] = []
        for _, row in df.iterrows():
            check_in = _parse_iso_dt(row.get("check_in"))
            check_out = _parse_iso_dt(row.get("check_out"))
            row_date_raw = row.get("date")
            try:
                row_date = date.fromisoformat(str(row_date_raw)[:10]) if row_date_raw else date.today()
            except ValueError:
                row_date = date.today()
            employee_id = int(row.get("employee_id", 0) or 0)
            records.append(
                AttendanceRecord(
                    employee_id=employee_id,
                    employee_name=str(row.get("employee_name") or f"Demo #{employee_id}"),
                    date=row_date,
                    check_in=check_in,
                    check_out=check_out,
                    duration_seconds=(
                        int(row["duration_seconds"]) if row.get("duration_seconds") is not None else None
                    ),
                    daily_status=str(row.get("daily_status") or "WORKING") or None,
                    late_arrival=bool(row.get("late_arrival")) if row.get("late_arrival") is not None else None,
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
