"""Smart Approval feature-engineering + fallback tests."""
from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from app.approval_ai.features.approval_features import (
    APPROVAL_FEATURE_NAMES,
    ApprovalFeatureEngineer,
)
from app.approval_ai.models.approval_model import ApprovalModel
from app.approval_ai.schemas.approval_schemas import ApprovalAnalysisRequest, RequestType


def _request(**overrides) -> ApprovalAnalysisRequest:
    base = dict(
        request_id=1,
        request_type=RequestType.CONGE,
        employee_id=1001,
        start_date=date(2026, 6, 15),  # a Monday
        end_date=date(2026, 6, 19),
        duration_days=5,
        employee_seniority_months=36,
        team_size=8,
        team_members_absent_same_period=1,
        team_critical_employees_absent=0,
        absences_last_6_months=2,
        late_arrivals_last_30_days=1,
        approved_requests_last_year=6,
        rejected_requests_last_year=1,
        is_critical_period=False,
        days_until_period_end=10,
        anomaly_score_last_30_days=0.2,
    )
    base.update(overrides)
    return ApprovalAnalysisRequest(**base)


def test_feature_vector_length_matches_names():
    engineer = ApprovalFeatureEngineer()
    vector = engineer.compute_features(_request(), today=date(2026, 6, 1))
    assert len(vector) == len(APPROVAL_FEATURE_NAMES)


def test_known_feature_values():
    engineer = ApprovalFeatureEngineer()
    req = _request()
    vector = engineer.compute_features(req, today=date(2026, 6, 1))
    fmap = dict(zip(APPROVAL_FEATURE_NAMES, vector))
    assert fmap["duration_days"] == 5
    assert fmap["request_type_encoded"] == 0  # CONGE
    assert fmap["advance_notice_days"] == 14  # 2026-06-15 minus 2026-06-01
    assert fmap["team_coverage_ratio"] == pytest.approx((8 - 1) / 8)
    assert fmap["is_monday_or_friday"] == 1  # 2026-06-15 is Monday
    assert fmap["is_summer_period"] == 0  # June, not Jul/Aug
    assert fmap["approval_rate_historical"] == pytest.approx(6 / 7)


def test_summer_and_friday_flags():
    engineer = ApprovalFeatureEngineer()
    # 2026-07-31 is a Friday in July.
    req = _request(start_date=date(2026, 7, 31), end_date=date(2026, 7, 31), duration_days=1)
    fmap = dict(zip(APPROVAL_FEATURE_NAMES, engineer.compute_features(req, today=date(2026, 7, 1))))
    assert fmap["is_summer_period"] == 1
    assert fmap["is_monday_or_friday"] == 1


def test_risk_factors_low_coverage_and_critical():
    engineer = ApprovalFeatureEngineer()
    req = _request(team_size=4, team_members_absent_same_period=3, team_critical_employees_absent=1, is_critical_period=True)
    codes = {f.code for f in engineer.generate_risk_factors(req)}
    assert "TEAM_COVERAGE_LOW" in codes
    assert "CRITICAL_EMPLOYEES_ABSENT" in codes
    assert "CRITICAL_PERIOD" in codes


def test_risk_factors_clean_request():
    engineer = ApprovalFeatureEngineer()
    factors = engineer.generate_risk_factors(_request())
    assert len(factors) == 1
    assert factors[0].code == "NO_RISK"


def test_team_coverage_after_decrements():
    engineer = ApprovalFeatureEngineer()
    req = _request(team_size=10, team_members_absent_same_period=2)
    # After approving this one: 10 - 2 - 1 = 7 present.
    assert engineer.team_coverage_after(req) == pytest.approx(0.7)


def test_fallback_rules_reject_on_low_coverage_and_critical():
    engineer = ApprovalFeatureEngineer()
    model = ApprovalModel()  # untrained -> fallback
    req = _request(team_size=4, team_members_absent_same_period=3, team_critical_employees_absent=1, is_critical_period=True)
    result = model.predict(engineer.compute_features(req))
    assert result["fallback"] is True
    assert result["recommendation"] == "REJECT"
    assert result["risk_score"] >= 0.6


def test_fallback_rules_approve_on_healthy_request():
    engineer = ApprovalFeatureEngineer()
    model = ApprovalModel()
    req = _request(team_size=10, team_members_absent_same_period=0, team_critical_employees_absent=0, is_critical_period=False)
    result = model.predict(engineer.compute_features(req))
    assert result["recommendation"] == "APPROVE"
