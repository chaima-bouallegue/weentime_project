from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from evals.scorers import THRESHOLDS


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    scorer_names = sorted({name for item in results for name in item.get("scores", {})})
    metrics = {}
    for name in scorer_names:
        values = [bool(item["scores"][name]) for item in results if name in item.get("scores", {})]
        metrics[name] = sum(values) / len(values) if values else 0.0
    return {
        "total": len(results),
        "metrics": metrics,
        "thresholds": THRESHOLDS,
        "passed_thresholds": {
            name: metrics.get(name, 0.0) >= threshold for name, threshold in THRESHOLDS.items()
        },
        "failures": [item for item in results if not all(item.get("scores", {}).values())],
    }


def write_report(results: list[dict[str, Any]], *, output_dir: str | Path = "evals/reports") -> Path:
    target_dir = Path(output_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / "local_eval_report.json"
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summarize(results),
        "results": results,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
