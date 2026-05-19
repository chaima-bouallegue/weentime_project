"""WeenTime ML Service FastAPI entry point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes.anomaly_routes import router as anomaly_router
from app.api.v1.routes.health_routes import router as health_router
from app.approval_ai.routes.approval_routes import router as approval_router
from app.core.config import get_settings
from app.inference.anomaly_detector import get_detector

logger = logging.getLogger(__name__)


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("starting %s on port %d", settings.app_name, settings.port)
    try:
        await get_detector().initialize()
    except Exception:  # pragma: no cover - startup robustness
        logger.exception("detector initialization failed -- continuing in degraded mode")
    yield
    logger.info("shutting down %s", settings.app_name)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router, prefix="/api/ml")
    app.include_router(anomaly_router)
    app.include_router(approval_router)

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"service": settings.app_name, "version": settings.version}

    return app


app = create_app()
