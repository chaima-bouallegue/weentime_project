"""RandomForest model bundle for absence/leave forecasting."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

from app.features.forecast_features import FEATURE_NAMES


class AbsenceLeaveForecastModel:
    def __init__(
        self,
        regressor: RandomForestRegressor | None = None,
        classifier: RandomForestClassifier | None = None,
        *,
        model_version: str | None = None,
        metrics: dict[str, Any] | None = None,
    ) -> None:
        self.regressor = regressor
        self.classifier = classifier
        self.model_version = model_version or f"v{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        self.metrics = metrics or {}

    @property
    def is_ready(self) -> bool:
        return self.regressor is not None and self.classifier is not None

    def fit(
        self,
        features: pd.DataFrame,
        regression_targets: pd.DataFrame,
        risk_labels: list[str],
        *,
        random_state: int = 42,
    ) -> None:
        self.regressor = RandomForestRegressor(
            n_estimators=180,
            random_state=random_state,
            min_samples_leaf=2,
        )
        self.classifier = RandomForestClassifier(
            n_estimators=180,
            random_state=random_state,
            min_samples_leaf=2,
            class_weight="balanced",
        )
        self.regressor.fit(features[list(FEATURE_NAMES)], regression_targets)
        self.classifier.fit(features[list(FEATURE_NAMES)], risk_labels)

    def predict(self, features: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
        if not self.is_ready:
            raise RuntimeError("forecast_model_not_loaded")
        X = features[list(FEATURE_NAMES)]
        regression = np.asarray(self.regressor.predict(X), dtype=float)
        risks = [str(item) for item in self.classifier.predict(X)]
        return regression, risks

    def save(self, model_dir: Path) -> str:
        if not self.is_ready:
            raise RuntimeError("nothing_to_save")
        model_dir.mkdir(parents=True, exist_ok=True)
        bundle_path = model_dir / f"forecast_absence_leave_{self.model_version}.joblib"
        joblib.dump(
            {
                "regressor": self.regressor,
                "classifier": self.classifier,
                "feature_names": list(FEATURE_NAMES),
                "model_version": self.model_version,
                "metrics": self.metrics,
            },
            bundle_path,
        )
        metadata = {
            "modelVersion": self.model_version,
            "featureNames": list(FEATURE_NAMES),
            "metrics": self.metrics,
            "savedAt": datetime.now(timezone.utc).isoformat(),
        }
        (model_dir / f"forecast_absence_leave_metadata_{self.model_version}.json").write_text(
            json.dumps(metadata, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )
        return str(bundle_path)

    @classmethod
    def load_latest(cls, model_dir: Path) -> "AbsenceLeaveForecastModel | None":
        candidates = sorted(model_dir.glob("forecast_absence_leave_v*.joblib"), reverse=True)
        if not candidates:
            return None
        bundle = joblib.load(candidates[0])
        feature_names = tuple(bundle.get("feature_names") or ())
        if feature_names != FEATURE_NAMES:
            return None
        return cls(
            regressor=bundle.get("regressor"),
            classifier=bundle.get("classifier"),
            model_version=str(bundle.get("model_version") or candidates[0].stem),
            metrics=dict(bundle.get("metrics") or {}),
        )
