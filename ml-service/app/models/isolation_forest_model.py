"""Isolation Forest wrapper for attendance anomaly detection.

Persistence layout under ``storage/models/``:
    isolation_forest_v<timestamp>.joblib   -- bundle: {model, scaler, feature_names, metadata}
    model_metadata_v<timestamp>.json       -- human-readable training summary

``load_latest()`` resolves the freshest bundle and is what the API server uses
at startup.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from app.features.attendance_features import FEATURE_NAMES
from app.schemas.anomaly_schemas import RiskLevel

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class TrainResult:
    model_version: str
    records_used: int
    contamination_observed: float
    duration_seconds: float
    bundle_path: str


class AttendanceAnomalyModel:
    """Isolation Forest + StandardScaler bundle. Holds risk-mapping policy too."""

    def __init__(
        self,
        contamination: float = 0.05,
        n_estimators: int = 200,
        random_state: int = 42,
        critical_threshold: float = 0.85,
        high_threshold: float = 0.70,
        medium_threshold: float = 0.50,
    ) -> None:
        self.contamination = contamination
        self.n_estimators = n_estimators
        self.random_state = random_state
        self.critical_threshold = critical_threshold
        self.high_threshold = high_threshold
        self.medium_threshold = medium_threshold

        self.model: IsolationForest | None = None
        self.scaler: StandardScaler | None = None
        self.feature_names: tuple[str, ...] = FEATURE_NAMES
        self.model_version: str | None = None
        # Reference range observed during training -- used to normalize
        # raw decision_function output into a 0..1 anomaly score.
        self._score_min: float = -0.5
        self._score_max: float = 0.5

    # -- training ---------------------------------------------------------

    def train(self, features_df: pd.DataFrame) -> TrainResult:
        if features_df.empty:
            raise ValueError("empty training frame")

        missing = [name for name in self.feature_names if name not in features_df.columns]
        if missing:
            raise ValueError(f"missing features in training data: {missing}")

        X = features_df[list(self.feature_names)].astype(float).to_numpy()

        started = time.time()
        self.scaler = StandardScaler().fit(X)
        X_scaled = self.scaler.transform(X)

        self.model = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1,
        ).fit(X_scaled)

        # Capture decision_function range so prediction can normalize.
        raw_scores = self.model.decision_function(X_scaled)
        self._score_min = float(np.percentile(raw_scores, 1))
        self._score_max = float(np.percentile(raw_scores, 99))

        # Observed contamination -- sanity check.
        predictions = self.model.predict(X_scaled)
        observed = float(np.mean(predictions == -1))

        self.model_version = time.strftime("v%Y%m%d_%H%M%S")
        duration = time.time() - started
        logger.info(
            "trained isolation forest version=%s rows=%d contamination_observed=%.3f duration=%.2fs",
            self.model_version,
            len(features_df),
            observed,
            duration,
        )

        return TrainResult(
            model_version=self.model_version,
            records_used=len(features_df),
            contamination_observed=observed,
            duration_seconds=duration,
            bundle_path="",  # filled by save()
        )

    # -- inference --------------------------------------------------------

    def predict(self, features: np.ndarray) -> dict[str, Any]:
        if self.model is None or self.scaler is None:
            raise RuntimeError("model not loaded")
        if features.ndim == 1:
            features = features.reshape(1, -1)
        X = self.scaler.transform(features)
        raw = float(self.model.decision_function(X)[0])
        is_anomaly = bool(self.model.predict(X)[0] == -1)
        score = self.get_anomaly_score(raw)
        return {
            "raw_score": raw,
            "score": score,
            "is_anomaly": is_anomaly,
            "risk": self.score_to_risk(score).value,
        }

    def predict_batch(self, features_df: pd.DataFrame) -> list[dict[str, Any]]:
        if self.model is None or self.scaler is None:
            raise RuntimeError("model not loaded")
        X = features_df[list(self.feature_names)].astype(float).to_numpy()
        X_scaled = self.scaler.transform(X)
        raw_scores = self.model.decision_function(X_scaled)
        predictions = self.model.predict(X_scaled)
        results: list[dict[str, Any]] = []
        for raw, pred in zip(raw_scores, predictions):
            score = self.get_anomaly_score(float(raw))
            results.append(
                {
                    "raw_score": float(raw),
                    "score": score,
                    "is_anomaly": bool(pred == -1),
                    "risk": self.score_to_risk(score).value,
                }
            )
        return results

    def get_anomaly_score(self, raw_score: float) -> float:
        """Map IsolationForest.decision_function to 0..1 where 1 = most anomalous.

        decision_function returns higher values for normal samples and lower
        (negative) values for anomalies. We invert and clip.
        """
        if self._score_max == self._score_min:
            return 0.0
        normalized = (self._score_max - raw_score) / (self._score_max - self._score_min)
        return float(max(0.0, min(1.0, normalized)))

    def score_to_risk(self, score: float) -> RiskLevel:
        if score >= self.critical_threshold:
            return RiskLevel.CRITICAL
        if score >= self.high_threshold:
            return RiskLevel.HIGH
        if score >= self.medium_threshold:
            return RiskLevel.MEDIUM
        return RiskLevel.LOW

    # -- explainability ---------------------------------------------------

    def generate_reasons(self, features: dict[str, Any], score: float) -> list[str]:
        """Human-readable reasons, ordered most→least severe.

        The generic "comportement atypique" line is a last resort -- it is only
        emitted when no concrete signal fired, so a scored row always carries a
        meaningful explanation when one exists.
        """
        reasons: list[str] = []

        arrival = float(features.get("arrival_hour", 0) or 0)
        departure = float(features.get("departure_hour", 0) or 0)
        worked = float(features.get("worked_hours", 0) or 0)
        late_min = float(features.get("late_minutes", 0) or 0)
        missing_checkout = int(features.get("missing_checkout", 0) or 0)
        deviation = float(features.get("deviation_from_usual", 0) or 0)
        weekly = float(features.get("weekly_hours", 0) or 0)
        is_weekend = int(features.get("is_weekend", 0) or 0)
        night = int(features.get("night_activity", 0) or 0)
        rapid = int(features.get("rapid_session", 0) or 0)
        is_late = int(features.get("is_late", 0) or 0)
        is_remote = int(features.get("is_remote", 0) or 0)

        # Night activity (high severity).
        if night and arrival > 0:
            reasons.append(f"Activité nocturne : check-in à {arrival:.1f}h")
        elif arrival > 22:
            reasons.append(f"Check-in très tardif : {arrival:.1f}h")

        # Lateness.
        if late_min >= 30:
            reasons.append(f"Retard important : {late_min:.0f} min après l'heure prévue")
        elif late_min > 0 or is_late:
            minutes = late_min if late_min > 0 else None
            reasons.append(
                "Retard" + (f" : {minutes:.0f} min" if minutes else " détecté sur l'arrivée")
            )

        # Missing checkout (suspicious — distinct from a clean absence).
        if missing_checkout:
            reasons.append("Sortie non pointée")

        # Session duration anomalies.
        if worked > 12:
            reasons.append(f"Durée inhabituelle : session de {worked:.1f}h")
        elif rapid or (0 < worked < 0.5 and not missing_checkout):
            reasons.append(f"Session très courte : {worked * 60:.0f} min")

        # Weekly overtime.
        if weekly > 55:
            reasons.append(f"Heures hebdomadaires excessives : {weekly:.1f}h")

        # Personal-baseline drift.
        if deviation > 3:
            reasons.append(f"Arrivée décalée de {deviation:.1f}h par rapport à l'habitude")

        # Weekend activity.
        if is_weekend and (worked > 0 or arrival > 0):
            reasons.append("Activité en week-end")

        # Unusual departure hour.
        if 0 < departure < 6:
            reasons.append(f"Sortie en heure inhabituelle : {departure:.1f}h")

        # Remote context (informational, only when paired with another signal).
        if is_remote and len(reasons) > 0:
            reasons.append("En télétravail")

        if not reasons:
            reasons.append(f"Comportement atypique détecté (score {score:.2f})")
        return reasons

    # -- persistence ------------------------------------------------------

    def save(self, model_dir: Path) -> str:
        if self.model is None or self.scaler is None or self.model_version is None:
            raise RuntimeError("nothing to save")
        model_dir.mkdir(parents=True, exist_ok=True)

        bundle_path = model_dir / f"isolation_forest_{self.model_version}.joblib"
        joblib.dump(
            {
                "model": self.model,
                "scaler": self.scaler,
                "feature_names": list(self.feature_names),
                "model_version": self.model_version,
                "contamination": self.contamination,
                "score_min": self._score_min,
                "score_max": self._score_max,
                "thresholds": {
                    "critical": self.critical_threshold,
                    "high": self.high_threshold,
                    "medium": self.medium_threshold,
                },
            },
            bundle_path,
        )

        metadata_path = model_dir / f"model_metadata_{self.model_version}.json"
        metadata_path.write_text(
            json.dumps(
                {
                    "model_version": self.model_version,
                    "n_estimators": self.n_estimators,
                    "contamination": self.contamination,
                    "feature_names": list(self.feature_names),
                    "score_range": [self._score_min, self._score_max],
                    "thresholds": {
                        "critical": self.critical_threshold,
                        "high": self.high_threshold,
                        "medium": self.medium_threshold,
                    },
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
        self.contamination = bundle.get("contamination", self.contamination)
        self._score_min = bundle.get("score_min", -0.5)
        self._score_max = bundle.get("score_max", 0.5)
        thresholds = bundle.get("thresholds", {})
        self.critical_threshold = thresholds.get("critical", self.critical_threshold)
        self.high_threshold = thresholds.get("high", self.high_threshold)
        self.medium_threshold = thresholds.get("medium", self.medium_threshold)

    @classmethod
    def load_latest(cls, model_dir: Path) -> "AttendanceAnomalyModel | None":
        candidates = sorted(model_dir.glob("isolation_forest_v*.joblib"), reverse=True)
        if not candidates:
            return None
        instance = cls()
        instance.load(candidates[0])
        logger.info("loaded model %s from %s", instance.model_version, candidates[0])
        return instance
