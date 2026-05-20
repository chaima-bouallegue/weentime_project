"""Smart Approval AI HTTP routes."""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter

from app.approval_ai.features.approval_features import ApprovalFeatureEngineer
from app.approval_ai.models.approval_model import ApprovalModel
from app.approval_ai.schemas.approval_schemas import (
    AiDecision,
    ApprovalAnalysisRequest,
    ApprovalAnalysisResponse,
    ApprovalHealthResponse,
    ApprovalTrainResponse,
)
from app.approval_ai.training.train_approval_model import train as train_approval
from app.core.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ml/approval", tags=["smart-approval"])


class ApprovalAnalyzer:
    """Singleton-ish analyzer: feature engineering + model + explanations."""

    def __init__(self) -> None:
        self.engineer = ApprovalFeatureEngineer()
        self.model = ApprovalModel()
        self._loaded = False

    def ensure_loaded(self) -> None:
        if self._loaded:
            return
        settings = get_settings()
        loaded = ApprovalModel.load_latest(settings.model_dir_path)
        if loaded is not None:
            self.model = loaded
        self._loaded = True

    def reload(self) -> None:
        self._loaded = False
        self.ensure_loaded()

    def analyze(self, request: ApprovalAnalysisRequest) -> ApprovalAnalysisResponse:
        self.ensure_loaded()
        features = self.engineer.compute_features(request)
        prediction = self.model.predict(features)
        risk_factors = self.engineer.generate_risk_factors(request)
        recommendation = AiDecision(prediction["recommendation"])
        explanation = _compose_explanation(recommendation, risk_factors, prediction)
        return ApprovalAnalysisResponse(
            request_id=request.request_id,
            request_type=request.request_type,
            employee_id=request.employee_id,
            employee_name=request.employee_name,
            recommendation=recommendation,
            confidence=prediction["confidence"],
            risk_score=prediction["risk_score"],
            risk_factors=risk_factors,
            explanation=explanation,
            team_coverage_after=self.engineer.team_coverage_after(request),
            model_version=self.model.model_version,
            features_used=self.engineer.feature_dict(request),
        )


_analyzer: ApprovalAnalyzer | None = None


def get_analyzer() -> ApprovalAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = ApprovalAnalyzer()
    return _analyzer


def _compose_explanation(recommendation: AiDecision, risk_factors, prediction) -> str:
    head = {
        AiDecision.APPROVE: "Recommandation : approuver.",
        AiDecision.REJECT: "Recommandation : refuser.",
        AiDecision.REVIEW: "Recommandation : revue humaine nécessaire.",
    }[recommendation]
    source = "règles heuristiques" if prediction.get("fallback") else "modèle entraîné"
    labels = [f.label for f in risk_factors if f.code != "NO_RISK"]
    if labels:
        body = " Facteurs : " + " ; ".join(labels[:3]) + "."
    else:
        body = " Aucun facteur de risque saillant."
    return f"{head} (confiance {int(prediction['confidence'] * 100)}%, via {source}).{body}"


@router.get("/health", response_model=ApprovalHealthResponse)
async def approval_health() -> ApprovalHealthResponse:
    analyzer = get_analyzer()
    analyzer.ensure_loaded()
    return ApprovalHealthResponse(
        success=True,
        status="ok",
        model_loaded=analyzer.model.is_ready,
        model_version=analyzer.model.model_version,
        fallback_active=not analyzer.model.is_ready,
    )


@router.post("/analyze", response_model=ApprovalAnalysisResponse)
async def analyze_request(request: ApprovalAnalysisRequest) -> ApprovalAnalysisResponse:
    return get_analyzer().analyze(request)


@router.post("/batch-analyze", response_model=list[ApprovalAnalysisResponse])
async def batch_analyze(requests: list[ApprovalAnalysisRequest]) -> list[ApprovalAnalysisResponse]:
    analyzer = get_analyzer()
    return [analyzer.analyze(r) for r in requests]


@router.post("/train", response_model=ApprovalTrainResponse)
async def train_approval_model() -> ApprovalTrainResponse:
    started = time.time()
    result = train_approval()
    get_analyzer().reload()
    return ApprovalTrainResponse(
        success=True,
        message=f"Approval model {result['model_version']} trained on {result['records_used']} records.",
        records_used=result["records_used"],
        model_version=result["model_version"],
        accuracy=result.get("accuracy"),
        training_duration_seconds=time.time() - started,
    )
