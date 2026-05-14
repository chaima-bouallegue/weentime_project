from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI
from fastapi.routing import APIRouter

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RouterSpec:
    name: str
    module_path: str
    attr: str = "router"
    critical: bool = True


@dataclass(frozen=True, slots=True)
class RouterRegistration:
    name: str
    module_path: str
    critical: bool
    status: str
    routes: int = 0
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "module_path": self.module_path,
            "critical": self.critical,
            "status": self.status,
            "routes": self.routes,
            "error": self.error,
        }


def register_routers(app: FastAPI, specs: list[RouterSpec]) -> list[RouterRegistration]:
    registrations = [include_router_from_spec(app, spec) for spec in specs]
    app.state.api_router_registrations = [registration.as_dict() for registration in registrations]
    return registrations


def include_router_from_spec(app: FastAPI, spec: RouterSpec) -> RouterRegistration:
    try:
        module = importlib.import_module(spec.module_path)
    except ModuleNotFoundError as exc:
        if not spec.critical and exc.name == spec.module_path:
            logger.warning("Optional API router unavailable: %s (%s)", spec.module_path, exc)
            return RouterRegistration(
                name=spec.name,
                module_path=spec.module_path,
                critical=False,
                status="skipped",
                error="module_not_found",
            )
        raise

    router = getattr(module, spec.attr, None)
    if not isinstance(router, APIRouter):
        message = f"{spec.module_path}.{spec.attr} is not a FastAPI APIRouter"
        if spec.critical:
            raise RuntimeError(message)
        logger.warning("Optional API router invalid: %s", message)
        return RouterRegistration(
            name=spec.name,
            module_path=spec.module_path,
            critical=False,
            status="skipped",
            error="invalid_router",
        )

    app.include_router(router)
    return RouterRegistration(
        name=spec.name,
        module_path=spec.module_path,
        critical=spec.critical,
        status="registered",
        routes=len(getattr(router, "routes", []) or []),
    )
