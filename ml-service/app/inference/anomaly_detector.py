"""Main inference engine. Loaded once at FastAPI startup.

Pulls attendance rows from the Spring backend, runs them through the
``FeatureEngineer`` and the loaded Isolation Forest, then composes the
schema-typed response objects the API surfaces.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import date, datetime, time as time_cls, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from app.core.config import get_settings  # noqa: F401 -- used by helpers below
from app.features.attendance_features import AttendanceRecord, FeatureEngineer
from app.inference.backend_client import WeenTimeBackendClient, decode_jwt_roles, select_scope
from app.models.isolation_forest_model import AttendanceAnomalyModel
from app.schemas.anomaly_schemas import (
    AnomalyCategory,
    AnomalyDashboardResponse,
    AnomalyRecord,
    AttendanceSnapshot,
    DetectedReason,
    EmployeeRiskResponse,
    RiskLevel,
)

logger = logging.getLogger(__name__)

MIN_VALID_SESSION_MINUTES = 30
OVERTIME_THRESHOLD_MINUTES = 30
MISSING_CHECKOUT_GRACE_MINUTES = 30


@dataclass(slots=True)
class RuleSignal:
    code: AnomalyCategory
    score: float
    label: str
    description: str
    value: str | None = None
    expected: str | None = None
    recommendation: str = "Verifier le pointage avec le collaborateur."
    actions: tuple[str, ...] = ("IGNORE", "CONTACT_EMPLOYEE", "VIEW_DETAILS")


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
        self._last_anomalies: dict[str, AnomalyRecord] = {}
        self._ignored_anomaly_ids: set[str] = set()
        self._contacted_anomaly_ids: set[str] = set()

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
        *,
        debug: bool = False,
    ) -> AnomalyRecord:
        history = employee_history or []
        features = self.feature_engineer.compute_features(record, history)
        feature_map = features.to_dict()
        signals = self._business_rule_signals(record, history, features)
        behavioral = self._behavioral_signal(record, history, features)
        if behavioral is not None:
            signals.append(behavioral)

        if not signals:
            return self._normal_record(record, features, debug=debug)

        signals.sort(key=lambda item: item.score, reverse=True)
        primary = signals[0]
        score = self._combine_signal_score(signals)
        score = self._apply_business_caps(primary, signals, score)
        risk = self._score_to_risk(score)
        detected = [
            DetectedReason(
                code=signal.code.value,
                label=signal.label,
                description=signal.description,
                value=signal.value,
                expected=signal.expected,
            )
            for signal in signals
        ]
        summary = self._summary_for(record, primary, features)
        return AnomalyRecord(
            id=self._anomaly_id(record, primary.code),
            employee_id=record.employee_id,
            employee_name=record.employee_name,
            date=record.date.isoformat(),
            score=score,
            risk=risk,
            severity=risk,
            category=primary.code,
            title=self._title_for(primary),
            summary=summary,
            reasons=[reason.label for reason in detected],
            detected_reasons=detected,
            attendance_snapshot=self._snapshot(record, features),
            recommendation=primary.recommendation,
            actions=list(primary.actions),
            missing_data_warnings=self._missing_data_warnings(record, primary.code),
            explanation=summary,
            features=feature_map if debug else {},
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

    async def analyze_today(self, records: Iterable[AttendanceRecord], *, debug: bool = False) -> AnomalyDashboardResponse:
        await self._ensure_ready()
        rows = list(records)
        per_employee: dict[int, list[AttendanceRecord]] = {}
        for r in rows:
            per_employee.setdefault(r.employee_id, []).append(r)
        for history in per_employee.values():
            history.sort(key=lambda x: (x.date, x.check_in or datetime.min))

        anomalies: list[AnomalyRecord] = []
        for r in rows:
            result = self.analyze_record(r, per_employee.get(r.employee_id), debug=debug)
            if result.score >= 0.20:
                anomalies.append(result)

        anomalies.sort(key=lambda a: a.score, reverse=True)
        return self._build_dashboard(anomalies)

    async def analyze_employee(
        self,
        employee_id: int,
        records: list[AttendanceRecord],
        days: int = 30,
        *,
        debug: bool = False,
    ) -> EmployeeRiskResponse:
        await self._ensure_ready()
        employee_name = records[0].employee_name if records else f"Employé #{employee_id}"
        cutoff = date.today() - timedelta(days=days)
        relevant = [r for r in records if r.date >= cutoff]
        analyzed = [self.analyze_record(r, relevant, debug=debug) for r in relevant]
        anomalies_30d = sum(1 for a in analyzed if a.score >= 0.20)

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

    # -- hybrid detection -------------------------------------------------

    def _business_rule_signals(
        self,
        record: AttendanceRecord,
        history: list[AttendanceRecord],
        features: Any,
    ) -> list[RuleSignal]:
        signals: list[RuleSignal] = []
        worked_minutes = self._worked_minutes(record, features)
        expected_minutes = self._expected_minutes(record)
        late_minutes = int(round(float(features.late_minutes or 0)))
        repeated_late = self._history_count(history, "late")
        repeated_missing_checkout = self._history_count(history, "missing_checkout")
        repeated_rapid = self._history_count(history, "rapid")
        is_leave = self._is_approved_leave(record)
        is_holiday = self._is_holiday(record)
        has_checkin = record.check_in is not None
        has_checkout = record.check_out is not None

        if not has_checkin and not is_leave and not is_holiday:
            if record.scheduled_workday is True:
                score = 0.92
                signals.append(
                    RuleSignal(
                        code=AnomalyCategory.ABSENCE,
                        score=score,
                        label="Absence non justifiee",
                        description="Aucun pointage d'entree sur un jour planifie.",
                        value="Aucun pointage",
                        expected="Pointage d'entree attendu",
                        recommendation="Verifier l'absence ou demander une justification.",
                    )
                )
            elif record.scheduled_workday is None and record.status_upper == "ABSENT":
                record.missing_data_warnings.append("Employee schedule unavailable")

        can_evaluate_late = record.scheduled_start is not None or bool(record.late_arrival) or record.status_upper == "LATE"
        if can_evaluate_late and (late_minutes > 0 or bool(record.late_arrival)):
            if late_minutes <= 0:
                late_minutes = 10
            if late_minutes < 15:
                score = 0.30
            elif late_minutes <= 30:
                score = 0.55
            else:
                score = 0.92 if repeated_late >= 3 else 0.78
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.LATE,
                    score=score,
                    label="Retard d'arrivee",
                    description="Le pointage d'entree est apres l'heure planifiee et la tolerance.",
                    value=f"{late_minutes} min",
                    expected="Arrivee dans la tolerance",
                    recommendation="Verifier si le retard est justifie ou recurrent.",
                )
            )

        if self._is_missing_checkout(record):
            score = 0.92 if repeated_missing_checkout >= 3 else 0.78
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.MISSING_CHECKOUT,
                    score=score,
                    label="Sortie non pointee",
                    description="Une entree existe mais aucune sortie valide n'est enregistree.",
                    value="Sortie manquante",
                    expected="Pointage sortie apres la session",
                    recommendation="Demander au collaborateur de confirmer l'heure de sortie.",
                )
            )

        if has_checkin and has_checkout and 0 < worked_minutes < MIN_VALID_SESSION_MINUTES:
            score = 0.91 if repeated_rapid >= 3 else 0.78
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.RAPID_SESSION,
                    score=score,
                    label="Session tres courte",
                    description="La duree travaillee est inferieure au minimum attendu.",
                    value=f"{worked_minutes} min",
                    expected=f"au moins {MIN_VALID_SESSION_MINUTES} min",
                    recommendation="Verifier si ce pointage est un test ou une erreur.",
                )
            )

        overtime_minutes = self._overtime_minutes(record, worked_minutes, expected_minutes)
        if overtime_minutes >= OVERTIME_THRESHOLD_MINUTES:
            score = 0.86 if overtime_minutes >= 120 else 0.72
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.OVERTIME_EXCESS,
                    score=score,
                    label="Heures supplementaires elevees",
                    description="Le temps travaille depasse l'horaire planifie au-dela du seuil.",
                    value=f"{overtime_minutes} min",
                    expected=f"moins de {OVERTIME_THRESHOLD_MINUTES} min au-dela de l'horaire",
                    recommendation="Controler la charge de travail et valider la demande d'heures supplementaires.",
                )
            )

        if self._has_night_activity(record):
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.NIGHT_ACTIVITY,
                    score=0.72,
                    label="Activite nocturne",
                    description="Un pointage a eu lieu en dehors de la plage de travail habituelle.",
                    value=self._night_value(record),
                    expected="Activite entre 06:00 et 22:00",
                    recommendation="Verifier si une intervention exceptionnelle etait prevue.",
                )
            )

        if record.date.weekday() >= 5 and has_checkin:
            if record.exceptional_work_allowed is True or record.scheduled_workday is True:
                pass
            else:
                score = 0.45 if record.scheduled_workday is False else 0.38
                if record.scheduled_workday is None:
                    record.missing_data_warnings.append("Weekend schedule unavailable")
                signals.append(
                    RuleSignal(
                        code=AnomalyCategory.WEEKEND_ACTIVITY,
                        score=score,
                        label="Activite week-end",
                        description="Un pointage est enregistre pendant le week-end.",
                        value=record.date.isoformat(),
                        expected="Pas de pointage week-end sauf planning ou exception",
                        recommendation="Verifier si le week-end etait planifie.",
                    )
                )

        if is_holiday and has_checkin and record.exceptional_work_allowed is not True:
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.HOLIDAY_ACTIVITY,
                    score=0.62,
                    label="Activite jour ferie",
                    description="Un pointage existe pendant un jour ferie sans exception connue.",
                    value=record.date.isoformat(),
                    expected="Pas de pointage pendant un jour ferie",
                    recommendation="Verifier si un travail exceptionnel a ete autorise.",
                )
            )

        return signals

    def _behavioral_signal(
        self,
        record: AttendanceRecord,
        history: list[AttendanceRecord],
        features: Any,
    ) -> RuleSignal | None:
        usable_history = [item for item in history if item.check_in is not None and item is not record]
        if len(usable_history) >= 5 and features.deviation_from_usual >= 2.0:
            score = 0.75 if features.deviation_from_usual >= 3.5 else 0.58
            return RuleSignal(
                code=AnomalyCategory.BEHAVIORAL_ANOMALY,
                score=score,
                label="Comportement inhabituel",
                description="L'heure d'arrivee s'ecarte fortement de l'historique recent.",
                value=f"{features.deviation_from_usual:.1f} h d'ecart",
                expected=f"autour de {features.avg_checkin_hour_30d:.1f}h",
                recommendation="Comparer avec les habitudes recentes et le planning du collaborateur.",
            )

        if not self.is_ready or self.model is None:
            return None

        prediction = self.model.predict(features.to_vector())
        score = float(prediction["score"])
        if score < 0.40:
            return None
        concrete_rule_flags = (
            features.missing_checkout
            or features.rapid_session
            or features.overtime_excess
            or features.night_activity
            or features.is_late
            or features.is_weekend
        )
        if concrete_rule_flags:
            return None
        capped = min(score, 0.84)
        return RuleSignal(
            code=AnomalyCategory.BEHAVIORAL_ANOMALY,
            score=capped,
            label="Comportement inhabituel",
            description="Le modele detecte un ecart par rapport aux habitudes recentes.",
            value=f"score ML {score:.2f}",
            expected="profil habituel du collaborateur",
            recommendation="Ouvrir le detail avant de qualifier cette anomalie.",
        )

    @staticmethod
    def _score_to_risk(score: float) -> RiskLevel:
        if score >= 0.90:
            return RiskLevel.CRITICAL
        if score >= 0.70:
            return RiskLevel.HIGH
        if score >= 0.40:
            return RiskLevel.MEDIUM
        return RiskLevel.LOW

    @staticmethod
    def _combine_signal_score(signals: list[RuleSignal]) -> float:
        if not signals:
            return 0.0
        base = max(signal.score for signal in signals)
        bonus = min(max(len(signals) - 1, 0) * 0.04, 0.08)
        return min(base + bonus, 0.99)

    @staticmethod
    def _apply_business_caps(primary: RuleSignal, signals: list[RuleSignal], score: float) -> float:
        codes = {signal.code for signal in signals}
        if codes == {AnomalyCategory.RAPID_SESSION}:
            return min(score, 0.89)
        if codes == {AnomalyCategory.WEEKEND_ACTIVITY}:
            return min(score, 0.69)
        if primary.code == AnomalyCategory.ABSENCE:
            return max(score, 0.90)
        return score

    def _normal_record(self, record: AttendanceRecord, features: Any, *, debug: bool) -> AnomalyRecord:
        summary = "Aucune anomalie exploitable detectee."
        return AnomalyRecord(
            id=None,
            employee_id=record.employee_id,
            employee_name=record.employee_name,
            date=record.date.isoformat(),
            score=0.0,
            risk=RiskLevel.LOW,
            severity=RiskLevel.LOW,
            category=AnomalyCategory.NONE,
            title="Aucune anomalie",
            summary=summary,
            reasons=[],
            detected_reasons=[],
            attendance_snapshot=self._snapshot(record, features),
            recommendation="Aucune action requise.",
            actions=["VIEW_DETAILS"],
            missing_data_warnings=record.missing_data_warnings,
            explanation=summary,
            features=features.to_dict() if debug else {},
        )

    def _snapshot(self, record: AttendanceRecord, features: Any) -> AttendanceSnapshot:
        worked_minutes = self._worked_minutes(record, features)
        return AttendanceSnapshot(
            scheduled_start=self._format_time(record.scheduled_start),
            scheduled_end=self._format_time(record.scheduled_end),
            check_in=self._format_datetime(record.check_in),
            check_out=self._format_datetime(record.check_out),
            worked_minutes=worked_minutes if worked_minutes > 0 else None,
            late_minutes=int(round(float(features.late_minutes or 0))),
            overtime_minutes=self._overtime_minutes(record, worked_minutes, self._expected_minutes(record)),
            missing_checkout=self._is_missing_checkout(record),
            is_absent=record.check_in is None,
        )

    @staticmethod
    def _anomaly_id(record: AttendanceRecord, category: AnomalyCategory) -> str:
        return f"{record.employee_id}:{record.date.isoformat()}:{category.value}"

    @staticmethod
    def _format_time(value: time_cls | None) -> str | None:
        return value.strftime("%H:%M") if value else None

    @staticmethod
    def _format_datetime(value: datetime | None) -> str | None:
        return value.isoformat(timespec="minutes") if value else None

    @staticmethod
    def _worked_minutes(record: AttendanceRecord, features: Any) -> int:
        if record.worked_minutes is not None:
            return max(int(record.worked_minutes), 0)
        if record.duration_seconds is not None:
            return max(int(record.duration_seconds // 60), 0)
        return max(int(round(float(features.worked_hours or 0) * 60)), 0)

    @staticmethod
    def _expected_minutes(record: AttendanceRecord) -> int | None:
        if record.expected_minutes is not None:
            return int(record.expected_minutes)
        if record.scheduled_start and record.scheduled_end:
            start = datetime.combine(record.date, record.scheduled_start)
            end = datetime.combine(record.date, record.scheduled_end)
            if end > start:
                return int((end - start).total_seconds() // 60)
        return None

    @staticmethod
    def _overtime_minutes(record: AttendanceRecord, worked_minutes: int, expected_minutes: int | None) -> int:
        if record.overtime_minutes is not None:
            return max(int(record.overtime_minutes), 0)
        if expected_minutes is None:
            return 0
        return max(worked_minutes - expected_minutes, 0)

    @staticmethod
    def _is_approved_leave(record: AttendanceRecord) -> bool:
        status = record.status_upper
        return bool(record.approved_leave) or status in {"ON_LEAVE", "LEAVE", "CONGE", "APPROVED_LEAVE"}

    @staticmethod
    def _is_holiday(record: AttendanceRecord) -> bool:
        status = record.status_upper
        return bool(record.holiday) or status in {"HOLIDAY", "PUBLIC_HOLIDAY", "JOUR_FERIE"}

    @staticmethod
    def _is_missing_checkout(record: AttendanceRecord) -> bool:
        status = record.status_upper
        if status in {"MISSING_CHECKOUT", "AUTO_CLOSED"}:
            return True
        if record.check_in is None or record.check_out is not None:
            return False
        if record.date < date.today():
            return True
        if record.scheduled_end:
            due_at = datetime.combine(record.date, record.scheduled_end) + timedelta(
                minutes=MISSING_CHECKOUT_GRACE_MINUTES
            )
            return datetime.now() > due_at
        record.missing_data_warnings.append("Scheduled end unavailable for missing checkout")
        return True

    @staticmethod
    def _has_night_activity(record: AttendanceRecord) -> bool:
        return any(
            value is not None and (value.hour < 6 or value.hour >= 22)
            for value in (record.check_in, record.check_out)
        )

    @staticmethod
    def _night_value(record: AttendanceRecord) -> str | None:
        values = []
        if record.check_in and (record.check_in.hour < 6 or record.check_in.hour >= 22):
            values.append(f"entree {record.check_in.strftime('%H:%M')}")
        if record.check_out and (record.check_out.hour < 6 or record.check_out.hour >= 22):
            values.append(f"sortie {record.check_out.strftime('%H:%M')}")
        return ", ".join(values) if values else None

    def _history_count(self, history: list[AttendanceRecord], kind: str) -> int:
        count = 0
        for item in history:
            features = self.feature_engineer.compute_features(item, [])
            if kind == "late" and (features.late_minutes > 0 or bool(item.late_arrival)):
                count += 1
            elif kind == "missing_checkout" and self._is_missing_checkout(item):
                count += 1
            elif kind == "rapid" and 0 < self._worked_minutes(item, features) < MIN_VALID_SESSION_MINUTES:
                count += 1
        return count

    @staticmethod
    def _missing_data_warnings(record: AttendanceRecord, category: AnomalyCategory) -> list[str]:
        warnings = list(dict.fromkeys(record.missing_data_warnings))
        if category == AnomalyCategory.ABSENCE and record.scheduled_workday is None:
            warnings.append("Employee schedule unavailable")
        if category == AnomalyCategory.WEEKEND_ACTIVITY and record.scheduled_workday is None:
            warnings.append("Weekend schedule unavailable")
        return list(dict.fromkeys(warnings))

    @staticmethod
    def _title_for(signal: RuleSignal) -> str:
        titles = {
            AnomalyCategory.ABSENCE: "Absence non justifiee",
            AnomalyCategory.LATE: "Retard d'arrivee",
            AnomalyCategory.MISSING_CHECKOUT: "Sortie non pointee",
            AnomalyCategory.RAPID_SESSION: "Session tres courte",
            AnomalyCategory.OVERTIME_EXCESS: "Heures supplementaires elevees",
            AnomalyCategory.NIGHT_ACTIVITY: "Activite nocturne",
            AnomalyCategory.WEEKEND_ACTIVITY: "Activite week-end",
            AnomalyCategory.HOLIDAY_ACTIVITY: "Activite jour ferie",
            AnomalyCategory.BEHAVIORAL_ANOMALY: "Comportement inhabituel",
        }
        return titles.get(signal.code, signal.label)

    def _summary_for(self, record: AttendanceRecord, signal: RuleSignal, features: Any) -> str:
        worked_minutes = self._worked_minutes(record, features)
        if signal.code == AnomalyCategory.RAPID_SESSION:
            return f"{record.employee_name} a travaille seulement {worked_minutes} minutes."
        if signal.code == AnomalyCategory.ABSENCE:
            return f"{record.employee_name} n'a pas pointe sur un jour planifie."
        if signal.code == AnomalyCategory.LATE:
            return f"{record.employee_name} est arrive avec {signal.value or 'un retard'}."
        if signal.code == AnomalyCategory.MISSING_CHECKOUT:
            return f"{record.employee_name} a une entree sans sortie enregistree."
        if signal.code == AnomalyCategory.OVERTIME_EXCESS:
            return f"{record.employee_name} depasse l'horaire planifie de {signal.value or 'plusieurs minutes'}."
        if signal.code == AnomalyCategory.WEEKEND_ACTIVITY:
            return f"{record.employee_name} a pointe pendant le week-end."
        if signal.code == AnomalyCategory.HOLIDAY_ACTIVITY:
            return f"{record.employee_name} a pointe pendant un jour ferie."
        if signal.code == AnomalyCategory.NIGHT_ACTIVITY:
            return f"{record.employee_name} a pointe en dehors de la plage horaire habituelle."
        return f"{record.employee_name} presente un comportement inhabituel par rapport a son historique."

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
        """Company-wide presence (RH scope) via /presence/company/today."""
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

        MANAGER -> /presence/team/today; RH -> /company/today; ADMIN -> /global/today.
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
        anomalies = [a for a in anomalies if not (a.id and a.id in self._ignored_anomaly_ids)]
        counts = {RiskLevel.CRITICAL: 0, RiskLevel.HIGH: 0, RiskLevel.MEDIUM: 0, RiskLevel.LOW: 0}
        by_category: dict[str, int] = {}
        for a in anomalies:
            counts[a.risk] += 1
            by_category[str(a.category)] = by_category.get(str(a.category), 0) + 1
        self._last_anomalies = {a.id: a for a in anomalies if a.id}
        return AnomalyDashboardResponse(
            success=True,
            generated_at=datetime.now(timezone.utc),
            total_anomalies=len(anomalies),
            critical=counts[RiskLevel.CRITICAL],
            high=counts[RiskLevel.HIGH],
            medium=counts[RiskLevel.MEDIUM],
            low=counts[RiskLevel.LOW],
            anomalies=anomalies,
            grouped_by_severity={level.value: counts[level] for level in counts},
            grouped_by_category=by_category,
            top_anomalies=anomalies[:5],
        )

    def get_cached_anomaly(self, anomaly_id: str) -> AnomalyRecord | None:
        return self._last_anomalies.get(anomaly_id)

    def ignore_anomaly(self, anomaly_id: str) -> bool:
        exists = anomaly_id in self._last_anomalies
        self._ignored_anomaly_ids.add(anomaly_id)
        return exists

    def contact_anomaly(self, anomaly_id: str) -> bool:
        exists = anomaly_id in self._last_anomalies
        self._contacted_anomaly_ids.add(anomaly_id)
        return exists

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


def _parse_iso_dt(value: Any, default_date: date | None = None) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value)
        # Spring serializes LocalDateTime without timezone; tolerate trailing Z too.
        if text.endswith("Z"):
            text = text.rstrip("Z")
        if default_date is not None and len(text) <= 8 and ":" in text:
            pattern = "%H:%M:%S" if text.count(":") == 2 else "%H:%M"
            return datetime.combine(default_date, datetime.strptime(text, pattern).time())
        return datetime.fromisoformat(text)
    except (ValueError, TypeError):
        return None


def _parse_time_value(value: Any) -> time_cls | None:
    if value is None or value == "":
        return None
    if isinstance(value, time_cls):
        return value
    text = str(value)
    try:
        if "T" in text:
            return datetime.fromisoformat(text.rstrip("Z")).time().replace(tzinfo=None)
        if len(text) >= 5 and ":" in text:
            pattern = "%H:%M:%S" if text.count(":") >= 2 else "%H:%M"
            return datetime.strptime(text[:8], pattern).time()
    except (ValueError, TypeError):
        return None
    return None


def _boolish(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "oui", "y"}:
        return True
    if text in {"false", "0", "no", "non", "n"}:
        return False
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


def _first_present(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row and row.get(key) is not None:
            return row.get(key)
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

        check_in = _parse_iso_dt(m.get("heureEntree") or m.get("checkInTime") or m.get("heure_entree"), today)
        check_out = _parse_iso_dt(m.get("heureSortie") or m.get("checkOutTime") or m.get("heure_sortie"), today)

        # duration may be seconds (duration) or hours (totalHeuresTravaillees).
        duration_seconds: int | None = None
        raw_duration = m.get("durationSeconds") if m.get("durationSeconds") is not None else m.get("duration")
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
                expected_minutes=_member_int(
                    _first_present(m, "expectedMinutes", "minutesAttendues", "plannedMinutes")
                ),
                worked_minutes=_member_int(
                    _first_present(m, "workedMinutes", "minutesTravaillees", "worked_minutes")
                ),
                overtime_minutes=_member_int(
                    _first_present(m, "overtimeMinutes", "overtimePreview", "heuresSupplementairesMinutes")
                ),
                scheduled_start=_parse_time_value(
                    _first_present(m, "scheduledStart", "horaireDebut", "plannedStart", "heureDebut")
                ),
                scheduled_end=_parse_time_value(
                    _first_present(m, "scheduledEnd", "horaireFin", "plannedEnd", "heureFin")
                ),
                scheduled_workday=_boolish(
                    _first_present(m, "scheduledWorkday", "workingDay", "isWorkingDay", "jourTravaille")
                ),
                approved_leave=_boolish(
                    _first_present(m, "approvedLeave", "onApprovedLeave", "onLeave", "isOnLeave")
                ),
                holiday=_boolish(
                    _first_present(m, "holiday", "publicHoliday", "isHoliday", "jourFerie")
                ),
                exceptional_work_allowed=_boolish(
                    _first_present(m, "exceptionalWorkAllowed", "holidayWorkAllowed", "weekendWorkAllowed")
                ),
                daily_status=m.get("dailyStatus") or m.get("status") or m.get("presenceStatus"),
                late_arrival=_boolish(
                    m.get("lateArrival") if m.get("lateArrival") is not None else m.get("retard")
                ),
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
                expected_minutes=_member_int(
                    _first_present(row, "expectedMinutes", "minutesAttendues", "plannedMinutes")
                ),
                worked_minutes=_member_int(
                    _first_present(row, "workedMinutes", "minutesTravaillees", "worked_minutes")
                ),
                overtime_minutes=_member_int(
                    _first_present(row, "overtimeMinutes", "overtimePreview", "heuresSupplementairesMinutes")
                ),
                scheduled_start=_parse_time_value(
                    _first_present(row, "scheduledStart", "horaireDebut", "plannedStart", "heureDebut")
                ),
                scheduled_end=_parse_time_value(
                    _first_present(row, "scheduledEnd", "horaireFin", "plannedEnd", "heureFin")
                ),
                scheduled_workday=_boolish(
                    _first_present(row, "scheduledWorkday", "workingDay", "isWorkingDay", "jourTravaille")
                ),
                approved_leave=_boolish(
                    _first_present(row, "approvedLeave", "onApprovedLeave", "onLeave", "isOnLeave")
                ),
                holiday=_boolish(
                    _first_present(row, "holiday", "publicHoliday", "isHoliday", "jourFerie")
                ),
                exceptional_work_allowed=_boolish(
                    _first_present(row, "exceptionalWorkAllowed", "holidayWorkAllowed", "weekendWorkAllowed")
                ),
                daily_status=row.get("dailyStatus"),
                late_arrival=_boolish(row.get("lateArrival")),
                source=row.get("source"),
                localisation=row.get("localisation"),
            )
        )
    return records
