"""Endpoint tracing that records only aggregate, pseudonymized ML metadata."""
from __future__ import annotations

import inspect
import logging
import os
import random
import time
from collections import Counter
from functools import wraps
from typing import Any, Callable, Mapping, get_type_hints

from app.core.config import get_settings
from app.observability.braintrust_client import get_braintrust_logger
from app.observability.redaction import redact_value

logger = logging.getLogger(__name__)

EndpointResolver = str | Callable[[Mapping[str, Any]], str]

_SAFE_INPUT_KEYS = {
    "debug",
    "scope",
    "from_date",
    "to_date",
    "period",
    "start_date",
    "end_date",
    "page",
    "size",
    "risk",
    "category",
    "status_filter",
    "sort",
    "company_id",
    "entreprise_id",
    "department_id",
    "team_id",
    "employee_id",
}


def _safe_inputs(arguments: Mapping[str, Any]) -> dict[str, Any]:
    selected = {
        key: value
        for key, value in arguments.items()
        if key in _SAFE_INPUT_KEYS and value is not None
    }
    return redact_value(selected)


def _quality_summary(value: Any) -> dict[str, Any]:
    quality = getattr(value, "data_quality", None)
    if quality is None:
        return {}
    status = getattr(quality, "status", None)
    return {
        "data_quality": getattr(status, "value", status),
        "fallback_used": bool(getattr(quality, "fallback_used", False)),
        "historical_days": int(getattr(quality, "historical_days", 0) or 0),
        "source": str(getattr(quality, "source", "unknown")),
    }


def _risk_distribution(items: Any) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for item in items or []:
        risk = getattr(item, "risk_level", None) or getattr(item, "risk", None)
        normalized = getattr(risk, "value", risk)
        if normalized:
            counts[str(normalized)] += 1
    return dict(counts)


def summarize_output(endpoint: str, value: Any) -> dict[str, Any]:
    if endpoint == "/api/ml/anomalies/dashboard":
        return {
            "success": bool(getattr(value, "success", False)),
            "backend_status": str(getattr(value, "backend_status", "unknown")),
            "scope": getattr(value, "scope", None),
            "total_anomalies": int(getattr(value, "total_anomalies", 0) or 0),
            "critical": int(getattr(value, "critical", 0) or 0),
            "high": int(getattr(value, "high", 0) or 0),
            "medium": int(getattr(value, "medium", 0) or 0),
            "low": int(getattr(value, "low", 0) or 0),
            "raw_records_count": int(getattr(value, "raw_records_count", 0) or 0),
            "parsed_records_count": int(getattr(value, "parsed_records_count", 0) or 0),
        }
    if endpoint in {"/api/ml/anomalies/list", "/api/ml/anomalies/by-employee"}:
        summary = getattr(value, "summary", None)
        return {
            "success": bool(getattr(value, "success", False)),
            "backend_status": str(getattr(value, "backend_status", "unknown")),
            "total": int(getattr(value, "total", 0) or 0),
            "page": int(getattr(value, "page", 1) or 1),
            "size": int(getattr(value, "size", 0) or 0),
            "critical": int(getattr(summary, "critical", 0) or 0),
            "high": int(getattr(summary, "high", 0) or 0),
            "medium": int(getattr(summary, "medium", 0) or 0),
            "low": int(getattr(summary, "low", 0) or 0),
        }
    if endpoint == "/api/ml/forecast/dashboard":
        summary = getattr(value, "summary", None)
        return {
            "success": bool(getattr(value, "success", False)),
            "period": getattr(value, "period", None),
            "series_count": len(getattr(value, "series", []) or []),
            "team_count": len(getattr(value, "teams", []) or []),
            "predicted_absences": float(getattr(summary, "predicted_absences", 0.0) or 0.0),
            "predicted_leaves": float(getattr(summary, "predicted_leaves", 0.0) or 0.0),
            "predicted_presence_rate": float(
                getattr(summary, "predicted_presence_rate", 0.0) or 0.0
            ),
            "risk_level": getattr(getattr(summary, "risk_level", None), "value", None),
            **_quality_summary(value),
        }
    if endpoint in {"/api/ml/forecast/leaves", "/api/ml/forecast/absences"}:
        return {
            "success": bool(getattr(value, "success", False)),
            "period": getattr(value, "period", None),
            "item_count": len(getattr(value, "items", []) or []),
            **_quality_summary(value),
        }
    if endpoint == "/api/ml/forecast/team-presence":
        teams = getattr(value, "teams", []) or []
        return {
            "success": bool(getattr(value, "success", False)),
            "period": getattr(value, "period", None),
            "team_count": len(teams),
            "risk_distribution": _risk_distribution(teams),
            **_quality_summary(value),
        }
    if endpoint == "/api/ml/forecast/risk-by-employee":
        employees = getattr(value, "employees", []) or []
        return {
            "success": bool(getattr(value, "success", False)),
            "period": getattr(value, "period", None),
            "employee_count": len(employees),
            "risk_distribution": _risk_distribution(employees),
            **_quality_summary(value),
        }
    if endpoint == "/api/ml/forecast/workload":
        workload = getattr(value, "predicted_workload", None)
        return {
            "success": bool(getattr(value, "success", False)),
            "period": getattr(value, "period", None),
            "predicted_workload": getattr(workload, "value", workload),
            "pending_requests_count": int(
                getattr(value, "pending_requests_count", 0) or 0
            ),
            "approved_requests_count": int(
                getattr(value, "approved_requests_count", 0) or 0
            ),
            **_quality_summary(value),
        }
    return {"success": bool(getattr(value, "success", True))}


