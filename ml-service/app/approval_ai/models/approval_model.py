"""Approval recommendation model.

Phase 1: LogisticRegression (explainable, fast, small-data friendly).
The interface (train/predict/predict_batch/save/load) is stable so a future
XGBoost/CatBoost swap needs no caller changes. A rule-based fallback keeps the
service useful before the first training run.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from app.approval_ai.features.approval_features import APPROVAL_FEATURE_NAMES

logger = logging.getLogger(__name__)

# Index of features the heuristic fallback inspects (must match
# APPROVAL_FEATURE_NAMES order).
_IDX_TEAM_COVERAGE = APPROVAL_FEATURE_NAMES.index("team_coverage_ratio")
_IDX_CRITICAL_ABSENT = APPROVAL_FEATURE_NAMES.index("critical_employees_absent")
_IDX_CRITICAL_PERIOD = APPROVAL_FEATURE_NAMES.index("is_critical_period")

APPROVE_THRESHOLD = 0.70
REJECT_THRESHOLD = 0.35


class ApprovalModel:
    def __init__(self) -> None:
        self.model: LogisticRegression | None = None
        self.scaler: StandardScaler | None = None
        self.model_version: str | None = None
        self.feature_names: tuple[str, ...] = APPROVAL_FEATURE_NAMES

    @property
    def is_ready(self) -> bool:
        return self.model is not None and self.scaler is not None

    # -- training ---------------------------------------------------------

    def train(self, X: np.ndarray, y: np.ndarray) -> dict[str, Any]:
        """y: 1 = APPROVE, 0 = REJECT."""
        if X.size == 0:
            raise ValueError("empty training matrix")
        self.scaler = StandardScaler().fit(X)
        X_scaled = self.scaler.transform(X)
        self.model = LogisticRegression(
            random_state=42,
            max_iter=1000,
            class_weight="balanced",
        ).fit(X_scaled, y)
        self.model_version = time.strftime("v%Y%m%d_%H%M%S")
        accuracy = float(self.model.score(X_scaled, y))
        logger.info("approval model trained version=%s accuracy=%.3f rows=%d", self.model_version, accuracy, len(y))
        return {"accuracy": accuracy, "model_version": self.model_version}

    # -- inference --------------------------------------------------------

    def predict(self, features: np.ndarray) -> dict[str, Any]:
        if not self.is_ready or self.model is None or self.scaler is None:
            return self._fallback_rules(features)

        X_scaled = self.scaler.transform(features.reshape(1, -1))
        proba = self.model.predict_proba(X_scaled)[0]
        # proba[1] is P(approve) -- classes_ is [0, 1] after fit on {0,1}.
        approve_proba = float(proba[list(self.model.classes_).index(1)]) if 1 in self.model.classes_ else float(proba[-1])
        confidence = float(max(proba))
        return {
            "recommendation": self._map_recommendation(approve_proba),
            "confidence": confidence,
            "risk_score": float(1.0 - approve_proba),
            "approve_probability": approve_proba,
            "fallback": False,
        }

    def predict_batch(self, features_matrix: np.ndarray) -> list[dict[str, Any]]:
        return [self.predict(row) for row in features_matrix]

    @staticmethod
    def _map_recommendation(approve_proba: float) -> str:
        if approve_proba >= APPROVE_THRESHOLD:
            return "APPROVE"
        if approve_proba <= REJECT_THRESHOLD:
            return "REJECT"
        return "REVIEW"

    def _fallback_rules(self, features: np.ndarray) -> dict[str, Any]:
        """Heuristic decision used until a model is trained."""
        flat = features.reshape(-1)
        team_coverage = float(flat[_IDX_TEAM_COVERAGE])
        critical_absent = float(flat[_IDX_CRITICAL_ABSENT])
        critical_period = float(flat[_IDX_CRITICAL_PERIOD])

        risk = 0.0
        if team_coverage < 0.5:
            risk += 0.4
        if critical_absent > 0:
            risk += 0.3
        if critical_period >= 1:
            risk += 0.3
        risk = min(risk, 0.95)

        if risk > 0.6:
            recommendation = "REJECT"
        elif risk > 0.4:
            recommendation = "REVIEW"
        else:
            recommendation = "APPROVE"

        return {
            "recommendation": recommendation,
            "confidence": 0.60,  # moderate confidence for rules
            "risk_score": float(risk),
            "approve_probability": float(1.0 - risk),
            "fallback": True,
        }

    # -- persistence ------------------------------------------------------

    def save(self, model_dir: Path) -> str:
        if not self.is_ready or self.model_version is None:
            raise RuntimeError("nothing to save")
        model_dir.mkdir(parents=True, exist_ok=True)
        bundle_path = model_dir / f"approval_model_{self.model_version}.joblib"
        joblib.dump(
            {
                "model": self.model,
                "scaler": self.scaler,
                "feature_names": list(self.feature_names),
                "model_version": self.model_version,
            },
            bundle_path,
        )
        (model_dir / f"approval_model_metadata_{self.model_version}.json").write_text(
            json.dumps(
                {
                    "model_version": self.model_version,
                    "feature_names": list(self.feature_names),
                    "approve_threshold": APPROVE_THRESHOLD,
                    "reject_threshold": REJECT_THRESHOLD,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return str(bundle_path)

    def load(self, bundle_path: Path) -> None:
        bundle = joblib.load(bundle_path)
        self.model = bundle["model"]
        self.scaler = bundle["scaler"]
        self.feature_names = tuple(bundle["feature_names"])
        self.model_version = bundle["model_version"]

    @classmethod
    def load_latest(cls, model_dir: Path) -> "ApprovalModel | None":
        candidates = sorted(model_dir.glob("approval_model_v*.joblib"), reverse=True)
        if not candidates:
            return None
        instance = cls()
        instance.load(candidates[0])
        logger.info("loaded approval model %s", instance.model_version)
        return instance
