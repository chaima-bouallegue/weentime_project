"""Smart Approval model train/predict/persist tests."""
from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from app.approval_ai.features.approval_features import APPROVAL_FEATURE_NAMES, ApprovalFeatureEngineer
from app.approval_ai.models.approval_model import ApprovalModel
from app.approval_ai.training.generate_synthetic_approvals import generate
from app.approval_ai.training.train_approval_model import prepare_training_data


def test_synthetic_generator_shape_and_labels():
    df = generate(n_rows=400, seed=3)
    assert len(df) == 400
    assert set(df["approved"].unique()).issubset({0, 1})
    # Both classes must be present for a trainable dataset.
    assert df["approved"].nunique() == 2
    required = {"request_type", "team_size", "start_date", "end_date", "approved"}
    assert required.issubset(df.columns)


def test_prepare_training_data_dimensions():
    df = generate(n_rows=300, seed=5)
    X, y = prepare_training_data(df, reference=date.today())
    assert X.shape == (300, len(APPROVAL_FEATURE_NAMES))
    assert y.shape == (300,)


def test_model_trains_and_predicts_schema():
    df = generate(n_rows=800, seed=7)
    X, y = prepare_training_data(df, reference=date.today())
    model = ApprovalModel()
    metrics = model.train(X, y)
    assert 0.0 <= metrics["accuracy"] <= 1.0
    assert model.is_ready

    prediction = model.predict(X[0])
    assert set(prediction) >= {"recommendation", "confidence", "risk_score", "approve_probability"}
    assert prediction["recommendation"] in {"APPROVE", "REJECT", "REVIEW"}
    assert 0.0 <= prediction["confidence"] <= 1.0
    assert 0.0 <= prediction["risk_score"] <= 1.0
    assert prediction["fallback"] is False


def test_trained_model_separates_obvious_cases():
    df = generate(n_rows=2000, seed=11)
    X, y = prepare_training_data(df, reference=date.today())
    model = ApprovalModel()
    model.train(X, y)
    engineer = ApprovalFeatureEngineer()

    from app.approval_ai.schemas.approval_schemas import ApprovalAnalysisRequest, RequestType

    healthy = ApprovalAnalysisRequest(
        request_id=1, request_type=RequestType.CONGE, employee_id=1,
        start_date=date(2026, 6, 10), end_date=date(2026, 6, 11), duration_days=2,
        employee_seniority_months=60, team_size=12, team_members_absent_same_period=0,
        team_critical_employees_absent=0, absences_last_6_months=0,
        approved_requests_last_year=8, rejected_requests_last_year=0,
        is_critical_period=False, anomaly_score_last_30_days=0.1,
    )
    risky = ApprovalAnalysisRequest(
        request_id=2, request_type=RequestType.CONGE, employee_id=2,
        start_date=date(2026, 6, 10), end_date=date(2026, 6, 24), duration_days=15,
        employee_seniority_months=3, team_size=4, team_members_absent_same_period=3,
        team_critical_employees_absent=2, absences_last_6_months=10,
        approved_requests_last_year=0, rejected_requests_last_year=5,
        is_critical_period=True, anomaly_score_last_30_days=0.9,
    )
    healthy_p = model.predict(engineer.compute_features(healthy))["approve_probability"]
    risky_p = model.predict(engineer.compute_features(risky))["approve_probability"]
    assert healthy_p > risky_p


def test_save_and_load_roundtrip(tmp_path):
    df = generate(n_rows=600, seed=13)
    X, y = prepare_training_data(df, reference=date.today())
    model = ApprovalModel()
    model.train(X, y)
    bundle_path = model.save(tmp_path)
    assert bundle_path.endswith(".joblib")

    from pathlib import Path
    other = ApprovalModel()
    other.load(Path(bundle_path))
    assert other.model_version == model.model_version
    assert other.is_ready
    assert other.predict(X[0])["recommendation"] in {"APPROVE", "REJECT", "REVIEW"}


def test_untrained_model_uses_fallback():
    model = ApprovalModel()
    assert not model.is_ready
    # Build a minimal healthy feature vector.
    vector = np.zeros(len(APPROVAL_FEATURE_NAMES))
    vector[APPROVAL_FEATURE_NAMES.index("team_coverage_ratio")] = 1.0
    result = model.predict(vector)
    assert result["fallback"] is True
    assert result["recommendation"] == "APPROVE"
