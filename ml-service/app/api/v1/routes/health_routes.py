"""Health endpoint -- liveness + model state."""
from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.inference.anomaly_detector import get_detector
from app.schemas.anomaly_schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    detector = get_detector()
    return HealthResponse(
        success=True,
        status="ok",
        model_loaded=detector.is_ready,
        model_version=detector.model.model_version if detector.is_ready and detector.model else None,
        version=settings.version,
    )
