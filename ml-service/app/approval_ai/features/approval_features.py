"""Feature engineering for Smart Approval AI.

The feature vector order is fixed by ``APPROVAL_FEATURE_NAMES`` and must not
change after a model is trained.
"""
from __future__ import annotations

from datetime import date

import numpy as np

from app.approval_ai.schemas.approval_schemas import (
    ApprovalAnalysisRequest,
    RequestType,
    RiskFactor,
    Severity,
)

APPROVAL_FEATURE_NAMES: tuple[str, ...] = (
    "duration_days",
    "request_type_encoded",
    "advance_notice_days",
    "seniority_months",
    "absences_last_6_months",
    "late_arrivals_last_30_days",
    "approval_rate_historical",
    "anomaly_score_recent",
    "team_coverage_ratio",
    "team_members_absent_same_period",
    "critical_employees_absent",
    "is_critical_period",
    "is_monday_or_friday",
    "is_summer_period",
    "days_until_period_end",
)

_TYPE_ENCODING = {RequestType.CONGE: 0, RequestType.TELETRAVAIL: 1, RequestType.AUTORISATION: 2}


def _team_coverage(req: ApprovalAnalysisRequest) -> float:
    present = req.team_size - req.team_members_absent_same_period
    return max(0.0, present / max(req.team_size, 1))


def _approval_rate(req: ApprovalAnalysisRequest) -> float:
    total = req.approved_requests_last_year + req.rejected_requests_last_year
    if total <= 0:
        return 0.5  # neutral prior when no history
    return req.approved_requests_last_year / total


def _advance_notice_days(req: ApprovalAnalysisRequest, today: date | None = None) -> int:
    reference = today or date.today()
    return max(0, (req.start_date - reference).days)


class ApprovalFeatureEngineer:
    """Turns an ``ApprovalAnalysisRequest`` into the model's numeric vector."""

    def compute_features(
        self,
        request: ApprovalAnalysisRequest,
        today: date | None = None,
    ) -> np.ndarray:
        team_coverage = _team_coverage(request)
        advance_notice = _advance_notice_days(request, today)
        approval_rate = _approval_rate(request)

        return np.array(
            [
                request.duration_days,
                _TYPE_ENCODING.get(request.request_type, 0),
                advance_notice,
                request.employee_seniority_months,
                request.absences_last_6_months,
                request.late_arrivals_last_30_days,
                approval_rate,
                request.anomaly_score_last_30_days or 0.0,
                team_coverage,
                request.team_members_absent_same_period,
                request.team_critical_employees_absent,
                1 if request.is_critical_period else 0,
                1 if request.start_date.weekday() in (0, 4) else 0,  # Mon / Fri
                1 if request.start_date.month in (7, 8) else 0,
                request.days_until_period_end,
            ],
            dtype=float,
        )

    def feature_dict(self, request: ApprovalAnalysisRequest, today: date | None = None) -> dict[str, float]:
        vector = self.compute_features(request, today)
        return {name: float(vector[i]) for i, name in enumerate(APPROVAL_FEATURE_NAMES)}

    def generate_risk_factors(self, request: ApprovalAnalysisRequest) -> list[RiskFactor]:
        factors: list[RiskFactor] = []
        team_coverage = _team_coverage(request)

        if team_coverage < 0.5:
            present = request.team_size - request.team_members_absent_same_period
            factors.append(
                RiskFactor(
                    code="TEAM_COVERAGE_LOW",
                    label=f"Couverture équipe insuffisante : {int(team_coverage * 100)}%",
                    severity=Severity.HIGH,
                    value=f"{present}/{request.team_size} membres",
                )
            )

        if request.team_critical_employees_absent > 0:
            factors.append(
                RiskFactor(
                    code="CRITICAL_EMPLOYEES_ABSENT",
                    label=f"{request.team_critical_employees_absent} employé(s) clé(s) déjà absent(s)",
                    severity=Severity.HIGH,
                )
            )

        if request.is_critical_period:
            factors.append(
                RiskFactor(
                    code="CRITICAL_PERIOD",
                    label="Période critique active (audit, sprint, deadline)",
                    severity=Severity.HIGH,
                )
            )

        if request.absences_last_6_months >= 5:
            factors.append(
                RiskFactor(
                    code="HIGH_ABSENCE_RATE",
                    label=f"Taux d'absence élevé : {request.absences_last_6_months} jours / 6 mois",
                    severity=Severity.MEDIUM,
                )
            )

        if request.duration_days >= 10:
            factors.append(
                RiskFactor(
                    code="LONG_DURATION",
                    label=f"Durée longue : {request.duration_days} jours",
                    severity=Severity.MEDIUM,
                )
            )

        anomaly = request.anomaly_score_last_30_days
        if anomaly is not None and anomaly >= 0.7:
            factors.append(
                RiskFactor(
                    code="ATTENDANCE_ANOMALY",
                    label="Comportement de présence anormal récent",
                    severity=Severity.MEDIUM,
                    value=f"Score IA : {int(anomaly * 100)}%",
                )
            )

        if not factors:
            factors.append(
                RiskFactor(
                    code="NO_RISK",
                    label="Aucun facteur de risque détecté",
                    severity=Severity.LOW,
                )
            )

        return factors

    def team_coverage_after(self, request: ApprovalAnalysisRequest) -> float:
        """Coverage if this request is ALSO approved (one more absent)."""
        present = request.team_size - request.team_members_absent_same_period - 1
        return max(0.0, present / max(request.team_size, 1))