class _TraceSession:
    def __init__(self, endpoint: str, inputs: dict[str, Any]) -> None:
        self.endpoint = endpoint
        self.inputs = inputs
        self.started = time.perf_counter()
        self.span: Any | None = None
        if os.getenv("PYTEST_CURRENT_TEST") and not os.getenv("BRAINTRUST_TRACE_TESTS"):
            return
        settings = get_settings()
        if settings.braintrust_sample_rate <= 0:
            return
        if (
            settings.braintrust_sample_rate < 1
            and random.random() >= settings.braintrust_sample_rate
        ):
            return
        try:
            braintrust_logger = get_braintrust_logger()
            if braintrust_logger is not None:
                self.span = braintrust_logger.start_span(
                    name=f"ml.endpoint {endpoint}",
                    type="task",
                    input=inputs,
                    tags=["ml-service", endpoint.split("/")[3], "endpoint"],
                    metadata={
                        "endpoint": endpoint,
                        "environment": settings.braintrust_env,
                        "service": "ml-service",
                    },
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Braintrust span start failed (%s)", type(exc).__name__)
            self.span = None

    def finish(self, output: Any) -> None:
        self._complete(output=summarize_output(self.endpoint, output), error_type=None)

    def fail(self, exc: BaseException) -> None:
        self._complete(output=None, error_type=type(exc).__name__)

    def _complete(self, *, output: dict[str, Any] | None, error_type: str | None) -> None:
        if self.span is None:
            return
        latency_ms = round((time.perf_counter() - self.started) * 1000.0, 3)
        try:
            self.span.log(
                output=redact_value(output) if output is not None else None,
                error=error_type,
                metrics={"latency_ms": latency_ms},
                metadata={
                    "status": "error" if error_type else "success",
                    "error_type": error_type,
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Braintrust span logging failed (%s)", type(exc).__name__)
        finally:
            try:
                self.span.end()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Braintrust span close failed (%s)", type(exc).__name__)


def traced_ml_endpoint(endpoint: EndpointResolver):
    """Decorate a FastAPI endpoint without changing its public signature."""

    def decorator(function):
        signature = inspect.signature(function)
        type_hints = get_type_hints(function)
        resolved_signature = signature.replace(
            parameters=[
                parameter.replace(
                    annotation=type_hints.get(name, parameter.annotation),
                )
                for name, parameter in signature.parameters.items()
            ],
            return_annotation=type_hints.get("return", signature.return_annotation),
        )

        def resolve(args: tuple[Any, ...], kwargs: dict[str, Any]) -> tuple[str, dict[str, Any]]:
            bound = signature.bind_partial(*args, **kwargs)
            arguments = bound.arguments
            resolved = endpoint(arguments) if callable(endpoint) else endpoint
            return resolved, _safe_inputs(arguments)

        if inspect.iscoroutinefunction(function):

            @wraps(function)
            async def async_wrapper(*args, **kwargs):
                resolved, inputs = resolve(args, kwargs)
                trace = _TraceSession(resolved, inputs)
                try:
                    result = await function(*args, **kwargs)
                except Exception as exc:
                    trace.fail(exc)
                    raise
                trace.finish(result)
                return result

            async_wrapper.__signature__ = resolved_signature
            return async_wrapper

        @wraps(function)
        def sync_wrapper(*args, **kwargs):
            resolved, inputs = resolve(args, kwargs)
            trace = _TraceSession(resolved, inputs)
            try:
                result = function(*args, **kwargs)
            except Exception as exc:
                trace.fail(exc)
                raise
            trace.finish(result)
            return result

        sync_wrapper.__signature__ = resolved_signature
        return sync_wrapper

    return decorator
