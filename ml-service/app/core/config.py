"""ML service configuration. Mirrors the env-driven Settings pattern used by ai-service."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Service identity
    app_name: str = "WeenTime ML Service"
    version: str = "1.0.0"
    app_env: str = "development"
    log_level: str = "INFO"
    host: str = "0.0.0.0"
    port: int = 8001
    debug: bool = False

    # Filesystem
    base_dir: Path = Field(default_factory=lambda: Path(__file__).resolve().parent.parent.parent)
    model_dir: str = "storage/models"
    training_data_dir: str = "storage/training_data"

    # WeenTime Spring backend (via gateway)
    backend_url: str = "http://localhost:8222"
    backend_api_prefix: str = "/api/v1"
    backend_jwt_secret: str = (
        "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"
    )
    backend_timeout_seconds: float = 15.0
    # Token issuer config -- matches Spring jwt.expirationMs and jwt.* claim shape.
    backend_jwt_issuer: str = "weentime-ml"
    backend_jwt_ttl_seconds: int = 600
    # entrepriseId claim stamped on the minted service token. Spring scopes the
    # RH company query by this tenant; without it the minted token resolves to
    # no entreprise and /presence/company/today returns an empty overview.
    service_entreprise_id: int | None = None

    # Optional direct DB connection (defaults to presence-service postgres on 5433).
    database_url: str = (
        "postgresql://weentime:170502@localhost:5433/presence_db"
    )

    # CORS -- Angular dev server + ai-service.
    cors_origins_raw: str = Field(
        default="http://localhost:4200,http://127.0.0.1:4200,http://localhost:8000",
        alias="CORS_ORIGINS",
    )

    # Model training/eval
    contamination: float = 0.05
    min_training_records: int = 100
    isolation_forest_n_estimators: int = 200
    random_state: int = 42

    # Score -> risk level thresholds
    critical_threshold: float = 0.85
    high_threshold: float = 0.70
    medium_threshold: float = 0.50

    @property
    def cors_origins(self) -> list[str]:
        return _split_csv(self.cors_origins_raw) or [
            "http://localhost:4200",
            "http://127.0.0.1:4200",
        ]

    @property
    def model_dir_path(self) -> Path:
        return (self.base_dir / self.model_dir).resolve()

    @property
    def training_data_dir_path(self) -> Path:
        return (self.base_dir / self.training_data_dir).resolve()

    @property
    def backend_base_url(self) -> str:
        return f"{self.backend_url.rstrip('/')}{self.backend_api_prefix}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.model_dir_path.mkdir(parents=True, exist_ok=True)
    settings.training_data_dir_path.mkdir(parents=True, exist_ok=True)
    return settings
