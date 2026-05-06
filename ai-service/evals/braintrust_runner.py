from __future__ import annotations

import os
import subprocess
from datetime import datetime, timezone
from typing import Any


def _git_branch() -> str | None:
    try:
        result = subprocess.run(["git", "branch", "--show-current"], check=False, capture_output=True, text=True)
        return result.stdout.strip() or None
    except Exception:
        return None


def maybe_send_to_braintrust(results: list[dict[str, Any]], *, dataset_name: str, force: bool = False) -> dict[str, Any]:
    enabled = force or os.getenv("BRAINTRUST_ENABLED", "").lower() in {"1", "true", "yes", "on"}
    api_key = os.getenv("BRAINTRUST_API_KEY")
    if not enabled:
        return {"status": "skipped", "reason": "braintrust_not_enabled"}
    if not api_key:
        return {"status": "skipped", "reason": "missing_braintrust_api_key"}

    try:
        import braintrust  # type: ignore
        from braintrust.git_fields import GitMetadataSettings  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return {"status": "skipped", "reason": f"braintrust_sdk_unavailable: {exc}"}

    try:
        experiment = braintrust.init(
            project=os.getenv("BRAINTRUST_PROJECT_NAME", "WeenTime AI Copilot"),
            project_id=os.getenv("BRAINTRUST_PROJECT_ID") or None,
            experiment=f"local-evals-{dataset_name}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
            description="WeenTime AI Copilot multilingual regression suite",
            api_key=api_key,
            metadata={
                "env": os.getenv("BRAINTRUST_ENV", os.getenv("APP_ENV", "development")),
                "git_branch": _git_branch(),
                "dataset": dataset_name,
                "router_version": "ai-12-braintrust-real",
            },
            git_metadata_settings=GitMetadataSettings(collect="none"),
        )
        for item in results:
            experiment.log(
                input={"id": item.get("id"), "language": item.get("language"), "role": item.get("role")},
                output=item.get("actual"),
                expected=item.get("expected"),
                scores={key: 1.0 if value else 0.0 for key, value in item.get("scores", {}).items()},
                metadata={
                    "env": os.getenv("BRAINTRUST_ENV", os.getenv("APP_ENV", "development")),
                    "git_branch": _git_branch(),
                    "dataset": dataset_name,
                    "router_version": "ai-12-braintrust-real",
                },
                id=str(item.get("id") or ""),
            )
        experiment.flush()
        summary = experiment.summarize()
        return {
            "status": "sent",
            "message": "Braintrust experiment created/sent",
            "count": len(results),
            "experiment_id": getattr(experiment, "id", None),
            "experiment_name": getattr(experiment, "name", None),
            "summary": str(summary),
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": "skipped", "reason": f"braintrust_send_failed: {exc}"}
