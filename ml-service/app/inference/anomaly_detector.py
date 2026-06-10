"""Main inference engine. Loaded once at FastAPI startup.

Pulls attendance rows from the Spring backend, runs them through the
``FeatureEngineer`` and the loaded Isolation Forest, then composes the
schema-typed response objects the API surfaces.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
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


@dataclass(slots=True)
class ParsedPresencePayload:
    records: list[AttendanceRecord]
    raw_records_count: int = 0
    skipped_records: list[dict[str, Any]] = field(default_factory=list)
    source_path: str | None = None


@dataclass(slots=True)
class AttendanceFetchResult:
    records: list[AttendanceRecord]
    backend_ok: bool
    scope: str
    endpoint: str
    role: str
    raw_records_count: int = 0
    parsed_records_count: int = 0
    skipped_records: list[dict[str, Any]] = field(default_factory=list)
    source_path: str | None = None


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
        ml_diagnostic = self._model_diagnostic(features)
        signals = self._business_rule_signals(record, history, features)
        detection_source = "RULE"
        behavioral = self._behavioral_signal(record, history, features) if not signals else None
        if behavioral is not None:
            signals.append(behavioral)
            detection_source = (
                "ML"
                if str(behavioral.value or "").lower().startswith("score ml")
                else "BEHAVIORAL_BASELINE"
            )

        if not signals:
            return self._normal_record(record, features, ml_diagnostic=ml_diagnostic, debug=debug)

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
            ml_score=ml_diagnostic.get("score"),
            ml_prediction=ml_diagnostic.get("is_anomaly"),
            detection_source=detection_source,
            model_version=self.model.model_version if self.model else None,
            features=feature_map if debug else {},
        )

    def _model_diagnostic(self, features: Any) -> dict[str, Any]:
        if not self.is_ready or self.model is None:
            return {}
        try:
            return self.model.predict(features.to_vector())
        except Exception as exc:  # pragma: no cover - defensive runtime guard
            logger.warning("unable to compute ML diagnostic: %s", exc)
            return {}

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

        raw_anomaly_count = len(anomalies)
        anomalies = self._merge_duplicate_anomalies(anomalies)
        duplicates_removed = max(0, raw_anomaly_count - len(anomalies))
        anomalies.sort(key=lambda a: a.score, reverse=True)
        rule_count = sum(1 for anomaly in anomalies if _category_value(anomaly.category) != AnomalyCategory.BEHAVIORAL_ANOMALY.value)
        ml_count = len(anomalies) - rule_count
        zero_reason = None
        if rows and not anomalies:
            zero_reason = "records_parsed_but_no_rule_or_ml_anomalies"
        logger.info(
            "anomaly detection parsed_records=%d rule_anomalies=%d ml_anomalies=%d total_anomalies=%d zero_reason=%s",
            len(rows),
            rule_count,
            ml_count,
            len(anomalies),
            zero_reason,
        )
        dashboard = self._build_dashboard(anomalies)
        dashboard.parsed_records_count = len(rows)
        dashboard.returned_anomalies_count = len(anomalies)
        dashboard.duplicates_removed = duplicates_removed
        dashboard.anomalies_count = len(anomalies)
        dashboard.rule_anomalies_count = rule_count
        dashboard.ml_anomalies_count = ml_count
        dashboard.date_used = date.today().isoformat()
        dashboard.zero_reason = zero_reason
        return dashboard

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
        repeated_late = self._history_count(history, "late", current=record)
        repeated_missing_checkout = self._history_count(history, "missing_checkout", current=record)
        repeated_rapid = self._history_count(history, "rapid", current=record)
        is_leave = self._is_approved_leave(record)
        is_holiday = self._is_holiday(record)
        is_telework = self._is_approved_telework(record)
        has_checkin = record.check_in is not None
        has_checkout = record.check_out is not None

        if (
            not has_checkin
            and not has_checkout
            and worked_minutes <= 0
            and not is_leave
            and not is_holiday
            and not is_telework
        ):
            if record.scheduled_workday is True or (
                record.scheduled_workday is None and record.status_upper == "ABSENT"
            ):
                if record.scheduled_workday is None:
                    record.missing_data_warnings.append("Employee schedule unavailable")
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

        can_evaluate_late = record.scheduled_start is not None or bool(record.late_arrival) or record.status_upper == "LATE"
        if can_evaluate_late and (late_minutes > 0 or bool(record.late_arrival)):
            if late_minutes <= 0:
                late_minutes = 10
            if late_minutes < 15:
                score = 0.35
            elif late_minutes <= 30:
                score = 0.55
            else:
                score = 0.90 if repeated_late >= 3 else 0.75
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.LATE_ARRIVAL,
                    score=score,
                    label="Retard d'arrivee",
                    description="Le pointage d'entree est apres l'heure planifiee et la tolerance.",
                    value=f"{late_minutes} min",
                    expected="Arrivee dans la tolerance",
                    recommendation="Verifier si le retard est justifie ou recurrent.",
                )
            )

        if self._is_missing_checkout(record):
            is_repeated = repeated_missing_checkout >= 2
            score = 0.93 if is_repeated else 0.78
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.REPEATED_MISSING_CHECKOUT if is_repeated else AnomalyCategory.MISSING_CHECKOUT,
                    score=score,
                    label="Sorties oubliees repetees" if is_repeated else "Sortie non pointee",
                    description=(
                        "Plusieurs sessions recentes ont une sortie manquante."
                        if is_repeated
                        else "Une entree existe mais aucune sortie valide n'est enregistree."
                    ),
                    value=(
                        f"{repeated_missing_checkout + 1} occurrences"
                        if is_repeated
                        else "Sortie manquante"
                    ),
                    expected="Pointage sortie apres chaque session",
                    recommendation=(
                        "Verifier la recurrence avec le collaborateur et corriger les sessions concernees."
                        if is_repeated
                        else "Demander au collaborateur de confirmer l'heure de sortie."
                    ),
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

        if (
            has_checkin
            and has_checkout
            and worked_minutes >= 12 * 60
            and overtime_minutes < OVERTIME_THRESHOLD_MINUTES
        ):
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.UNUSUAL_WORKING_HOURS,
                    score=0.84 if worked_minutes >= 14 * 60 else 0.74,
                    label="Duree de travail inhabituelle",
                    description="La duree travaillee est tres eloignee d'une journee normale.",
                    value=f"{worked_minutes} min",
                    expected="journee proche de l'horaire planifie",
                    recommendation="Verifier la duree reelle et le contexte de la journee.",
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

        if has_checkin and (
            (self._has_night_activity(record) and worked_minutes > 0 and worked_minutes < MIN_VALID_SESSION_MINUTES)
            or (self._has_night_activity(record) and self._is_missing_checkout(record))
            or (self._has_night_activity(record) and worked_minutes >= 12 * 60)
        ):
            signals.append(
                RuleSignal(
                    code=AnomalyCategory.SUSPICIOUS_POINTAGE,
                    score=0.93,
                    label="Pointage suspect",
                    description="Plusieurs signaux sensibles sont combines sur la meme session.",
                    value=self._night_value(record) or "Signal combine",
                    expected="Pointage coherent avec l'horaire et la duree attendue",
                    recommendation="Verifier rapidement si ce pointage est legitime ou frauduleux.",
                )
            )

        if record.date.weekday() >= 5 and has_checkin:
            if record.exceptional_work_allowed is True or record.scheduled_workday is True:
                pass
            else:
                score = 0.50 if record.scheduled_workday is False else 0.45
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
        if record.check_in is None or record.check_out is None:
            return None
        if record.status_upper in {"ABSENT", "ON_LEAVE", "LEAVE", "CONGE", "REMOTE", "HOLIDAY"}:
            return None
        usable_history = [item for item in history if item.check_in is not None and item is not record]
        if len(usable_history) < 5:
            return None
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
        if score < self.model.medium_threshold:
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
        if codes == {AnomalyCategory.MISSING_CHECKOUT}:
            return min(score, 0.89)
        if codes == {AnomalyCategory.UNUSUAL_WORKING_HOURS}:
            return min(score, 0.89)
        if AnomalyCategory.SUSPICIOUS_POINTAGE in codes:
            return max(score, 0.90)
        if AnomalyCategory.REPEATED_MISSING_CHECKOUT in codes:
            return max(score, 0.90)
        if primary.code == AnomalyCategory.ABSENCE:
            return max(score, 0.90)
        return score

    def _normal_record(
        self,
        record: AttendanceRecord,
        features: Any,
        *,
        ml_diagnostic: dict[str, Any] | None = None,
        debug: bool,
    ) -> AnomalyRecord:
        summary = "Aucune anomalie exploitable detectee."
        diagnostic = ml_diagnostic or {}
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
            ml_score=diagnostic.get("score"),
            ml_prediction=diagnostic.get("is_anomaly"),
            detection_source="NONE",
            model_version=self.model.model_version if self.model else None,
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
            is_weekend=record.date.weekday() >= 5,
            location=record.localisation,
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
    def _is_approved_telework(record: AttendanceRecord) -> bool:
        status = record.status_upper
        return bool(record.approved_telework) or status in {"REMOTE", "TELEWORK", "TELETRAVAIL"}

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
        return False

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

    def _history_count(
        self,
        history: list[AttendanceRecord],
        kind: str,
        *,
        current: AttendanceRecord | None = None,
    ) -> int:
        count = 0
        for item in history:
            if current is not None and self._same_record(item, current):
                continue
            features = self.feature_engineer.compute_features(item, [])
            if kind == "late" and (features.late_minutes > 0 or bool(item.late_arrival)):
                count += 1
            elif kind == "missing_checkout" and self._is_missing_checkout(item):
                count += 1
            elif kind == "rapid" and 0 < self._worked_minutes(item, features) < MIN_VALID_SESSION_MINUTES:
                count += 1
        return count

    @staticmethod
    def _same_record(left: AttendanceRecord, right: AttendanceRecord) -> bool:
        return (
            left.employee_id == right.employee_id
            and left.date == right.date
            and left.check_in == right.check_in
            and left.check_out == right.check_out
        )

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
            AnomalyCategory.LATE_ARRIVAL: "Retard d'arrivee",
            AnomalyCategory.LATE: "Retard d'arrivee",
            AnomalyCategory.MISSING_CHECKOUT: "Sortie non pointee",
            AnomalyCategory.REPEATED_MISSING_CHECKOUT: "Sorties oubliees repetees",
            AnomalyCategory.RAPID_SESSION: "Session tres courte",
            AnomalyCategory.OVERTIME_EXCESS: "Heures supplementaires elevees",
            AnomalyCategory.UNUSUAL_WORKING_HOURS: "Duree de travail inhabituelle",
            AnomalyCategory.NIGHT_ACTIVITY: "Activite nocturne",
            AnomalyCategory.WEEKEND_ACTIVITY: "Activite week-end",
            AnomalyCategory.HOLIDAY_ACTIVITY: "Activite jour ferie",
            AnomalyCategory.SUSPICIOUS_POINTAGE: "Pointage suspect",
            AnomalyCategory.BEHAVIORAL_ANOMALY: "Comportement inhabituel",
        }
        return titles.get(signal.code, signal.label)

    def _summary_for(self, record: AttendanceRecord, signal: RuleSignal, features: Any) -> str:
        worked_minutes = self._worked_minutes(record, features)
        if signal.code == AnomalyCategory.RAPID_SESSION:
            return f"{record.employee_name} a travaille seulement {worked_minutes} minutes."
        if signal.code == AnomalyCategory.ABSENCE:
            return f"{record.employee_name} n'a pas pointe sur un jour planifie."
        if signal.code in {AnomalyCategory.LATE, AnomalyCategory.LATE_ARRIVAL}:
            return f"{record.employee_name} est arrive avec {signal.value or 'un retard'}."
        if signal.code == AnomalyCategory.MISSING_CHECKOUT:
            return f"{record.employee_name} a une entree sans sortie enregistree."
        if signal.code == AnomalyCategory.REPEATED_MISSING_CHECKOUT:
            return f"{record.employee_name} a oublie plusieurs pointages de sortie recemment."
        if signal.code == AnomalyCategory.OVERTIME_EXCESS:
            return f"{record.employee_name} depasse l'horaire planifie de {signal.value or 'plusieurs minutes'}."
        if signal.code == AnomalyCategory.UNUSUAL_WORKING_HOURS:
            return f"{record.employee_name} a une duree de travail inhabituelle."
        if signal.code == AnomalyCategory.WEEKEND_ACTIVITY:
            return f"{record.employee_name} a pointe pendant le week-end."
        if signal.code == AnomalyCategory.HOLIDAY_ACTIVITY:
            return f"{record.employee_name} a pointe pendant un jour ferie."
        if signal.code == AnomalyCategory.NIGHT_ACTIVITY:
            return f"{record.employee_name} a pointe en dehors de la plage horaire habituelle."
        if signal.code == AnomalyCategory.SUSPICIOUS_POINTAGE:
            return f"{record.employee_name} presente un pointage suspect avec plusieurs signaux combines."
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
        result = await self._fetch_scope_result(
            endpoint=endpoint,
            mint_role=mint_role,
            scope=_scope_name_for_endpoint(endpoint),
            token=token,
            user_id=user_id,
            tenant_id=tenant_id,
        )
        return result.records, result.backend_ok

    async def _fetch_scope_result(
        self,
        *,
        endpoint: str,
        mint_role: str,
        scope: str,
        token: str | None,
        user_id: int,
        tenant_id: int | None,
    ) -> AttendanceFetchResult:
        payload = await self.backend.get(
            endpoint,
            token=token,
            user_id=user_id,
            role=mint_role,
            tenant_id=tenant_id,
        )
        backend_ok = _payload_backend_ok(payload)
        parsed = _team_status_to_parse_result(payload, today=date.today())
        if parsed.skipped_records:
            logger.warning(
                "presence parser skipped %d raw record(s) endpoint=%s reasons=%s",
                len(parsed.skipped_records),
                endpoint,
                [item.get("reason") for item in parsed.skipped_records[:5]],
            )
        logger.info(
            "presence fetch endpoint=%s scope=%s backend_ok=%s raw_records=%d parsed_records=%d source_path=%s",
            endpoint,
            scope,
            backend_ok,
            parsed.raw_records_count,
            len(parsed.records),
            parsed.source_path,
        )
        return AttendanceFetchResult(
            records=parsed.records,
            backend_ok=backend_ok,
            scope=scope,
            endpoint=endpoint,
            role=mint_role,
            raw_records_count=parsed.raw_records_count,
            parsed_records_count=len(parsed.records),
            skipped_records=parsed.skipped_records,
            source_path=parsed.source_path,
        )

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

    async def fetch_today_for_scope(
        self,
        token: str | None,
        user_id: int,
        tenant_id: int | None,
        scope_override: str | None = None,
    ) -> AttendanceFetchResult:
        """Fetch today's attendance from an explicit dashboard scope.

        Role-specific routes use this instead of relying on JWT inference so
        /anomalies/manager always hits the manager team endpoint, /rh always
        hits company, and /dashboard?scope=ADMIN hits global.
        """
        if scope_override:
            scope, endpoint, mint_role = _select_scope_override(scope_override)
        else:
            scope, endpoint, mint_role = select_scope(decode_jwt_roles(token))
        logger.info("fetching attendance scope=%s endpoint=%s", scope, endpoint)
        return await self._fetch_scope_result(
            endpoint=endpoint,
            mint_role=mint_role,
            scope=scope,
            token=token,
            user_id=user_id,
            tenant_id=tenant_id,
        )

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

    def _merge_duplicate_anomalies(self, anomalies: list[AnomalyRecord]) -> list[AnomalyRecord]:
        """Merge duplicate cards for the dashboard view.

        The card surface is intentionally one employee/day entry. When the
        same employee/day is represented by duplicate presence rows, keep the
        highest-score anomaly as the primary card and fold the other business
        reasons into it.
        """
        merged: dict[tuple[int, str], AnomalyRecord] = {}
        for anomaly in anomalies:
            key = (anomaly.employee_id, anomaly.date)
            current = merged.get(key)
            if current is None:
                merged[key] = anomaly
                continue
            merged[key] = self._merge_anomaly_pair(current, anomaly)
        return list(merged.values())

    def _merge_anomaly_pair(self, left: AnomalyRecord, right: AnomalyRecord) -> AnomalyRecord:
        primary, secondary = (left, right) if left.score >= right.score else (right, left)
        primary.score = max(float(left.score or 0), float(right.score or 0))
        primary.risk = self._score_to_risk(primary.score)
        primary.severity = primary.risk
        primary.reasons = _unique_strings([*left.reasons, *right.reasons])
        primary.detected_reasons = _unique_detected_reasons([
            *left.detected_reasons,
            *right.detected_reasons,
        ])
        primary.missing_data_warnings = _unique_strings([
            *left.missing_data_warnings,
            *right.missing_data_warnings,
        ])
        primary.actions = _unique_strings([*left.actions, *right.actions])
        if not primary.attendance_snapshot:
            primary.attendance_snapshot = secondary.attendance_snapshot
        if secondary.summary and secondary.summary != primary.summary:
            primary.summary = _join_distinct(primary.summary, secondary.summary)
        if secondary.explanation and secondary.explanation != primary.explanation:
            primary.explanation = _join_distinct(primary.explanation, secondary.explanation)
        if secondary.recommendation and secondary.recommendation != primary.recommendation:
            primary.recommendation = _join_distinct(primary.recommendation, secondary.recommendation)
        if secondary.features:
            primary.features = {**secondary.features, **primary.features}
        return primary

    def _build_dashboard(self, anomalies: list[AnomalyRecord]) -> AnomalyDashboardResponse:
        anomalies = [a for a in anomalies if not (a.id and a.id in self._ignored_anomaly_ids)]
        counts = {RiskLevel.CRITICAL: 0, RiskLevel.HIGH: 0, RiskLevel.MEDIUM: 0, RiskLevel.LOW: 0}
        by_category: dict[str, int] = {}
        by_day: dict[str, int] = {}
        for a in anomalies:
            counts[a.risk] += 1
            category = _category_value(a.category)
            by_category[category] = by_category.get(category, 0) + 1
            by_day[a.date] = by_day.get(a.date, 0) + 1
        by_risk = {level.value: counts[level] for level in counts}
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
            returned_anomalies_count=len(anomalies),
            anomalies_count=len(anomalies),
            grouped_by_severity=by_risk,
            grouped_by_category=by_category,
            by_risk=by_risk,
            by_type=by_category,
            by_day=by_day,
            top_anomalies=anomalies[:5],
            date_used=date.today().isoformat(),
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


def _unique_strings(values: Iterable[Any]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        output.append(text)
    return output


def _unique_detected_reasons(values: Iterable[DetectedReason]) -> list[DetectedReason]:
    output: list[DetectedReason] = []
    seen: set[tuple[str, str, str, str, str]] = set()
    for reason in values:
        key = (
            str(reason.code or ""),
            str(reason.label or ""),
            str(reason.description or ""),
            str(reason.value or ""),
            str(reason.expected or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        output.append(reason)
    return output


def _join_distinct(*values: str | None) -> str:
    return " ".join(_unique_strings(values))


def get_detector() -> AnomalyDetector:
    global _detector
    if _detector is None:
        _detector = AnomalyDetector()
    return _detector


def _category_value(category: Any) -> str:
    if isinstance(category, AnomalyCategory):
        return category.value
    return str(category or "")


def _select_scope_override(scope_override: str) -> tuple[str, str, str]:
    normalized = scope_override.strip().upper()
    if normalized in {"ADMIN", "GLOBAL"}:
        return "GLOBAL", "presence/global/today", "ADMIN"
    if normalized in {"RH", "COMPANY", "HR"}:
        return "COMPANY", "presence/company/today", "RH"
    if normalized in {"MANAGER", "TEAM"}:
        return "TEAM", "presence/team/today", "MANAGER"
    return select_scope([normalized])


def _scope_name_for_endpoint(endpoint: str) -> str:
    if "global" in endpoint:
        return "GLOBAL"
    if "team" in endpoint or "manager" in endpoint:
        return "TEAM"
    return "COMPANY"


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


_MEMBER_COLLECTION_KEYS = ("members", "presences", "sessions", "items", "records", "content", "results")


def _extract_members(payload: Any) -> list[dict[str, Any]]:
    raw_members, _ = _extract_members_with_source(payload)
    return [m for m in raw_members if isinstance(m, dict)]


def _extract_members_with_source(payload: Any) -> tuple[list[Any], str | None]:
    """Pull the attendance list out of the Spring shapes seen in production."""
    if isinstance(payload, list):
        return payload, "$"
    if not isinstance(payload, dict):
        return [], None
    if payload.get("success") is False or payload.get("error"):
        return [], None
    return _find_member_collection(payload, "$")


def _find_member_collection(value: Any, path: str, depth: int = 0) -> tuple[list[Any], str | None]:
    if depth > 6:
        return [], None
    if isinstance(value, list):
        return value, path
    if not isinstance(value, dict):
        return [], None

    data = value.get("data")
    if isinstance(data, (dict, list)):
        members, source = _find_member_collection(data, f"{path}.data", depth + 1)
        if source is not None:
            return members, source

    for key in _MEMBER_COLLECTION_KEYS:
        child = value.get(key)
        if isinstance(child, list):
            return child, f"{path}.{key}"

    if _looks_like_attendance_row(value):
        return [value], path

    for key in ("payload", "result", "body", "page"):
        child = value.get(key)
        if isinstance(child, (dict, list)):
            members, source = _find_member_collection(child, f"{path}.{key}", depth + 1)
            if source is not None:
                return members, source

    return [], None


def _looks_like_attendance_row(row: dict[str, Any]) -> bool:
    id_keys = {"utilisateurId", "employeeId", "userId", "id", "collaborateurId", "utilisateur"}
    pointage_keys = {
        "heureEntree",
        "checkInTime",
        "checkIn",
        "check_in",
        "heureSortie",
        "checkOutTime",
        "checkOut",
        "check_out",
        "status",
        "dailyStatus",
        "presenceStatus",
    }
    return bool(id_keys & row.keys()) and bool(pointage_keys & row.keys())


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


def _nested_first_present(row: dict[str, Any], containers: tuple[str, ...], *keys: str) -> Any:
    for container in containers:
        child = row.get(container)
        if isinstance(child, dict):
            value = _first_present(child, *keys)
            if value is not None:
                return value
    return None


def _string_first_present(row: dict[str, Any], *keys: str) -> str | None:
    value = _first_present(row, *keys)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _member_user_id(row: dict[str, Any]) -> int | None:
    direct = _first_present(row, "utilisateurId", "employeeId", "userId", "id", "collaborateurId")
    nested = _nested_first_present(row, ("utilisateur", "employee", "user", "collaborateur"), "id", "userId")
    return _member_int(direct if direct is not None else nested)


def _member_name(row: dict[str, Any], user_id: int) -> str:
    direct = _first_present(row, "nomComplet", "fullName", "employeeName", "name", "displayName")
    if direct:
        return str(direct)
    for container in ("utilisateur", "employee", "user", "collaborateur"):
        child = row.get(container)
        if isinstance(child, dict):
            nested = _first_present(child, "nomComplet", "fullName", "employeeName", "name", "displayName")
            if nested:
                return str(nested)
            first = child.get("prenom") or child.get("firstName") or ""
            last = child.get("nom") or child.get("lastName") or ""
            joined = f"{first} {last}".strip()
            if joined:
                return joined
    joined = f"{row.get('prenom', '') or ''} {row.get('nom', '') or ''}".strip()
    return joined or f"Employe #{user_id}"


def _parse_date_value(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        if "T" in text or " " in text:
            return datetime.fromisoformat(text.rstrip("Z")).date()
        return date.fromisoformat(text[:10])
    except (ValueError, TypeError):
        return None


def _record_date_from_member(row: dict[str, Any], fallback: date) -> date:
    for key in ("date", "localDate", "attendanceDate", "sessionDate", "pointageDate", "jour", "day", "presenceDate"):
        parsed = _parse_date_value(row.get(key))
        if parsed is not None:
            return parsed
    for key in ("heureEntree", "checkInTime", "checkIn", "check_in", "heureSortie", "checkOutTime", "checkOut", "check_out"):
        parsed_dt = _parse_iso_dt(row.get(key))
        if parsed_dt is not None:
            return parsed_dt.date()
    return fallback


def _duration_seconds(row: dict[str, Any], worked_minutes: int | None) -> int | None:
    raw_seconds = _first_present(row, "durationSeconds", "duration_seconds", "workedSeconds", "worked_seconds")
    parsed_seconds = _member_int(raw_seconds)
    if parsed_seconds is not None:
        return parsed_seconds

    raw_duration = _first_present(row, "duration")
    parsed_duration = _member_int(raw_duration)
    if parsed_duration is not None:
        return parsed_duration
    if isinstance(raw_duration, str) and ":" in raw_duration:
        parts = raw_duration.split(":")
        try:
            if len(parts) == 3:
                hours, minutes, seconds = (int(part) for part in parts)
                return hours * 3600 + minutes * 60 + seconds
            if len(parts) == 2:
                hours, minutes = (int(part) for part in parts)
                return hours * 3600 + minutes * 60
        except ValueError:
            pass

    hours = row.get("totalHeuresTravaillees")
    if isinstance(hours, (int, float)):
        return int(hours * 3600)
    if worked_minutes is not None:
        return worked_minutes * 60
    return None


def _location_label(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            address = value.get("address") or value.get("adresse")
            city = value.get("city") or value.get("ville")
            country = value.get("country") or value.get("pays")
            region = value.get("region")
            city_country = ", ".join(str(part).strip() for part in (city, country) if str(part or "").strip())
            for candidate in (address, city_country, city, country, region):
                if candidate and str(candidate).strip():
                    return str(candidate).strip()
    return None


def _team_status_to_records(payload: dict[str, Any], today: date) -> list[AttendanceRecord]:
    return _team_status_to_parse_result(payload, today).records


def _team_status_to_parse_result(payload: Any, today: date) -> ParsedPresencePayload:
    raw_members, source_path = _extract_members_with_source(payload)
    records: list[AttendanceRecord] = []
    skipped_records: list[dict[str, Any]] = []
    for index, raw_member in enumerate(raw_members):
        if not isinstance(raw_member, dict):
            skipped_records.append({"index": index, "reason": "not_an_object", "type": type(raw_member).__name__})
            continue

        m = raw_member
        user_id = _member_user_id(m)
        if user_id is None:
            skipped_records.append({
                "index": index,
                "reason": "missing_employee_id",
                "keys": list(m.keys())[:12],
            })
            continue

        record_date = _record_date_from_member(m, today)
        check_in = _parse_iso_dt(
            _first_present(m, "heureEntree", "checkInTime", "checkIn", "check_in", "entryTime", "startTime", "startedAt"),
            record_date,
        )
        check_out = _parse_iso_dt(
            _first_present(m, "heureSortie", "checkOutTime", "checkOut", "check_out", "exitTime", "endTime", "endedAt"),
            record_date,
        )
        worked_minutes = _member_int(
            _first_present(
                m,
                "workedMinutes",
                "minutesTravaillees",
                "worked_minutes",
                "dureeMinutes",
                "durationMinutes",
            )
        )
        expected_minutes = _member_int(
            _first_present(m, "expectedMinutes", "minutesAttendues", "plannedMinutes", "expected_minutes")
        )
        scheduled_start = _parse_time_value(
            _first_present(m, "scheduledStart", "horaireDebut", "plannedStart", "heureDebut")
        )
        scheduled_end = _parse_time_value(
            _first_present(m, "scheduledEnd", "horaireFin", "plannedEnd", "heureFin")
        )
        scheduled_workday = _boolish(
            _first_present(m, "scheduledWorkday", "workingDay", "isWorkingDay", "jourTravaille")
        )
        if scheduled_workday is None and expected_minutes is not None:
            scheduled_workday = expected_minutes > 0
        approved_leave = _boolish(
            _first_present(m, "approvedLeave", "onApprovedLeave", "onLeave", "isOnLeave")
        )
        approved_telework = _boolish(
            _first_present(m, "approvedTelework", "onApprovedTelework", "telework", "remoteApproved", "isRemote")
        )
        holiday = _boolish(
            _first_present(m, "holiday", "publicHoliday", "isHoliday", "jourFerie")
        )
        status = m.get("dailyStatus") or m.get("status") or m.get("presenceStatus")
        closure_reason = str(
            _first_present(m, "latestAlert", "autoClosedReason", "closureReason") or ""
        ).upper()
        if closure_reason == "MISSING_CHECKOUT":
            status = "MISSING_CHECKOUT"
        status_upper = str(status or "").upper()
        if approved_leave is None and status_upper in {"ON_LEAVE", "LEAVE", "CONGE", "APPROVED_LEAVE"}:
            approved_leave = True
        if approved_telework is None and status_upper in {"REMOTE", "TELEWORK", "TELETRAVAIL"}:
            approved_telework = True
        if holiday is None and status_upper in {"HOLIDAY", "PUBLIC_HOLIDAY", "JOUR_FERIE"}:
            holiday = True

        missing_warnings: list[str] = []
        if scheduled_start is None or scheduled_end is None or expected_minutes is None:
            missing_warnings.append("Schedule data unavailable")
        if approved_leave is None:
            missing_warnings.append("Approved leave flag unavailable")
        if approved_telework is None:
            missing_warnings.append("Approved telework flag unavailable")
        if holiday is None:
            missing_warnings.append("Holiday flag unavailable")
        if closure_reason == "MISSING_CHECKOUT":
            missing_warnings.append("Session auto-closed after missing checkout")

        team_id = _member_int(_first_present(m, "teamId", "equipeId", "team_id"))
        team_name = _string_first_present(m, "teamName", "equipe", "equipeName", "team", "teamLabel")
        department_id = _member_int(
            _first_present(m, "departmentId", "departementId", "department_id", "departement_id")
        ) or team_id
        department_name = _string_first_present(
            m,
            "departmentName",
            "departementName",
            "department",
            "departement",
            "serviceName",
            "service",
        ) or team_name
        entreprise_id = _member_int(_first_present(m, "entrepriseId", "enterpriseId", "companyId"))
        entreprise_name = _string_first_present(
            m,
            "entreprise",
            "entrepriseName",
            "enterpriseName",
            "companyName",
            "company",
        )

        records.append(
            AttendanceRecord(
                employee_id=user_id,
                employee_name=_member_name(m, user_id),
                date=record_date,
                check_in=check_in,
                check_out=check_out,
                duration_seconds=_duration_seconds(m, worked_minutes),
                expected_minutes=expected_minutes,
                worked_minutes=worked_minutes,
                overtime_minutes=_member_int(
                    _first_present(m, "overtimeMinutes", "overtimePreview", "heuresSupplementairesMinutes", "overtime_minutes")
                ),
                scheduled_start=scheduled_start,
                scheduled_end=scheduled_end,
                scheduled_workday=scheduled_workday,
                approved_leave=approved_leave,
                approved_telework=approved_telework,
                holiday=holiday,
                exceptional_work_allowed=_boolish(
                    _first_present(m, "exceptionalWorkAllowed", "holidayWorkAllowed", "weekendWorkAllowed")
                ),
                daily_status=status,
                late_arrival=_boolish(_first_present(m, "lateArrival", "retard", "isLate", "late")),
                entreprise_id=entreprise_id,
                entreprise_name=entreprise_name,
                manager_id=_member_int(_first_present(m, "managerId", "manager_id", "responsableId")),
                team_id=team_id,
                team_name=team_name,
                department_id=department_id,
                department_name=department_name,
                source=m.get("source"),
                localisation=_location_label(
                    m.get("localisation"),
                    m.get("checkInLocation"),
                    m.get("checkInLocationDetails"),
                    m.get("checkOutLocation"),
                    m.get("checkOutLocationDetails"),
                ),
                missing_data_warnings=missing_warnings,
            )
        )
    logger.info(
        "parsed %d/%d attendance record(s) from presence payload source=%s",
        len(records),
        len(raw_members),
        source_path,
    )
    return ParsedPresencePayload(
        records=records,
        raw_records_count=len(raw_members),
        skipped_records=skipped_records,
        source_path=source_path,
    )
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
                localisation=_location_label(
                    m.get("localisation"),
                    m.get("checkInLocation"),
                    m.get("checkInLocationDetails"),
                    m.get("checkOutLocation"),
                    m.get("checkOutLocationDetails"),
                ),
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
        team_id = _member_int(_first_present(row, "teamId", "equipeId", "team_id"))
        team_name = _string_first_present(row, "teamName", "equipe", "equipeName", "team", "teamLabel")
        department_id = _member_int(
            _first_present(row, "departmentId", "departementId", "department_id", "departement_id")
        ) or team_id
        department_name = _string_first_present(
            row,
            "departmentName",
            "departementName",
            "department",
            "departement",
            "serviceName",
            "service",
        ) or team_name
        entreprise_id = _member_int(_first_present(row, "entrepriseId", "enterpriseId", "companyId"))
        entreprise_name = _string_first_present(
            row,
            "entreprise",
            "entrepriseName",
            "enterpriseName",
            "companyName",
            "company",
        )
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
                entreprise_id=entreprise_id,
                entreprise_name=entreprise_name,
                manager_id=_member_int(_first_present(row, "managerId", "manager_id", "responsableId")),
                team_id=team_id,
                team_name=team_name,
                department_id=department_id,
                department_name=department_name,
                source=row.get("source"),
                localisation=_location_label(
                    row.get("localisation"),
                    row.get("checkInLocation"),
                    row.get("checkInLocationDetails"),
                    row.get("checkOutLocation"),
                    row.get("checkOutLocationDetails"),
                ),
            )
        )
    return records
