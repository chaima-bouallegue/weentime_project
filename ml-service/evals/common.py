"""Shared Braintrust dataset and experiment helpers for ML evaluations."""
from __future__ import annotations

import csv
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from app.core.config import get_settings
from app.observability.redaction import redact_value

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class EvaluationDataset:
    rows: list[dict[str, Any]]
    source: str
    dataset_name: str


def _as_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        return dict(dumped) if isinstance(dumped, Mapping) else {}
    if hasattr(value, "__dict__"):
        return dict(value.__dict__)
    return {}


def _flatten_dataset_row(value: Any) -> dict[str, Any]:
    row = _as_mapping(value)
    input_value = _as_mapping(row.get("input"))
    expected_value = row.get("expected", row.get("output"))
    expected = _as_mapping(expected_value)
    flattened = {**input_value, **expected}
    if not expected and expected_value is not None:
        flattened["expected"] = expected_value
    metadata = _as_mapping(row.get("metadata"))
    if "case_id" in metadata and "case_id" not in flattened:
        flattened["case_id"] = metadata["case_id"]
    return flattened


def _load_local_csv(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def load_evaluation_dataset(
    dataset_name: str,
    fallback_csv: Path,
    *,
    force_local: bool = False,
) -> EvaluationDataset:
    settings = get_settings()
    project_configured = bool(
        settings.braintrust_project_id or settings.braintrust_project_name
    )
    if not force_local and settings.braintrust_api_key and project_configured:
        try:
            import braintrust  # type: ignore

            dataset = braintrust.init_dataset(
                project=settings.braintrust_project_name or None,
                project_id=settings.braintrust_project_id or None,
                name=dataset_name,
                api_key=settings.braintrust_api_key,
            )
            rows = [
                flattened
                for item in dataset
                if (flattened := _flatten_dataset_row(item))
            ]
            if rows:
                return EvaluationDataset(
                    rows=rows,
                    source=f"braintrust:{dataset_name}",
                    dataset_name=dataset_name,
                )
            logger.warning(
                "Braintrust dataset %s is empty; using local fixture",
                dataset_name,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Braintrust dataset %s unavailable; using local fixture (%s)",
                dataset_name,
                type(exc).__name__,
            )

    return EvaluationDataset(
        rows=_load_local_csv(fallback_csv),
        source=f"csv:{fallback_csv.as_posix()}",
        dataset_name=dataset_name,
    )


def publish_evaluation(
    *,
    dataset: EvaluationDataset,
    experiment_prefix: str,
    model_source: str,
    cases: list[dict[str, Any]],
    aggregate_scores: dict[str, float],
    aggregate_metrics: dict[str, float],
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.braintrust_api_key:
        return {"status": "skipped", "reason": "missing_braintrust_api_key"}
    if not settings.braintrust_project_id and not settings.braintrust_project_name:
        return {"status": "skipped", "reason": "missing_braintrust_project"}

    try:
        import braintrust  # type: ignore
        from braintrust.git_fields import GitMetadataSettings  # type: ignore

        experiment = braintrust.init(
            project=settings.braintrust_project_name or None,
            project_id=settings.braintrust_project_id or None,
            experiment=(
                f"{experiment_prefix}-"
                f"{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
            ),
            description=f"WeenTime ML evaluation for {dataset.dataset_name}",
            api_key=settings.braintrust_api_key,
            metadata={
                "environment": settings.braintrust_env,
                "dataset": dataset.dataset_name,
                "dataset_source": dataset.source,
                "model_source": model_source,
                "service": "ml-service",
            },
            git_metadata_settings=GitMetadataSettings(collect="none"),
        )
        for index, case in enumerate(cases, start=1):
            experiment.log(
                id=f"case-{index:04d}",
                input=redact_value(case.get("input", {})),
                output=redact_value(case.get("output", {})),
                expected=redact_value(case.get("expected", {})),
                scores={
                    key: float(value)
                    for key, value in dict(case.get("scores", {})).items()
                },
                metadata={
                    "dataset": dataset.dataset_name,
                    "dataset_source": dataset.source,
                    "model_source": model_source,
                },
            )
        experiment.log(
            id="aggregate-summary",
            input={"dataset": dataset.dataset_name, "rows": len(cases)},
            output={"model_source": model_source},
            expected={"evaluation": experiment_prefix},
            scores={key: float(value) for key, value in aggregate_scores.items()},
            metrics={key: float(value) for key, value in aggregate_metrics.items()},
            metadata={
                "dataset_source": dataset.source,
                "environment": settings.braintrust_env,
            },
        )
        experiment.flush()
        summary = experiment.summarize()
        return {
            "status": "sent",
            "experiment_id": getattr(experiment, "id", None),
            "experiment_name": getattr(experiment, "name", None),
            "summary": str(summary),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Braintrust experiment upload failed; local metrics remain valid (%s)",
            type(exc).__name__,
        )
        return {
            "status": "skipped",
            "reason": f"braintrust_unavailable:{type(exc).__name__}",
        }
